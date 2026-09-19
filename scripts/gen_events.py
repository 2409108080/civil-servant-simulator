# -*- coding: utf-8 -*-
"""
本地事件库批量生成脚本（一次性，归档用）。

**玩家运行时绝不调用本脚本、也绝不调用 API。** 它只负责把料备齐，
产出固化到 frontend/src/mock/localEvents.generated.js，之后就可以归档了。

跑法（**加 --yes 才会真的花钱**）：
    cd D:/code_game/scripts
    python gen_events.py --dry-run          # 只打印计划与预估token，不发请求
    python gen_events.py --yes              # 真跑
    python gen_events.py --yes --only township-科级,core-处级   # 补单
    python gen_events.py --yes --force      # 全部重跑

为什么不直接用 backend/services/deepseek.py 的 generate_event()：
那个函数一次只出一个事件，且吃的是 PlayerStatus（要真实玩家状态）。
这里要的是「一次出 6 个、按单位与职级归档」，得自己拼提示词。
但**调用管道仍然复用 call_json()**——它身上有踩坑换来的东西：
finish_reason=length 的截断识别、错误脱敏、超时与上限成对传递。
另起一套 requests 调用等于把这些坑再踩一遍。

为什么必须 --yes：
这个脚本会真花用户自己的 DeepSeek 额度。默认拒绝执行，
把「计划 + 预估花费」先摆出来，由人点头。
"""

import argparse
import json
import os
import re
import sys
import time

# 复用后端的调用管道与配置。必须先垫 sys.path，否则 import 不到 backend 下的模块。
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.normpath(os.path.join(_HERE, "..", "backend"))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from config import get_settings                      # noqa: E402
from models import LEVEL_LADDER, RESOURCE_KEYS       # noqa: E402
from prompts import BUREAUCRATIC_PHRASES, UNIT_TYPE_SPECS  # noqa: E402
from services.deepseek import (                      # noqa: E402
    _safe_error,
    call_json,
    parse_json_object,
)

OUT_DIR = os.path.join(_HERE, "out")
GEN_FILE = os.path.normpath(
    os.path.join(_HERE, "..", "frontend", "src", "mock", "localEvents.generated.js")
)

# ── 职级分档 ──────────────────────────────────────────────
# 8 级太细：给每一级单独写事件，池子会被摊薄成每格 1~2 条，
# 而且「乡科级副职」与「乡科级正职」能碰到的事本来就差不多。
# 这里把阶梯两两并成四档，档内共用，档间不共用——职级差一级，
# 能调动的人和能闯的祸差得很远，这个必须体现。
BANDS = ("科级", "处级", "厅级", "省部级")

# 档位是从阶梯两两并出来的，所以阶梯长度必须正好是档数的两倍。
# 将来策划加了职级（比如拆出「地市级」），这里当场炸掉，
# 好过静默地让新职级永远抽不到贴合事件——那种问题没有任何报错。
assert len(LEVEL_LADDER) == len(BANDS) * 2, (
    "职级阶梯 {} 级无法两两并入 {} 档，请同步调整 BANDS".format(len(LEVEL_LADDER), len(BANDS))
)

BAND_RULES = {
    "科级": (
        "乡科级副职／正职（副镇长、镇长、县局副局长）。执行层，手里没有决策权："
        "材料自己写，群众自己见，责任自己扛。可调动资源极小，"
        "面对的诱惑是几千块的卡、一顿饭、一个人情。"
    ),
    "处级": (
        "县处级副职／正职（副县长、县长、市局局长）。开始主政一方或主管一条线，"
        "手里有项目、有指标、有编制。两难集中在：上级要的数字与实际对不上、"
        "分管领域的问责压力、下属与商人的围猎，数额上升到一个项目、一笔专项资金。"
    ),
    "厅级": (
        "厅局级副职／正职（副市长、市长）。主政一城，面对产业布局、重大事故、"
        "跨部门博弈与省级考核。亲手办的事少了，但每一件都上新闻；"
        "风险来自主政期间的重大决策与身边人的腐败。"
    ),
    "省部级": (
        "省部级副职／正职（副省长、省长）。站位是全省盘子，事件是政策取向、"
        "区域博弈、重大舆情与巡视。写的是位子而不是人，个人色彩要淡。"
    ),
}

UNITS = tuple(UNIT_TYPE_SPECS.keys())        # 核心部门 / 基层乡镇 / 边缘部门 / 常规局委
UNIT_SLUG = {"核心部门": "core", "基层乡镇": "town", "边缘部门": "marg", "常规局委": "bureau", "通用": "common"}
BAND_SLUG = {"科级": "k", "处级": "c", "厅级": "t", "省部级": "s", "通用": "any"}

# 事件对象允许出现的键，多一个少一个都算不合格。
# 前四个是 backend/models.py 的 GameEvent 契约；后三个是**纯本地标签**，
# 只服务于本地抽取，不出这个页面（1.0.0 起整局都在浏览器里跑，没有上报这一步）。
CONTRACT_KEYS = ("id", "title", "description", "options")
LOCAL_KEYS = ("npcName", "unitType", "bands", "theme")
EVENT_KEYS = ("id", "title", "npcName", "unitType", "bands", "theme", "description", "options")

# 参与晋升门槛的四项。与 frontend/src/constants/promotion.js 的 PROMOTION_GATES 对齐。
GATE_KEYS = ("ability", "mgmt", "popularity", "kpi")

MAX_DELTA = 25           # 单项效果绝对值上限，与提示词里的约束一致
RISK_SELF_PUNISH = 8     # 免费选项若要给正收益，风险至少要抬这么高，见 check_event()

# 正向风险的缩放系数。**必须与 scripts/damp_risk.mjs 的 RISK_DAMP 一致**。
#
# 为什么生成时就要缩：模型对"这事有多大风险"的直觉是按真实世界给的，
# 一开口就是 +15、+18，而负向事件最多只敢给 -8。只放宽 riskMax 是治标——
# 池子本身在把玩家往线上推，越线只是早晚。所以在**入库前**先按同一系数收一遍，
# 让生成物和已经降过风险的存量库处在同一个量级。
#
# 注意下游还有一道 damp_risk.mjs：它是给**存量**文件用的（那次没法重跑生成），
# 会检查文件头的 @risk-damped 标记，跑过就不再跑。新生成的文件没有标记，
# 若这里已经缩过，就不要再去跑那个脚本，否则等于连降两档。
RISK_DAMP = 0.6
RISK_FLOOR = 3           # 缩放后的下限，见 damp_risk.mjs

_ID_SAFE_RE = re.compile(r"[^a-z0-9]+")


def _damp_option(opt):
    """
    就地收窄正向风险。见 RISK_DAMP 的说明。

    下限分两档：普通选项收到 RISK_FLOOR，免费且净加门槛的选项必须保住
    RISK_SELF_PUNISH——那道线是"防无限点击刷分"的，缩放把它压破，
    这个脚本就会亲手造出一批刷分漏洞，而且一条错误都不会报。
    """
    effects = opt.get("effects") or {}
    risk = effects.get("risk", 0)
    if not isinstance(risk, int) or isinstance(risk, bool) or risk <= 0:
        return

    gate_sum = sum(effects.get(k, 0) for k in GATE_KEYS if isinstance(effects.get(k, 0), int))
    must_self_punish = opt.get("costAp", 0) == 0 and gate_sum > 0
    floor = RISK_SELF_PUNISH if must_self_punish else RISK_FLOOR

    effects["risk"] = max(floor, int(round(risk * RISK_DAMP)))


# ══════════════════════════════════════════════════════════════════
# 任务清单
# ══════════════════════════════════════════════════════════════════

class Task(object):
    def __init__(self, key, unit, band, theme, count, note):
        self.key = key
        self.unit = unit
        self.band = band
        self.theme = theme
        self.count = count
        self.note = note


def build_tasks():
    """4 单位 × 4 职级 × 6 + 强制题材 + 通用兜底 = 124 条。"""
    tasks = []
    for unit in UNITS:
        for band in BANDS:
            tasks.append(Task(
                key="{}-{}".format(UNIT_SLUG[unit], BAND_SLUG[band]),
                unit=unit, band=band, theme="daily", count=6,
                note="{}的日常事务".format(unit),
            ))

    # 强制题材：风险 > 50 / 健康 < 30 时触发，**压过单位类型**。
    # 与 backend/prompts.py 的 build_forced_theme 同序同阈值，改一处必须改另一处。
    for band in BANDS:
        tasks.append(Task(
            key="risk-{}".format(BAND_SLUG[band]),
            unit="通用", band=band, theme="risk", count=3,
            note="廉政风险题材（纪委暗访、函询、巡视、同僚发难）",
        ))
        tasks.append(Task(
            key="health-{}".format(BAND_SLUG[band]),
            unit="通用", band=band, theme="health", count=2,
            note="健康题材（指标异常、住院、家属施压调岗）",
        ))

    # 通用池：单位与职级都不限。抽取链的最后一环，保证任何状态下都有牌可打。
    tasks.append(Task(
        key="common-any", unit="通用", band="通用", theme="daily", count=8,
        note="通用兜底，任何单位任何职级都能用",
    ))
    return tasks


# ══════════════════════════════════════════════════════════════════
# 提示词
# ══════════════════════════════════════════════════════════════════

# 话术清单直接取自 prompts.BUREAUCRATIC_PHRASES——运行时提示词用的就是这一份。
# 在这里另抄一遍的话，将来加了两句新黑话，只有一边生效。
_PHRASE_HINT = "、".join(BUREAUCRATIC_PHRASES)


def _unit_rules():
    """
    单位类型的场景规格。

    直接复用 backend/prompts.py 的 UNIT_TYPE_SPECS——那是单位类型的唯一权威来源。
    这里另写一份的话，将来改了一处漏一处，生成出来的池子会与运行时提示词的
    规矩对不上，而且不会有任何报错，只表现为「AI 生成的事件总有点串味」。
    """
    lines = []
    for idx, (name, spec) in enumerate(UNIT_TYPE_SPECS.items(), 1):
        lines.append(
            "（{}）【{}】（{}）：职责是{}。场景须落在{}。绝对不得出现：{}。".format(
                idx, name, spec["examples"], spec["duty"], spec["scenes"], spec["avoid"]
            )
        )
    return "\n".join(lines)


GEN_SYSTEM_PROMPT = """你是一款中国基层官场模拟经营游戏的内容作者，负责为它撰写**事件库**。
你深谙县乡两级党政机关的运行逻辑、人情世故与问责机制，写的桥段要真实、有压迫感，
让玩家在两难中做选择。

# 输出格式（绝对强制）
只输出一个 JSON 对象，不要输出任何其他内容。
禁止 markdown 代码块标记（不要出现 ```json 或 ```），禁止任何前言、后记、注释。

{
  "events": [
    {
      "slug": "deepnight_doc",
      "title": "事件标题，不超过 14 个字",
      "npcName": "出场人物+职务，如「书记秘书 小周」，不超过 10 个字",
      "description": "事件正文，80-160 字，第二人称「你」，交代清楚处境与两难",
      "options": [
        { "text": "选项文案，不超过 20 字，第一人称口吻", "costAp": 1,
          "effects": { "energy": -10, "kpi": 5, "risk": 8 } }
      ]
    }
  ]
}

# 字段规则
1. slug 是 2-4 个英文单词，小写下划线连接，用来说明这件事，全局不得重复。
2. options 必须是 2 到 3 个。costAp 取 0、1、2。
3. effects 的键只能从这八项里选：energy 精力、authority 威信、mgmt 向上管理、
   popularity 人缘、ability 工作能力、kpi 政绩、risk 廉政风险（越高越危险）、health 健康。
   每个选项只写真正受影响的 3 到 5 项，不要八项全写。数值为整数，单项绝对值不超过 25。

# 内容规则（违反即不合格）
1. **没有完美选项**：每个选项都必须有真实代价，至少有一项负向效果。
   给政绩的必然消耗精力或健康，给上级好感的往往抬高廉政风险，
   拉人缘可能损伤威信。严禁「全加不减」。
2. **风险与收益对称**：走捷径、打招呼、压下不报，短期给 kpi/mgmt/popularity，
   但必须显著抬高 risk。坚持原则给 authority/ability，但常常得罪人。
3. **免费选项必须无利可图**：costAp 为 0 的选项，是玩家行动力耗尽时的退路，
   也是玩家可以无限次点击的选项。因此它**不得**让玩家变强：
   要么四项门槛（ability/mgmt/popularity/kpi）之和小于等于 0，
   要么这一项显著抬高风险（risk 至少 +8）——靠风险自伤来封住刷分。
   给个「稳妥观望还能赚一点」的选项是最容易犯的错，务必避免。
4. **注入体制内话术**：在 description 或选项里自然融入一到两句官场黑话，
   例如：""" + _PHRASE_HINT + """。
   不要堆砌，不要每句都用。
5. **措辞克制**：白描笔法，不要写成网络段子，不要戏谑夸张，
   不要出现明示「这是游戏」的表达。不出现真实人名、地名、单位名。

# 单位类型的场景底色（决定出场的人与说话的分寸，不可张冠李戴）
""" + _unit_rules() + """

# 职级的分寸（决定事情的大小与诱惑的数额）
""" + "\n".join("【{}】{}".format(b, BAND_RULES[b]) for b in BANDS) + """

写之前先问一句：「这个单位、这个级别的人，一天到晚实际在干什么？」
写完再自查一遍：有没有把某个单位的活儿安到另一个单位头上，有没有写出这个级别碰不到的事。
"""


def build_user_prompt(task):
    parts = [
        "# 本次任务",
        "请一次性写出 {} 个**互不相同**的事件。".format(task.count),
        "单位类型：{}".format(task.unit),
        "职级档位：{}".format(task.band),
        "题材：{}".format(task.note),
    ]

    if task.theme == "risk":
        parts.append(
            "这些事件的共同前提：玩家廉政风险已超过 50%，处于高危状态。"
            "必须围绕纪委暗访、函询谈话、巡视组下沉、同僚借机发难的人事斗争展开，"
            "不得写轻松日常。"
        )
    elif task.theme == "health":
        parts.append(
            "这些事件的共同前提：玩家健康已跌破 30，身体濒临透支。"
            "必须围绕体检指标异常、住院、家属施压要求调岗展开。"
        )
    elif task.unit == "通用":
        parts.append(
            "这些事件不限定单位类型，任何机关都可能发生，"
            "写机关里共通的人情与责任，避免出现只有某一类单位才有的场景。"
        )

    if task.unit == "通用" and task.band == "通用":
        parts.append(
            "职级也不限，请写得足够「通用」：就让它发生在任何一个机关、"
            "任何一个级别的办公室里都不违和。"
        )

    parts.append("直接输出 JSON，不要任何多余字符。")
    return "\n".join(parts)


# ══════════════════════════════════════════════════════════════════
# 校验
# ══════════════════════════════════════════════════════════════════

def check_event(evt):
    """
    逐条校验一个事件。返回问题列表，空列表表示合格。

    这一层比提示词重要：提示词是「请求」，校验是「保证」。
    模型有概率不听话，而池子是要固化进游戏、被玩家无限次抽的，
    一条坏事件混进去就是永久性的坑——尤其是「没有免费选项」那种，
    会让行动力不足的玩家卡在一个关不掉的弹窗里。
    """
    problems = []

    if set(evt) != set(EVENT_KEYS):
        problems.append("字段集不符：{}".format(sorted(evt)))
        return problems  # 字段都不对，后面逐项检查没有意义

    if not evt["id"] or not re.match(r"^evt_[a-z0-9_]+$", evt["id"]):
        problems.append("id 不合规范：{!r}".format(evt["id"]))
    if not evt["title"] or len(evt["title"]) > 14:
        problems.append("标题为空或超过 14 字：{!r}".format(evt["title"]))
    if not evt["description"] or len(evt["description"]) < 60:
        problems.append("正文过短（{} 字）".format(len(evt["description"] or "")))

    options = evt["options"]
    if not isinstance(options, list) or not (2 <= len(options) <= 3):
        problems.append("选项数应为 2-3，实为 {}".format(len(options) if isinstance(options, list) else "非数组"))
        return problems

    # 选项 id 一律按序号重排，不采信模型自报的——与 exam.py 的 _normalize_questions 同理
    for idx, opt in enumerate(options):
        opt["id"] = "opt_{}".format(chr(ord("a") + idx))

    if not any(o["costAp"] == 0 for o in options):
        # 这条是硬红线：EventModal 是关不掉的（玩家必须做选择），
        # 而「推进工作」只要 AP>0 就能点。玩家剩 1 点 AP、事件里最便宜的选项
        # 也要 2 点，三个选项就全部置灰、弹窗又关不掉——直接死局。
        problems.append("没有 costAp=0 的选项，玩家行动力不足时会卡死")

    for opt in options:
        if not opt["text"] or len(opt["text"]) > 20:
            problems.append("选项文案为空或超 20 字：{!r}".format(opt["text"]))
        if opt["costAp"] not in (0, 1, 2):
            problems.append("costAp 越界：{}".format(opt["costAp"]))
        effects = opt["effects"]
        illegal = set(effects) - RESOURCE_KEYS
        if illegal:
            problems.append("效果作用于未知资源：{}".format(sorted(illegal)))
        if not effects:
            problems.append("选项没有任何效果")
        for key, val in effects.items():
            if not isinstance(val, int) or isinstance(val, bool):
                problems.append("效果值不是整数：{}={!r}".format(key, val))
            elif abs(val) > MAX_DELTA:
                problems.append("效果值超上限：{}={}".format(key, val))
        if not any(v < 0 for v in effects.values() if isinstance(v, int)):
            problems.append("选项「{}」全是正收益，违反无完美选项".format(opt["text"]))

    # 免费选项的刷分漏洞：见文件头的说明与规则 3
    for opt in options:
        if opt["costAp"] != 0:
            continue
        gate_sum = sum(opt["effects"].get(k, 0) for k in GATE_KEYS)
        risk_up = opt["effects"].get("risk", 0)
        if gate_sum > 0 and risk_up < RISK_SELF_PUNISH:
            problems.append(
                "免费选项「{}」门槛净收益 {:+d} 且风险只 +{}，可被无限点击刷分".format(
                    opt["text"], gate_sum, risk_up
                )
            )

    return problems


def normalize(raw_events, task, used_ids, used_slugs):
    """
    归一化一批模型产出。**不信任模型的编号**：id 一律由任务与序号重排，
    从根上杜绝全局重名（事件冷却表按 id 记，全靠 id 唯一）。
    """
    good, bad = [], []
    for item in raw_events:
        if not isinstance(item, dict):
            bad.append("产出项不是对象")
            continue

        slug = _ID_SAFE_RE.sub("_", str(item.get("slug") or "").strip().lower()).strip("_")
        if not slug:
            slug = "x"
        # slug 撞了就加序号，别让两条事件共用一个 slug 前缀
        base_slug, n = slug, 2
        while "{}/{}".format(task.key, slug) in used_slugs:
            slug = "{}_{}".format(base_slug, n)
            n += 1
        used_slugs.add("{}/{}".format(task.key, slug))

        evt = {
            "id": "evt_{}_{}_{}".format(UNIT_SLUG[task.unit], BAND_SLUG[task.band], slug),
            "title": str(item.get("title") or "").strip(),
            "npcName": str(item.get("npcName") or "").strip()[:10],
            "unitType": task.unit,
            "bands": [task.band] if task.band != "通用" else list(BANDS),
            "theme": task.theme,
            "description": str(item.get("description") or "").strip(),
            "options": [],
        }

        for idx, opt in enumerate(item.get("options") or []):
            if not isinstance(opt, dict):
                continue
            effects = {}
            for key, val in (opt.get("effects") or {}).items():
                try:
                    effects[str(key)] = int(val)
                except (TypeError, ValueError):
                    continue
            try:
                cost = int(opt.get("costAp", 0))
            except (TypeError, ValueError):
                cost = 0
            evt["options"].append({
                "id": "opt_{}".format(chr(ord("a") + idx)),
                "text": str(opt.get("text") or "").strip(),
                "costAp": cost,
                "effects": effects,
            })
            # 缩放必须在 check_event 之前：RISK_SELF_PUNISH 那道校验
            # 判的是**入库后的数值**，先校验再缩放的话，校验放行的料
            # 会被缩放到线下，等于绕过了自己刚设的关。
            _damp_option(evt["options"][-1])

        if evt["id"] in used_ids:
            bad.append("id 重复：{}".format(evt["id"]))
            continue

        problems = check_event(evt)
        if problems:
            bad.append("「{}」：{}".format(evt["title"] or "无标题", "；".join(problems)))
            continue

        used_ids.add(evt["id"])
        good.append(evt)

    return good, bad


# ══════════════════════════════════════════════════════════════════
# 生成
# ══════════════════════════════════════════════════════════════════

def generate_task(task, args, used_ids, used_slugs):
    """
    跑一个任务，成功则落盘到 out/<key>.json 并返回事件列表，失败返回 []。

    逐任务落盘是刻意的：一次全量生成要跑二十分钟、二十几次请求，
    中途任何一次撞上超时或限流都不该让前面的钱白花。
    已存在的任务默认跳过（要重跑加 --force），所以中断后再跑一遍就能接着来。
    """
    cache_path = os.path.join(OUT_DIR, "{}.json".format(task.key))

    if os.path.exists(cache_path) and not args.force:
        # 缓存里的 id 是上次生成时就定死的，**不能再过一遍 normalize()**：
        # normalize 靠模型给的 slug 拼 id，而缓存里已经没有 slug 了，
        # 重跑一遍会给所有老事件换一批 id，冷却表按 id 记，换 id 等于避重全部失效。
        try:
            with open(cache_path, "r", encoding="utf-8") as fh:
                cached = json.load(fh)
        except (IOError, ValueError) as exc:
            print("  [重跑] {} 缓存不可用（{}）".format(task.key, exc))
        else:
            events = [e for e in cached
                      if isinstance(e, dict) and e.get("id") and e["id"] not in used_ids]
            for evt in events:
                used_ids.add(evt["id"])
            print("  [跳过] {} 已有 {} 条".format(task.key, len(events)))
            return events

    print("  [生成] {} ← {}（要 {} 条）".format(task.key, task.note, task.count))

    content = call_json(
        GEN_SYSTEM_PROMPT,
        build_user_prompt(task),
        # 一次要吐 6 条事件，正文就有两千多字；而**思考与正文共用这个上限**
        # （实测思考占输出总量的 79%）。给少了会撞上 finish_reason=length，
        # 表现为 JSON 断在半句话上，看着像模型格式跑偏，实则是预算不够。
        # max_tokens 是上限不是预留，给宽一点不额外花钱。
        max_tokens=args.max_tokens,
        timeout=args.timeout,
    )

    payload, parse_error = parse_json_object(content)
    if payload is None:
        print("    ✗ 解析失败：{}".format(parse_error))
        return []

    raw = payload.get("events")
    if not isinstance(raw, list):
        print("    ✗ 顶层没有 events 数组")
        return []

    events, rejected = normalize(raw, task, used_ids, used_slugs)
    for why in rejected:
        print("    - 弃用 {}".format(why))

    if not events:
        print("    ✗ 一条都没通过校验")
        return []

    if len(events) < task.count:
        print("    ! 要 {} 条只拿到 {} 条可用".format(task.count, len(events)))

    with open(cache_path, "w", encoding="utf-8") as fh:
        json.dump(events, fh, ensure_ascii=False, indent=2)
    print("    ✓ {} 条已落盘".format(len(events)))
    return events


# ══════════════════════════════════════════════════════════════════
# 产出
# ══════════════════════════════════════════════════════════════════

_JS_KEY_RE = re.compile(r'^(\s*)"([A-Za-z_][A-Za-z0-9_]*)": ', re.M)
_ORDER = ("id", "title", "npcName", "unitType", "bands", "theme", "description", "options")


def to_js(obj, pad=0):
    """JSON 是合法 JS。这里只把键名的引号去掉，值仍交给 json.dumps 转义。"""
    ordered = {k: obj[k] for k in _ORDER}
    text = json.dumps(ordered, ensure_ascii=False, indent=2)
    text = _JS_KEY_RE.sub(r"\1\2: ", text)
    if pad:
        text = "\n".join((" " * pad + line) if line.strip() else line for line in text.split("\n"))
    return text


HEADER = '''/**
 * 本地事件库（**机器生成，请勿手改**）
 *
 * 由 scripts/gen_events.py 产出。要增删改，改脚本再跑，或把手写的内容放进
 * localEvents.js 的 SEED_EVENTS 里——那个文件是人的地盘，这个是脚本的地盘。
 * 直接编辑本文件的话，下次跑脚本就没了。
 *
 * 字段分两拨：
 *   契约字段 id / title / description / options  —— 与 backend/models.py 的 GameEvent 一致
 *   本地标签 npcName / unitType / bands / theme   —— 只服务于本地抽取，
 *       只服务于本地抽取，不出这个页面（1.0.0 起整局都在浏览器里跑）
 *
 * 共 {count} 条，覆盖 4 单位 × 4 职级档 + 廉政/健康两类强制题材 + 通用兜底。
 */

export default [
'''


def emit(events):
    body = ",\n".join(to_js(e, pad=2) for e in events)
    text = HEADER.format(count=len(events)) + body + "\n]\n"
    with open(GEN_FILE, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("\n已写出 {}（{} 条，{} KB）".format(
        GEN_FILE, len(events), os.path.getsize(GEN_FILE) // 1024
    ))


# ══════════════════════════════════════════════════════════════════
# 入口
# ══════════════════════════════════════════════════════════════════

def parse_args():
    ap = argparse.ArgumentParser(description="批量生成本地事件库（会真实调用 DeepSeek）")
    ap.add_argument("--yes", action="store_true", help="确认执行。不加则只打印计划")
    ap.add_argument("--dry-run", action="store_true", help="只打印计划与预估，不发任何请求")
    ap.add_argument("--force", action="store_true", help="忽略已有缓存，全部重跑")
    ap.add_argument("--only", default="", help="只跑指定任务，逗号分隔，如 core-k,town-c")
    ap.add_argument("--max-tokens", type=int, default=16000, help="单次输出上限")
    ap.add_argument("--timeout", type=float, default=120.0, help="单次请求超时（秒）")
    ap.add_argument("--sleep", type=float, default=0.5, help="两次请求之间的间隔（秒）")
    return ap.parse_args()


def main():
    args = parse_args()
    tasks = build_tasks()

    if args.only:
        wanted = [k.strip() for k in args.only.split(",") if k.strip()]
        tasks = [t for t in tasks if t.key in wanted]
        missing = set(wanted) - {t.key for t in build_tasks()}
        if missing:
            print("未知任务名：{}".format(sorted(missing)))
            print("可用任务：{}".format(", ".join(t.key for t in build_tasks())))
            return 2

    total = sum(t.count for t in tasks)
    print("计划：{} 个任务，最多 {} 条事件".format(len(tasks), total))
    for task in tasks:
        print("  {:<12} {:<6} {:<6} {:<8} ×{}".format(
            task.key, task.unit, task.band, task.theme, task.count))

    # 粗估：一条事件正文约 320 字，思考约为正文的 1.5 倍（实测 79% 占比的保守化），
    # 合成 0.57 token/字。只为了给个人一个量级感，别当账单。
    est_chars = total * 320 * 2.5 + len(tasks) * 2500
    print("\n粗估输出约 {:.0f} 万 token（含思考），单价请自行对照 DeepSeek 价目表。".format(
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

    used_ids, used_slugs = set(), set()
    all_events = []
    failed = []

    for idx, task in enumerate(tasks, 1):
        print("[{}/{}] {}".format(idx, len(tasks), task.key))
        try:
            all_events.extend(generate_task(task, args, used_ids, used_slugs))
        except Exception as exc:  # noqa: BLE001 —— 单任务失败不该中断整批
            print("    ✗ 请求异常：{}".format(_safe_error(exc)))
            failed.append(task.key)
        if idx < len(tasks):
            time.sleep(args.sleep)

    if not all_events:
        print("\n一条都没生成出来，不覆盖产出文件。")
        return 1

    emit(all_events)

    print("\n完成：{} 条。".format(len(all_events)))
    if failed:
        print("失败任务（补跑加 --only {}）：{}".format(",".join(failed), ", ".join(failed)))
    print("接下来：检查 {} 与 localEvents.js 的合并结果，再 npm run build。".format(
        os.path.relpath(GEN_FILE, os.path.join(_HERE, ".."))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
