# -*- coding: utf-8 -*-
"""
考公题库批量生成脚本（一次性，归档用）。

**玩家运行时绝不调用本脚本、也绝不调用 API。** 它只负责把题备齐，
产出固化到 backend/data/questions.json，之后就可以归档了。

跑法（**加 --yes 才会真的花钱**）：
    cd D:/code_game/scripts
    python gen_exam_bank.py --dry-run            # 只打印计划与预估，不发请求
    python gen_exam_bank.py --yes                # 真跑
    python gen_exam_bank.py --yes --only eq      # 只补某一题型
    python gen_exam_bank.py --yes --force        # 全部重跑

── 为什么要这份题库 ────────────────────────────────────────
考公原先走 AI 实时命题 + AI 阅卷，一次考试要等半分钟到一分钟。
现在命题与阅卷全部本地化：题库固化成 JSON，判档规则也写死在题库里
（每题带 best / half / optionComments 三项），后端只做「抽样组卷 + 按档算分」。

── 与事件库脚本的差别 ──────────────────────────────────────
事件池的产出交给前端（localEvents.generated.js），题库的产出交给后端
（data/questions.json）。原因是考公的**分值权重按题号硬编码在后端**
（models.EXAM_COMPOSITION），组卷必须与权重表对齐，放在后端才不会串位。

判档从三档改成了「题库携带」：
  best             唯一满分项
  half             半分项（可行但次优），逻辑题必须为空
  optionComments   每个选项一句点评，选谁就给谁看，替代原来的 AI 评语
"""

import argparse
import json
import os
import sys
import time

# 复用后端的调用管道与配置。必须先垫 sys.path，否则 import 不到 backend 下的模块。
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.normpath(os.path.join(_HERE, "..", "backend"))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from config import get_settings                                  # noqa: E402
from models import EXAM_COMPOSITION, EXAM_TYPE_LABELS            # noqa: E402
from prompts import FALLBACK_EXAM_QUESTIONS                      # noqa: E402
from services.deepseek import (                                  # noqa: E402
    _safe_error,
    call_json,
    parse_json_object,
)

OUT_DIR = os.path.join(_HERE, "out")
BANK_DIR = os.path.join(_BACKEND, "data")
BANK_FILE = os.path.join(BANK_DIR, "questions.json")

# ══════════════════════════════════════════════════════════════════
# 题库有两份，**必须同源**
# ══════════════════════════════════════════════════════════════════
# 1.0.0 之后玩家路径走的是前端那一份：考公整条链子搬进了浏览器
# （frontend/src/game/examPaper.js），线上发的是静态站，后端根本不在链子上。
# 后端那份留着给本地开发与 /api/exam/* 手动调用，也当"权威副本"。
#
# 两份由**同一个函数、同一次 dump** 产出，所以不会各写各的；
# 但人手改一份就会漂移，因此这里一次写两处之外，
# 探针 probe_exam_local.mjs 还会**逐字节**比对两份文件，谁改漏了都会红。
FRONT_BANK_DIR = os.path.normpath(os.path.join(_HERE, "..", "frontend", "src", "mock"))
FRONT_BANK_FILE = os.path.join(FRONT_BANK_DIR, "questions.json")

# 每题四个选项，id 由序号重排，不采信模型自报的（与 gen_events.py 同理）
OPT_IDS = ("opt_a", "opt_b", "opt_c", "opt_d")

MAX_OPTION_CHARS = 40       # 单个选项文案上限
MAX_STEM_CHARS = 260        # 题干上限（models.ExamQuestion.stem 限 400，留足余量）
MAX_COMMENT_CHARS = 60      # 单条选项点评上限


# ══════════════════════════════════════════════════════════════════
# 任务清单
# ══════════════════════════════════════════════════════════════════

class Task(object):
    def __init__(self, key, qtype, count, rounds):
        self.key = key
        self.qtype = qtype
        self.count = count
        self.rounds = rounds


# 每个题型要备多少道。**这是题库的总量目标，不是要生成的数量**——
# 种子里每个题型已经占了 SEED_COUNT 那几道（见下），脚本只补差额，
# 所以实际的生成量 = 配额 - 种子数，最终落库总量正好等于这里的数字。
#
# 卷面只用 4/3/3，备到 20/15/15 是五倍料。倍数拉这么高是因为
# 抽 4 道逻辑题时"从 20 道里抽"和"从 4 道里抽"，是「每局都不一样」与
# 「每局都长一样」的差别，而玩家会反复开局。上限则受生成成本约束：
# 一道题要模型写题干、四个选项、四条点评和解析，比一条事件贵得多。
BANK_QUOTA = {"logic": 20, "eq": 15, "field": 15}

PER_REQUEST = 3   # 单次请求出几道题。题比事件长（题干+四选项+解析+四条点评），
                  # 一次要太多会撞上输出上限，表现为 JSON 断在半句话上。


def build_tasks():
    tasks = []
    for qtype, quota in BANK_QUOTA.items():
        # 种子里每种题型已经占掉一部分（见 SEED_COUNT），只补差额
        need = max(0, quota - SEED_COUNT.get(qtype, 0))
        rounds = (need + PER_REQUEST - 1) // PER_REQUEST
        for r in range(1, rounds + 1):
            tasks.append(Task(
                key="{}_{}".format(qtype, r),
                qtype=qtype,
                count=min(PER_REQUEST, need - (r - 1) * PER_REQUEST),
                rounds=rounds,
            ))
    return tasks


# 种子里各题型的数量（prompts.FALLBACK_EXAM_QUESTIONS 是照 EXAM_COMPOSITION 写的，
# 所以这里直接从权重表推导，不另抄一份）
SEED_COUNT = {qtype: n for qtype, n, _ in EXAM_COMPOSITION}


# ══════════════════════════════════════════════════════════════════
# 提示词
# ══════════════════════════════════════════════════════════════════

TYPE_BRIEF = {
    "logic": """题型：行测逻辑（每题 5 分，全卷 4 道，是最不值钱也最不能失手的部分）

考的是**可严格论证的判断**：形式逻辑、朴素推理、资料分析。
题材要裹在机关语境里（选点、排班、指标、预算、名额），但**答案必须唯一且可证明**——
给出解析时必须能穷举或推导，不能靠"感觉更合适"。

· best 是唯一正确项，必须能被解析严格证明。
· **half 一律为空数组 []**——逻辑题没有"半分对"，对就是对，错就是错。
· 三个干扰项分别对应三类真实的推理错误（把必要条件当充分条件、把可能当必然、
  算了增长率的加法而非乘法等），不能是凑数的。""",

    "eq": """题型：职场情商（每题 10 分，全卷 3 道）

考的是**分寸**：同一件事，怎么说、跟谁说、说到什么程度。
场景是机关日常的人情与规矩——越级汇报、替领导背锅、同事抢功、老同志摆资格、
饭局上的劝酒、被要求"通融一下"。

· best 是既守住底线又给人留台阶的那一个。
· half 给**1 个**选项：做法不算错，但欠考虑——比如只顾解决事情而没顾全关系，
  或者顾全了关系却留下了程序瑕疵。其余两个为 zero。
· 干扰项要挑**真实的错误思路**：硬顶、和稀泥、越权、私下了结。
  其中至少有一个必须"看起来很爽"，让玩家第一眼想选。""",

    "field": """题型：基层对策（每题 15 分，全卷 3 道，是分值最重的部分）

考的是**突发事件的处置**：群众聚集、事故现场、舆情发酵、上级突击检查、
断水断电断路、政策落地时的最后一公里。

· best 是"先控局、再报告、后处置"的那一个：合法合规，且经得起事后追责。
· half 给**1 个**选项：能应急，但留下后患——比如当场拍板承诺了没权限承诺的事，
  或者把矛盾往后拖。其余两个为 zero。
· 干扰项要对应真实的错误处置：瞒报、乱承诺、硬压、越权表态、把责任推给上级。
· 题目里不得出现具体的死亡人数、群体性事件定性等敏感表述，
  用"二十几个人堵在门口""有人在拍视频"这类白描即可。""",
}

GEN_SYSTEM_PROMPT = """你是省级公务员录用考试命题组的专家，负责为模拟卷命题。
你出的题必须经得起推敲：**最佳选项是唯一正确的，其余三个都是典型错误思路**，
而不是靠语感凑出来的选项。

# 输出格式（绝对强制）
只输出一个 JSON 对象，不要输出任何其他内容。
禁止 markdown 代码块标记（不要出现 ```json 或 ```），禁止任何前言、后记、注释。

{
  "questions": [
    {
      "stem": "题干，交代清楚情境与问题，末尾点明问的是什么",
      "options": [
        { "text": "选项文案" },
        { "text": "选项文案" },
        { "text": "选项文案" },
        { "text": "选项文案" }
      ],
      "best": "opt_c",
      "half": ["opt_b"],
      "rationale": "解析，讲清为什么 best 最优，以及 half 为什么只是 half",
      "optionComments": {
        "opt_a": "选它的人错在哪",
        "opt_b": "它可行，但差在哪一步",
        "opt_c": "为什么它是最优解",
        "opt_d": "它错在哪"
      }
    }
  ]
}

# 硬性规则（违反即整题作废）
1. **每题恰好 4 个选项**，顺序对应 opt_a / opt_b / opt_c / opt_d。
2. 选项文案每条不超过 40 字，四个选项的**长度要接近**，不能靠长短暗示答案。
3. best 只能有一个，取值是 opt_a～opt_d 之一。
4. half 是数组，取值为 opt_a～opt_d 中**除 best 之外**的项。没有次优选项就写 []。
5. optionComments 必须**四个选项全覆盖**，每条 20～40 字。
   要具体说出这个选项的得失，严禁「不符合题意」「不够妥当」这类废话。
   写 best 那条时要讲清它为什么是最优解，不要只夸。
6. rationale 60～120 字，是"出题人视角"，可以点破题眼。
7. 严禁「以上都对」「以上都不对」「视情况而定」这类选项。
8. 严禁出现真实人名、地名、单位名。用「某市」「XX 镇」「某局」代替。
9. 题干不超过 200 字。写清处境，不要铺陈抒情。

# 质量底线
三个干扰项必须**看上去都有道理**，各自对应一类真实的思维误区。
如果你写出来的干扰项能让高中生一眼排除，那这道题就是废题。
一个好的单选题，是让考生在四个都说得通的选项里犹豫，最后靠分寸和规矩分出高下。

""" + "\n\n".join(
    "# 本次题型\n" + TYPE_BRIEF[qtype] for qtype in ("logic", "eq", "field")
) + """

# 本次任务
按上面的「本次题型」写题，只写指定题型，不要混入其他题型。
直接输出 JSON，不要任何多余字符。
"""


def build_user_prompt(task):
    label = EXAM_TYPE_LABELS[task.qtype]
    return "\n".join([
        "请写 {} 道【{}】题。".format(task.count, label),
        "这 {} 道题之间必须互不相同：情境、考点、答案位置都不能雷同。".format(task.count),
        "答案的位置（opt_a/b/c/d）要分散，不要都落在同一个字母上。",
        "直接输出 JSON，不要任何多余字符。",
    ])


# ══════════════════════════════════════════════════════════════════
# 校验
# ══════════════════════════════════════════════════════════════════

def check_question(q, qtype, used_stems):
    """
    逐题校验。返回问题列表，空列表表示合格。

    这一层比提示词重要：提示词是「请求」，校验是「保证」。
    题库是要固化进游戏、被每一局考试的玩家反复抽到的，
    一道坏题混进去就是永久性的坑——尤其是 best 不在选项内那种，
    会让整卷算分时崩掉。

    used_stems 是全局的（含种子题），题干一旦撞车就弃用：
    后端阅卷靠**题干反查题库**（见 services/question_bank.py），
    题干重复会让反查拿到错的那一条，进而用别人的 best 去判分。
    """
    problems = []

    stem = _norm_stem(q.get("stem"))
    if not stem:
        return ["题干为空"]
    if len(stem) > MAX_STEM_CHARS:
        problems.append("题干过长（{} 字）".format(len(stem)))
    if stem in used_stems:
        problems.append("题干与已有题目重复")

    options = q.get("options")
    if not isinstance(options, list) or len(options) != 4:
        problems.append("选项数应为 4，实为 {}".format(
            len(options) if isinstance(options, list) else "非数组"))
        return problems

    for idx, opt in enumerate(options):
        if not isinstance(opt, dict) or not str(opt.get("text") or "").strip():
            problems.append("第 {} 个选项文案为空".format(idx + 1))
            continue
        if len(str(opt["text"]).strip()) > MAX_OPTION_CHARS:
            problems.append("选项 {} 超 {} 字".format(idx + 1, MAX_OPTION_CHARS))

    if problems:
        return problems

    # 选项 id 一律按序号重排，不采信模型自报的——与 exam.py 的 _normalize_questions 同理
    ids = list(OPT_IDS)

    best = str(q.get("best") or "").strip()
    if best not in ids:
        problems.append("best={!r} 不在选项内".format(best))

    half = q.get("half")
    if half is None:
        half = []
    if not isinstance(half, list):
        problems.append("half 不是数组")
        half = []
    half = [str(h).strip() for h in half]
    if best in half:
        problems.append("best 同时出现在 half 里")
    unknown = [h for h in half if h not in ids]
    if unknown:
        problems.append("half 含未知选项：{}".format(unknown))
    if qtype == "logic" and half:
        problems.append("逻辑题的 half 必须为空")

    rationale = str(q.get("rationale") or "").strip()
    if len(rationale) < 30:
        problems.append("解析过短（{} 字）".format(len(rationale)))

    comments = q.get("optionComments")
    if not isinstance(comments, dict):
        problems.append("缺少 optionComments")
        comments = {}
    missing = [i for i in ids if not str(comments.get(i) or "").strip()]
    if missing:
        problems.append("选项点评缺项：{}".format(missing))
    for key, text in comments.items():
        if key in ids and len(str(text).strip()) > MAX_COMMENT_CHARS:
            problems.append("选项点评过长：{}".format(key))

    return problems


def _norm_stem(text):
    """题干归一化：去掉全部空白。模型换行与空格的习惯不稳定，比对前先抹平。"""
    return "".join(str(text or "").split())


def normalize(raw_questions, task, used_stems):
    """归一化一批模型产出。id 不在这里定，留到 emit 时按题型统一编号。"""
    good, bad = [], []
    for item in raw_questions:
        if not isinstance(item, dict):
            bad.append("产出项不是对象")
            continue

        # 先落地成 dict：模型把 optionComments 写成数组是常事，
        # 直接在推导式里 .items() 会抛 AttributeError，整批断在一条脏数据上
        raw_comments = item.get("optionComments")
        if not isinstance(raw_comments, dict):
            raw_comments = {}
        raw_half = item.get("half")
        if not isinstance(raw_half, list):
            raw_half = []

        q = {
            "type": task.qtype,
            "stem": str(item.get("stem") or "").strip(),
            "options": [
                {"id": OPT_IDS[idx], "text": str(opt.get("text") or "").strip()}
                for idx, opt in enumerate(item.get("options") or [])
                if isinstance(opt, dict)
            ],
            "best": str(item.get("best") or "").strip(),
            "half": [str(h).strip() for h in raw_half],
            "rationale": str(item.get("rationale") or "").strip(),
            "optionComments": {str(k): str(v).strip() for k, v in raw_comments.items()},
        }

        problems = check_question(q, task.qtype, used_stems)
        if problems:
            bad.append("「{}」：{}".format(q["stem"][:18] or "无题干", "；".join(problems)))
            continue

        used_stems.add(_norm_stem(q["stem"]))
        good.append(q)

    return good, bad


# ══════════════════════════════════════════════════════════════════
# 生成
# ══════════════════════════════════════════════════════════════════

def generate_task(task, args, used_stems):
    """
    跑一个任务，成功则落盘到 out/exam_<key>.json 并返回题目，失败返回 []。

    逐任务落盘是刻意的：中途任何一次撞上超时或限流都不该让前面的钱白花。
    已存在的任务默认跳过（要重跑加 --force）。
    """
    cache_path = os.path.join(OUT_DIR, "exam_{}.json".format(task.key))

    if os.path.exists(cache_path) and not args.force:
        try:
            with open(cache_path, "r", encoding="utf-8") as fh:
                cached = json.load(fh)
        except (IOError, ValueError) as exc:
            print("  [重跑] {} 缓存不可用（{}）".format(task.key, exc))
        else:
            questions = [q for q in cached if isinstance(q, dict) and q.get("stem")]
            for q in questions:
                used_stems.add(_norm_stem(q["stem"]))
            print("  [跳过] {} 已有 {} 道".format(task.key, len(questions)))
            return questions

    print("  [生成] {} ← {}（要 {} 道）".format(
        task.key, EXAM_TYPE_LABELS[task.qtype], task.count))

    content = call_json(
        GEN_SYSTEM_PROMPT,
        build_user_prompt(task),
        # 思维链与正文**共用这个上限**（实测思考占输出总量的 79%）。
        # 一道题连着四条点评，字数是事件的两三倍，给窄了会撞 finish_reason=length，
        # 表现为 JSON 断在半句话上，看着像模型格式跑偏，实则是预算不够。
        # max_tokens 是上限不是预留，给宽一点不额外花钱。
        max_tokens=args.max_tokens,
        timeout=args.timeout,
    )

    payload, parse_error = parse_json_object(content)
    if payload is None:
        print("    ✗ 解析失败：{}".format(parse_error))
        return []

    raw = payload.get("questions")
    if not isinstance(raw, list):
        print("    ✗ 顶层没有 questions 数组")
        return []

    questions, rejected = normalize(raw, task, used_stems)
    for why in rejected:
        print("    - 弃用 {}".format(why))

    if not questions:
        print("    ✗ 一道都没通过校验")
        return []

    if len(questions) < task.count:
        print("    ! 要 {} 道只拿到 {} 道可用".format(task.count, len(questions)))

    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(questions, fh, ensure_ascii=False, indent=2)
    print("    ✓ {} 道已落盘".format(len(questions)))
    return questions


# ══════════════════════════════════════════════════════════════════
# 种子
# ══════════════════════════════════════════════════════════════════

def seed_questions():
    """
    把 prompts.FALLBACK_EXAM_QUESTIONS 转成题库格式。

    这十道题原本是「AI 命题失败时的兜底」，题库化之后它们的身份变了：
    变成题库的**种子**——保证题库在任何情况下都不为空，考试永远开得起来。
    同时它们没有 half / optionComments（写的时候还没这套东西），
    所以判档退化成「对就是对，错就是错」，可以接受。

    不手改 prompts.py 里那十道题：那里有一整套导入期自检
    （题号顺序、题型与权重表对齐、选项 id），动它等于把自检也一起动。
    """
    out = []
    for q in FALLBACK_EXAM_QUESTIONS:
        out.append({
            "type": q["type"],
            "stem": q["stem"],
            "options": [{"id": o["id"], "text": o["text"]} for o in q["options"]],
            "best": q["best"],
            "half": [],
            "optionComments": {},
            "rationale": q.get("rationale", ""),
            "source": "seed",
        })
    return out


# ══════════════════════════════════════════════════════════════════
# 产出
# ══════════════════════════════════════════════════════════════════

def emit(questions):
    """写出 backend/data/questions.json。题号按题型顺序统一编号，不采信模型自报。"""
    counters = {}
    payload = []
    for q in questions:
        idx = counters.get(q["type"], 0) + 1
        counters[q["type"]] = idx
        payload.append({
            "id": "bk_{}_{:03d}".format(q["type"], idx),
            "type": q["type"],
            "stem": q["stem"],
            "options": q["options"],
            "best": q["best"],
            "half": q["half"],
            "optionComments": q["optionComments"],
            "rationale": q["rationale"],
            "source": q.get("source", "ai"),
        })

    # dump 一次，写两处（理由见文件头那一段）。两次调用参数完全相同，
    # 所以两份的 bytes 必然一样——探针里那条"字节相同"才立得住。
    #
    # 别改成 newline="\n"：本文件在 Windows 上生成，用的是 json.dump 的默认换行，
    # 现存的两份都是 CRLF。改成显式 LF 会让下一次重跑产出整文件级的 diff，
    # 而那份 diff 里没有一个字的内容变化。
    payload_obj = {"version": 1, "counts": counters, "questions": payload}
    for directory, path in ((BANK_DIR, BANK_FILE), (FRONT_BANK_DIR, FRONT_BANK_FILE)):
        if not os.path.isdir(directory):
            os.makedirs(directory)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(payload_obj, fh, ensure_ascii=False, indent=2)

    print("\n已写出（{} 道，{} KB，两份内容一致）：".format(
        len(payload), os.path.getsize(BANK_FILE) // 1024))
    print("  后端 {}", BANK_FILE)
    print("  前端 {}  ← 玩家路径读的是这一份".format(FRONT_BANK_FILE))
    print("  题量分布：{}".format(
        "，".join("{} {} 道".format(EXAM_TYPE_LABELS[t], n) for t, n in counters.items())))


# ══════════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════════

def parse_args():
    ap = argparse.ArgumentParser(description="批量生成考公题库（会真实调用 DeepSeek）")
    ap.add_argument("--yes", action="store_true", help="确认执行。不加则只打印计划")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划与预估，不发任何请求")
    ap.add_argument("--force", action="store_true", help="忽略已有缓存，全部重跑")
    ap.add_argument("--only", default="", help="只跑指定题型，逗号分隔，如 logic,eq")
    ap.add_argument("--max-tokens", type=int, default=16000, help="单次输出上限")
    ap.add_argument("--timeout", type=float, default=150.0, help="单次请求超时（秒）")
    ap.add_argument("--sleep", type=float, default=0.5, help="两次请求之间的间隔（秒）")
    return ap.parse_args()


def main():
    args = parse_args()
    tasks = build_tasks()

    if args.only:
        wanted = [k.strip() for k in args.only.split(",") if k.strip()]
        unknown = set(wanted) - set(BANK_QUOTA)
        if unknown:
            print("未知题型：{}。可用：{}".format(
                sorted(unknown), ", ".join(BANK_QUOTA)))
            return 2
        tasks = [t for t in tasks if t.qtype in wanted]

    total = sum(t.count for t in tasks)
    print("题库配额：{}".format(
        "，".join("{} {} 道".format(EXAM_TYPE_LABELS[t], n) for t, n in BANK_QUOTA.items())))
    print("种子（prompts.FALLBACK_EXAM_QUESTIONS）：{}".format(
        "，".join("{} {} 道".format(EXAM_TYPE_LABELS[t], n) for t, n in SEED_COUNT.items())))
    print("\n计划：{} 个任务，最多再生成 {} 道题".format(len(tasks), total))
    for task in tasks:
        print("  {:<10} {:<8} ×{}".format(
            task.key, EXAM_TYPE_LABELS[task.qtype], task.count))

    # 粗估：一道题（题干+四选项+解析+四条点评）约 500 字，思考约为正文的 1.5 倍，
    # 合成 0.57 token/字。只为了给个人一个量级感，别当账单。
    est_chars = total * 500 * 2.5 + len(tasks) * 2500
    print("\n粗估输出约 {:.1f} 万 token（含思考），单价请自行对照 DeepSeek 价目表。".format(
        est_chars * 0.57 / 10000))
    print("计划跑 {} 次请求，按每次 30~60 秒，约需 {:.0f}~{:.0f} 分钟。".format(
        len(tasks), len(tasks) * 0.5, len(tasks)))

    settings = get_settings()
    if not settings.is_configured:
        print("\n未配置 DEEPSEEK_API_KEY，无法生成。请先在 backend/.env 里填好。")
        return 1

    if args.dry_run:
        print("\n--dry-run：未发出任何请求。")
        return 0

    if not args.yes:
        print("\n这会真实消耗你自己的 DeepSeek 额度。确认无误后加 --yes 执行。")
        return 1

    if not os.path.isdir(OUT_DIR):
        os.makedirs(OUT_DIR)

    print("\n开始生成（模型 {}）…\n".format(settings.deepseek_model))

    # 种子先进 used_stems：生成的题不得与种子撞题干。
    # 后端阅卷靠题干反查题库，撞了会拿错答案。
    seeds = seed_questions()
    used_stems = {_norm_stem(q["stem"]) for q in seeds}

    all_questions = list(seeds)
    failed = []

    for idx, task in enumerate(tasks, 1):
        print("[{}/{}] {}".format(idx, len(tasks), task.key))
        try:
            all_questions.extend(generate_task(task, args, used_stems))
        except Exception as exc:  # noqa: BLE001 —— 单任务失败不该中断整批
            print("    ✗ 请求异常：{}".format(_safe_error(exc)))
            failed.append(task.key)
        if idx < len(tasks):
            time.sleep(args.sleep)

    if len(all_questions) == len(seeds):
        print("\n一道都没生成出来，只写种子题库。")
    else:
        print("\n生成 {} 道，加种子共 {} 道。".format(
            len(all_questions) - len(seeds), len(all_questions)))

    # 生成的题目排在种子后面：抽取是随机的，与顺序无关，
    # 但人翻文件时种子那十道是手写精编的，放前面好认。
    emit(all_questions)

    if failed:
        print("失败任务（补跑加 --only {}）：{}".format(
            ",".join(sorted({t.split("_")[0] for t in failed})), ", ".join(failed)))
    print("\n接下来：确认 backend/data/questions.json 已更新，重启后端生效。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
