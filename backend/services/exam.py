# -*- coding: utf-8 -*-
"""
考务服务：组卷、判档、算分、分配。

**本模块不发任何网络请求，也不会失败。** 命题与阅卷都不再调用 AI：
卷子从 services/question_bank.py 的题库里抽，判档查题库里写好的答案键。

分工仍然和从前一样，只是"AI"那一格换成了"题库"：
    题库出题、题库判档；Python 算分、Python 分配。
分值权重按题号硬编码在 models.EXAM_COMPOSITION 里，
所以无论抽到哪张卷子，总分都被锁死在 [0, 100] 的包络内，
分配结果也完全由 Python 的红线决定。

判档只有三档（full / half / zero），依据是题库里每道题的：
    best             唯一满分项
    half             半分项（可行但次优），逻辑题为空
    optionComments   每个选项一句点评，选谁就给谁看
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from models import (
    EXAM_BONUS_MAX,
    EXAM_COMPOSITION,
    EXAM_GRADE_FACTORS,
    EXAM_GRADE_LABELS,
    EXAM_MAX_SCORE,
    EXAM_QUESTION_COUNT,
    EXAM_TIERS,
    EXAM_TYPE_BY_INDEX,
    EXAM_TYPE_LABELS,
    EXAM_WEIGHT_BY_INDEX,
    ExamEvaluateRequest,
)
from prompts import FALLBACK_EXAM_QUESTIONS
from services.question_bank import find_by_stem, sample_paper

logger = logging.getLogger(__name__)

# 每种题型的单题分值，用于点评时判"哪一条线拖了后腿"：
# 丢了 15 分的对策题，比丢了 5 分的逻辑题严重得多。
_TYPE_WEIGHT = {t: w for t, _count, w in EXAM_COMPOSITION}


# ══════════════════════════════════════════════════════════════════
# 组卷
# ══════════════════════════════════════════════════════════════════

def _normalize_questions(raw: Any) -> Tuple[Optional[List[Dict[str, Any]]], str]:
    """
    校验并归一化题库抽出来的题。

    这里卡得很死——题目数量、选项数量、题型顺序、best 必须落在选项内，
    任何一项不合格就整卷作废换兜底。理由：这套卷子的分值权重是**按题号**绑定的，
    少一道题就会让后面所有题的题型与分值串位，与其将错就错，不如整卷重来。

    @returns (题目列表 或 None, 不合格的具体原因)

    原因必须具体到"第几题、哪一项"，否则线上真撞上时只能对着一个 None 猜。
    """
    if not isinstance(raw, list):
        return None, f"questions 不是数组（收到 {type(raw).__name__}）"
    if len(raw) != EXAM_QUESTION_COUNT:
        return None, f"题目数量应为 {EXAM_QUESTION_COUNT} 道，实收 {len(raw)} 道"

    questions: List[Dict[str, Any]] = []
    for idx, item in enumerate(raw):
        no = idx + 1
        if not isinstance(item, dict):
            return None, f"第 {no} 题不是对象"

        options = item.get("options")
        if not isinstance(options, list):
            return None, f"第 {no} 题缺少 options 数组"
        if len(options) != 4:
            return None, f"第 {no} 题应为 4 个选项，实为 {len(options)} 个"

        norm_options = []
        for opt in options:
            if not isinstance(opt, dict) or not opt.get("id") or not opt.get("text"):
                return None, f"第 {no} 题有选项缺少 id 或 text"
            norm_options.append({"id": str(opt["id"]), "text": str(opt["text"]).strip()})

        ids = [o["id"] for o in norm_options]
        if len(set(ids)) != 4:
            return None, f"第 {no} 题的选项 id 有重复：{ids}"

        best = item.get("best")
        if best not in ids:
            return None, f"第 {no} 题的 best={best!r} 不在选项 {ids} 内"

        stem = str(item.get("stem") or "").strip()
        if not stem:
            return None, f"第 {no} 题题干为空"

        questions.append({
            "id": f"q{idx + 1}",                       # 题号强制重排，不信题库里的编号
            "type": EXAM_TYPE_BY_INDEX[idx],           # 题型按题号覆写，与权重表对齐
            "stem": stem,
            "options": norm_options,
            "best": best,
            "rationale": str(item.get("rationale") or "").strip(),
        })

    return questions, ""


def generate_exam_questions() -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    抽一套 5 道题的试卷。**本函数不会抛异常。**

    @returns (题目列表, 元信息)。source 为 bank（题库正常）或 emergency（题库不可用）。
    """
    questions, why = _normalize_questions(sample_paper())
    if questions is None:
        reason = f"题库组卷结果不符合试卷结构：{why}。已启用内置兜底题库"
        logger.error("%s", reason)
        questions, why2 = _normalize_questions(FALLBACK_EXAM_QUESTIONS)
        if questions is None:
            # 到这一步只可能是 prompts 里的兜底题库被改坏了，让它炸在明处
            raise RuntimeError(f"内置兜底题库也不符合试卷结构：{why2}")
        return questions, {"source": "emergency", "reason": reason}

    return questions, {"source": "bank", "reason": ""}


# ══════════════════════════════════════════════════════════════════
# 判档
# ══════════════════════════════════════════════════════════════════

def _grade_paper(
    questions: List[Dict[str, Any]],
    choice_of: Dict[str, str],
) -> Tuple[Dict[str, str], Dict[str, str]]:
    """
    按题库判档。返回 (每题等级, 每题点评)。

    答案键以**题库**为准，不采信回传的那份 best——客户端手里的 best 是可以改的，
    虽然单人本地游戏不存在对抗性，但既然题库就在手边，没有理由不用它。

    查不到题库条目时退化为"对错判定"（选中 best 即满分，否则零分）：
    不会虚高，也不会冤枉人。未作答一律零分。
    """
    grades: Dict[str, str] = {}
    comments: Dict[str, str] = {}

    for q in questions:
        chosen = choice_of.get(q["id"], "")
        entry = find_by_stem(q["stem"])
        best = entry["best"] if entry else q["best"]
        half = entry["half"] if entry else []

        if not chosen:
            grades[q["id"]] = "zero"
            continue
        if chosen == best:
            grades[q["id"]] = "full"
        elif chosen in half:
            grades[q["id"]] = "half"
        else:
            grades[q["id"]] = "zero"

        if entry:
            comment = (entry.get("optionComments") or {}).get(chosen)
            if comment:
                comments[q["id"]] = comment

    return grades, comments


# 卷面满分，也就是"零加分"的那个总分上限。
# 伯乐加分已成历史：它存在的唯一理由是"基础分上限 95、满分 100"之间的那道
# 5 分缺口——全对的人必须够得着 100，所以由伯乐酌情补上。
# 改成 5 题 × 20 分之后卷面本身就是 100 分，缺口没了，"酌情"也就没有位置了：
# 再加一个加分项，成绩单上印的满分要写成 105。
# 常量与响应字段都留着（理由见 models.EXAM_BONUS_MAX），值恒为 0，
# 所以下面凡是加它的地方，都等于不加——留着是为了让"总分怎么来的"
# 这件事在代码里仍然只有一条式子。
# 保留的那条式子是 `总分 = 卷面分 + EXAM_BONUS_MAX`，而后者是 0。

# 按题型给的进补建议。挑失分率最高、且单题分值最重的那一条线来说。
# 单题分值统一成 20 之后"更重的那条线"已经不存在了（三条线权重相同），
# 并列时按题型在卷面上的先后取——这不是权衡，只是让结果确定下来。
_WEAK_HINTS = {
    "logic": "行测逻辑失分偏多。判断推理是硬功夫，回去把充分条件与必要条件再过一遍。",
    "eq": "职场情商那几道答得太直。机关里的话，有时候得拐个弯说。",
    "field": "基层对策题欠火候。这一类事下去之后会天天找上门，现在补还来得及。",
}


def _build_grade_comment(
    questions: List[Dict[str, Any]],
    grades: Dict[str, str],
) -> str:
    """
    组装阅卷人评语。

    原先这句由 AI 写，现在只能是拼的——但拼不等于敷衍：
    先报三档的分布，再指出拖后腿的那条线，最后交代伯乐加分从哪来。
    玩家看完这一句，应当知道自己下一步该补什么。
    """
    tally = {"full": 0, "half": 0, "zero": 0}
    stats: Dict[str, Dict[str, float]] = {}

    for idx, q in enumerate(questions):
        grade = grades[q["id"]]
        tally[grade] += 1
        qtype = EXAM_TYPE_BY_INDEX[idx]
        bucket = stats.setdefault(qtype, {"earned": 0.0, "total": 0})
        bucket["earned"] += EXAM_GRADE_FACTORS[grade]
        bucket["total"] += 1

    # 题数不写死在这里：卷子是几道题由 EXAM_COMPOSITION 决定，
    # 评语跟着实际发下去的那张卷子说话，改了配比不会留下"十道题"这种旧话
    lines = ["共 {} 道题，满分 {} 道，半分 {} 道，零分 {} 道。".format(
        len(questions), tally["full"], tally["half"], tally["zero"])]

    # 失分率最高的那条线（并列时按卷面顺序取前一条）。全对则不点评
    weakest, worst = None, 1.0
    for qtype, bucket in stats.items():
        rate = bucket["earned"] / bucket["total"]
        if rate < worst - 1e-9 or (abs(rate - worst) < 1e-9
                                   and weakest is not None
                                   and _TYPE_WEIGHT[qtype] > _TYPE_WEIGHT[weakest]):
            weakest, worst = qtype, rate
    if weakest and worst < 1.0:
        lines.append(_WEAK_HINTS[weakest])

    # 伯乐加分恒为 0，这句话永远不出现（见 BONUS 那段）。留着它是为了
    # 万一哪天真要恢复加分，不至于连句子都重写——但它现在不该亮。

    return "".join(lines)


# ══════════════════════════════════════════════════════════════════
# 算分与分配（纯 Python，不看任何人脸色）
# ══════════════════════════════════════════════════════════════════

def assign_tier(score: float) -> Dict[str, Any]:
    """
    按硬编码红线分配单位。EXAM_TIERS 已按分数从高到低排列，取第一个满足的。

    @param score 原始分，**必须带小数一起传进来，不要先取整**。
                 红线卡的是真实分值：84.5 进不了 85 那档的核心部门。
                 先取整再比，等于让"差 0.5 分"的人靠舍入换一个单位。
    """
    for tier in EXAM_TIERS:
        if score >= tier["min_score"]:
            return tier
    return EXAM_TIERS[-1]  # 不可达：最后一条红线是 0


def _build_result(
    questions: List[Dict[str, Any]],
    choice_of: Dict[str, str],
    grades: Dict[str, str],
    grade_comment: str,
    comments: Dict[str, str],
) -> Dict[str, Any]:
    """把等级换算成分数，并组装成绩单。得分只在这里产生。"""
    review: List[Dict[str, Any]] = []
    breakdown: Dict[str, Dict[str, float]] = {}
    base_score = 0.0

    for idx, q in enumerate(questions):
        qtype = EXAM_TYPE_BY_INDEX[idx]
        weight = EXAM_WEIGHT_BY_INDEX[idx]
        chosen = choice_of.get(q["id"], "")
        grade = grades[q["id"]]
        earned = weight * EXAM_GRADE_FACTORS[grade]
        base_score += earned

        bucket = breakdown.setdefault(
            qtype, {"typeLabel": EXAM_TYPE_LABELS[qtype], "count": 0, "fullScore": 0, "earned": 0.0}
        )
        bucket["count"] += 1
        bucket["fullScore"] += weight
        bucket["earned"] += earned

        text_of = {o["id"]: o["text"] for o in q["options"]}
        review.append({
            "questionId": q["id"],
            "index": idx + 1,
            "typeLabel": EXAM_TYPE_LABELS[qtype],
            "stem": q["stem"],
            "yourChoice": chosen,
            "yourChoiceText": text_of.get(chosen, "（未作答）"),
            "bestChoice": q["best"],
            "bestChoiceText": text_of.get(q["best"], ""),
            "grade": grade,
            "gradeLabel": EXAM_GRADE_LABELS[grade],
            "weight": weight,
            "earned": earned,
            "comment": comments.get(q["id"], ""),
            "rationale": q.get("rationale", ""),
        })

    # 总分 = 卷面分（伯乐加分恒为 0，见 BONUS），夹到 [0, 100] 兜底。
    #
    # 原始分**不取整**，原样交给 assign_tier，红线按真实分值卡。
    # 原先写的是 int(round(...))，而 Python 的 round() 是「银行家舍入」
    # （四舍六入五取偶），实测 59.5 会被舍成 60，于是一个 59.5 分的考生
    # 被抬进了常规局委——差这半分，去的是完全不同的单位。
    #
    # 改成每题 20 分之后，分数只可能是 10 的倍数，X.5 从结构上消失了；
    # 保留"不取整"这条规矩是为了它不回来——配比一改（比如又出现奇数权重）
    # 就又会遇上同一个坑，而那时候没人会记得这里为什么不能 round。
    score = round(max(0.0, min(float(EXAM_MAX_SCORE), base_score + EXAM_BONUS_MAX)), 1)
    tier = assign_tier(score)

    return {
        "score": score,
        "baseScore": round(base_score, 1),
        # 契约字段，恒为 0。前端按 result.bonus > 0 决定印不印那一行，
        # 字段撤掉会连累成绩单，所以留着（理由见 models.EXAM_BONUS_MAX）
        "bonus": EXAM_BONUS_MAX,
        "maxScore": EXAM_MAX_SCORE,
        "unitType": tier["unit_type"],
        "unit": tier["unit"],
        "position": tier["position"],
        "comment": tier["comment"],
        "aiComment": grade_comment,
        "attributeBonus": dict(tier["attribute_bonus"]),
        "breakdown": list(breakdown.values()),
        "review": review,
    }


def evaluate_exam(request: ExamEvaluateRequest) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    阅卷并出具成绩单。**本函数不会抛异常。**

    @returns (成绩单, 元信息)。source 为 bank 或 emergency。
    """
    questions = [q.model_dump() for q in request.questions]
    choice_of = {a.question_id: a.choice for a in request.answers}

    # 第二道防线。ExamEvaluateRequest 已经会 422 掉对不上试卷的作答，
    # 正常走 HTTP 到不了这里；但本函数也允许被直接调用（脚本、将来的重考功能），
    # 那时宁可把脏作答降级成"未作答"判零分，也不要拿一个不存在的选项去查题库。
    for q in questions:
        if choice_of.get(q["id"]) not in {o["id"] for o in q["options"]}:
            choice_of.pop(q["id"], None)

    grades, comments = _grade_paper(questions, choice_of)
    grade_comment = _build_grade_comment(questions, grades)
    result = _build_result(questions, choice_of, grades, grade_comment, comments)

    logger.info(
        "阅卷完成：得分 %s（卷面 %s），分配 %s",
        result["score"], result["baseScore"], result["unit"],
    )
    return result, {"source": "bank", "reason": ""}
