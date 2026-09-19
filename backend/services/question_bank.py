# -*- coding: utf-8 -*-
"""
考公题库：加载、校验、抽样、按题干反查。

**本模块不发任何网络请求。** 命题与阅卷都不再调用 AI：
题库由 scripts/gen_exam_bank.py 一次性生成、固化在 backend/data/questions.json，
运行时只读不写。

── 判档为什么从"问模型"改成"查题库" ──────────────────────────
原先每题的三档等级（full / half / zero）由 AI 判，现在写在题库里：
  best             唯一满分项
  half             半分项（可行但次优），逻辑题为空
  optionComments   每个选项一句点评，选谁就给谁看
代价是判档不再"懂"考生的自由发挥——但考生的作答本来就只有四个选项可选，
判档的输入空间是有限的，穷举得过来，本来就不需要模型。

── 为什么按题干反查 ────────────────────────────────────────
阅卷请求会把原题回传（后端不持久化，没有别的办法知道这是哪张卷子）。
questions.json 里多带了 half 与 optionComments，而 backend/models.py 的
ExamQuestion 是 extra="forbid"——多一个字段整个请求 422。
所以契约一个字不改，**用题干当主键**反查题库，把这两项取回来。
题干撞车会让反查拿错答案，因此题库加载与生成脚本都强制题干唯一。

反查还有一层好处：答案键（best）以题库为准，不再采信客户端回传的那份。
"""
from __future__ import annotations

import json
import logging
import os
import random
from typing import Any, Dict, List, Optional

from models import EXAM_COMPOSITION, EXAM_TYPE_LABELS
from prompts import FALLBACK_EXAM_QUESTIONS

logger = logging.getLogger(__name__)

BANK_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "questions.json"
)

# 选项 id 的固定顺序。与 scripts/gen_exam_bank.py、prompts 的兜底题库一致
OPT_IDS = ("opt_a", "opt_b", "opt_c", "opt_d")

_BANK: Optional[List[Dict[str, Any]]] = None
_BY_STEM: Dict[str, Dict[str, Any]] = {}
_SOURCE = "unloaded"


def normalize_stem(text: Any) -> str:
    """题干归一化：抹掉全部空白。模型换行与空格的习惯不稳定，比对前先抹平。"""
    return "".join(str(text or "").split())


def _check(entry: Any, seen_stems: set) -> List[str]:
    """逐条校验。返回问题列表，空列表表示合格。"""
    if not isinstance(entry, dict):
        return ["不是对象"]

    problems: List[str] = []

    if entry.get("type") not in EXAM_TYPE_LABELS:
        problems.append("题型非法：{!r}".format(entry.get("type")))

    stem = str(entry.get("stem") or "").strip()
    if not stem:
        problems.append("题干为空")
    elif normalize_stem(stem) in seen_stems:
        # 反查靠题干当主键，重复会让它拿错那一条的答案键
        problems.append("题干与已有题目重复")

    options = entry.get("options")
    if not isinstance(options, list) or len(options) != 4:
        problems.append("选项数应为 4，实为 {}".format(
            len(options) if isinstance(options, list) else "非数组"))
        return problems

    ids = [str((o or {}).get("id") or "") for o in options]
    if ids != list(OPT_IDS):
        problems.append("选项 id 应依次为 {}，实为 {}".format(list(OPT_IDS), ids))
    for idx, opt in enumerate(options):
        if not isinstance(opt, dict) or not str(opt.get("text") or "").strip():
            problems.append("第 {} 个选项文案为空".format(idx + 1))

    best = str(entry.get("best") or "")
    if best not in ids:
        problems.append("best={!r} 不在选项内".format(best))

    half = entry.get("half")
    if half is None:
        half = []
    if not isinstance(half, list):
        problems.append("half 不是数组")
        half = []
    if best in half:
        problems.append("best 同时出现在 half 里")
    unknown = [h for h in half if h not in ids]
    if unknown:
        problems.append("half 含未知选项：{}".format(unknown))

    comments = entry.get("optionComments")
    if comments is not None and not isinstance(comments, dict):
        problems.append("optionComments 不是对象")

    return problems


def _clean(entry: Dict[str, Any]) -> Dict[str, Any]:
    """裁剪成固定结构。多余字段一律丢掉——题库是脚本产出，接口只认这几项。"""
    comments = entry.get("optionComments")
    if not isinstance(comments, dict):
        comments = {}
    half = entry.get("half")
    if not isinstance(half, list):
        half = []
    return {
        "id": str(entry.get("id") or ""),
        "type": str(entry["type"]),
        "stem": str(entry["stem"]).strip(),
        "options": [
            {"id": str(o["id"]), "text": str(o["text"]).strip()}
            for o in entry["options"]
        ],
        "best": str(entry.get("best") or ""),
        "half": [str(h) for h in half],
        "optionComments": {str(k): str(v) for k, v in comments.items() if str(v).strip()},
        "rationale": str(entry.get("rationale") or "").strip(),
    }


def _seed_bank() -> List[Dict[str, Any]]:
    """
    内置兜底题库，转成题库格式。

    prompts.FALLBACK_EXAM_QUESTIONS 原本是"AI 命题失败时的兜底"，题库化之后
    身份变了：它是题库的**种子**，保证 questions.json 缺失或读坏时考试照样开得起来。
    它没有 half / optionComments（写的时候还没这套东西），
    判档退化成"对就是对，错就是错"，可以接受。
    """
    out = []
    for q in FALLBACK_EXAM_QUESTIONS:
        out.append(_clean({
            "id": "",
            "type": q["type"],
            "stem": q["stem"],
            "options": q["options"],
            "best": q["best"],
            "half": [],
            "optionComments": {},
            "rationale": q.get("rationale", ""),
        }))
    return out


def load_bank() -> List[Dict[str, Any]]:
    """加载并校验题库。**永不抛异常、永不返回空列表**，结果缓存。"""
    global _BANK, _BY_STEM, _SOURCE

    if _BANK is not None:
        return _BANK

    # 初值必须是 []：题库文件不存在时（首次部署、还没跑生成脚本）
    # 走的是 except 分支，那个分支不会给 raw 赋值
    raw: Any = []
    problems: List[str] = []

    try:
        with open(BANK_PATH, "r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except (IOError, OSError, ValueError) as exc:
        problems.append("题库文件不可用：{}".format(exc))
    else:
        if isinstance(payload, dict):
            raw = payload.get("questions")
        elif isinstance(payload, list):
            raw = payload
        if not isinstance(raw, list):
            problems.append("题库里没有 questions 数组")
            raw = []

    entries: List[Dict[str, Any]] = []
    seen_stems: set = set()
    for idx, item in enumerate(raw):
        why = _check(item, seen_stems)
        if why:
            problems.append("第 {} 条：{}".format(idx + 1, "；".join(why)))
            continue
        seen_stems.add(normalize_stem(item["stem"]))
        entries.append(_clean(item))

    source = "bank"
    if not entries:
        # 一条合格的都没有：题库缺失、读坏，或全被校验拦下。
        # 这里绝不能空手而归——空题库等于开不了考。
        problems.append("题库为空，改用内置兜底题库（prompts.FALLBACK_EXAM_QUESTIONS）")
        entries = _seed_bank()
        source = "seed"

    for why in problems:
        logger.warning("[题库] %s", why)
    if source == "bank":
        counts: Dict[str, int] = {}
        for entry in entries:
            counts[entry["type"]] = counts.get(entry["type"], 0) + 1
        logger.info("[题库] 已加载 %s 道：%s", len(entries), counts)

    _BANK = entries
    _BY_STEM = {normalize_stem(e["stem"]): e for e in entries}
    _SOURCE = source
    return _BANK


def find_by_stem(stem: str) -> Optional[Dict[str, Any]]:
    """按题干反查题库条目。查不到返回 None（调用方退化为"对错判定"）。"""
    load_bank()
    return _BY_STEM.get(normalize_stem(stem))


def sample_paper() -> List[Dict[str, Any]]:
    """
    按 EXAM_COMPOSITION 抽一张卷子：题型顺序与题量严格对齐权重表。

    题型必须按 4 逻辑 / 3 情商 / 3 对策的顺序拼，因为**分值是按题号绑定的**
    （models.EXAM_WEIGHT_BY_INDEX），题型一旦串位，分值就跟着串。

    某个题型的存量不够时重复取用并告警：同一道题在一张卷子里出现两次很别扭，
    但比"卷子结构不合法"好得多——后者会让整卷算分崩掉。
    """
    bank = load_bank()
    pools: Dict[str, List[Dict[str, Any]]] = {}
    for entry in bank:
        pools.setdefault(entry["type"], []).append(entry)

    picked: List[Dict[str, Any]] = []
    for qtype, need, _weight in EXAM_COMPOSITION:
        pool = pools.get(qtype) or []
        if not pool:
            logger.error("[题库] 题型 %s 一道题都没有，无法组卷", qtype)
            return []
        if len(pool) < need:
            logger.warning(
                "[题库] 题型 %s 只有 %s 道，本卷需要 %s 道，将重复取用。"
                "该补的是 gen_exam_bank.py 的 BANK_QUOTA，不是抽样逻辑",
                EXAM_TYPE_LABELS[qtype], len(pool), need,
            )
            pool = pool + [pool[i % len(pool)] for i in range(need - len(pool))]
        picked.extend(random.sample(pool, need))

    return picked


def bank_summary() -> Dict[str, Any]:
    """题库概况。给 /health 和启动日志用，出问题时一眼看出加载的是哪一份。"""
    load_bank()
    counts: Dict[str, int] = {}
    for entry in _BANK or []:
        counts[entry["type"]] = counts.get(entry["type"], 0) + 1
    return {
        "path": BANK_PATH,
        "source": _SOURCE,
        "total": len(_BANK or []),
        "counts": counts,
    }
