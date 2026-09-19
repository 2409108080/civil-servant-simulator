# -*- coding: utf-8 -*-
"""
提示词模板与兜底事件。

提示词要解决的核心问题是：让模型稳定吐出**可直接落库、可直接渲染**的 GameEvent JSON，
且内容符合体制内语境。因此约束分三层——
  1. 输出格式约束（字段名、取值范围、纯 JSON）
  2. 内容约束（职级匹配、黑话、无完美选项）
  3. 状态触发的强制题材（高风险 / 低健康）
"""

import copy
from typing import Any, Dict, List

from models import LEVEL_LADDER, RESOURCE_KEYS, UNIT_TYPES

# 八项资源的中文名，写进提示词让模型理解语义，而不是只看到英文键
RESOURCE_CN = {
    "energy": "精力",
    "authority": "威信",
    "mgmt": "向上管理",
    "popularity": "人缘",
    "ability": "工作能力",
    "kpi": "政绩",
    "risk": "廉政风险（越高越危险）",
    "health": "健康",
}

# 单位类型的场景规格。**这是单位类型的唯一权威来源**：
# SYSTEM_PROMPT 的第 6 条规则与 UNIT_TYPE_THEMES（注入用户提示词）都由它生成，
# 避免两处各写一份、改一处漏一处。
#
# scenes 是"应该出现什么"，avoid 是"绝对不能出现什么"。
# avoid 这一栏是踩坑换来的：实跑中「核心部门」出过《清表交地这道坎》——
# 征地拆迁是乡镇的活，不是市委办的活。只给正面示例，模型仍会往它最熟悉的
# 基层场景上靠，必须显式划禁区。
UNIT_TYPE_SPECS: Dict[str, Dict[str, str]] = {
    "核心部门": {
        "examples": "市委办、发改委、组织部",
        "duty": "定规则、起草政策、参与领导博弈、统筹全局",
        "scenes": "办公室深夜的灯火、会议室里的交锋、宏观数据与台账、跨部门协调会",
        "avoid": "下地干活、拆迁清表、村民堵门——那是乡镇的具体执行事务",
    },
    "基层乡镇": {
        "examples": "乡镇党委政府、街道办",
        "duty": "具体执行、落实政策、直面群众",
        "scenes": "田间地头、村民堵门、迎检整改、纠纷调解",
        "avoid": "关起门来起草全市性政策文件、参与高层人事博弈",
    },
    "边缘部门": {
        "examples": "档案局、科协、史志办",
        "duty": "边缘事务、闲职养老、日常工作",
        "scenes": "组织体检、饮水机坏了、工会合唱、防火防盗",
        "avoid": "重大项目、重大决策、高风险博弈——边缘部门碰不到这些",
    },
    "常规局委": {
        "examples": "财政局、教育局",
        "duty": "窗口服务、跨部门扯皮、审批担责",
        "scenes": "窗口投诉、审批签字、部门之间踢皮球",
        "avoid": "统筹全局的宏观决策——那是核心部门的事",
    },
}


def _unit_theme_text(unit_type: str) -> str:
    """用户提示词里的一句话场景底色。"""
    spec = UNIT_TYPE_SPECS.get(unit_type)
    if spec is None:
        return "（未知单位类型，按常规机关日常处理）"
    return (
        f"{spec['examples']}一类，职责是{spec['duty']}。"
        f"典型场景：{spec['scenes']}。"
        f"不得出现：{spec['avoid']}。"
    )


UNIT_TYPE_THEMES: Dict[str, str] = {k: _unit_theme_text(k) for k in UNIT_TYPE_SPECS}


def _unit_rules_text() -> str:
    """系统提示词的第 6 条规则。四种单位逐一列出职责、场景与禁区。"""
    lines = [
        "6. **贴合单位类型**：玩家档案里的「单位类型」决定事件的场景底色。",
        "   四种单位的工作性质截然不同，同一个题材落在不同单位里，出场的人、",
        "   说话的分寸、能动用的资源都不一样，不可张冠李戴：",
    ]
    for idx, (name, spec) in enumerate(UNIT_TYPE_SPECS.items(), 1):
        lines.append(
            f"   （{idx}）【{name}】（{spec['examples']}）：{spec['duty']}。"
            f"场景须落在{spec['scenes']}。"
            f"绝对不得出现：{spec['avoid']}。"
        )
    lines.append(
        "   写之前先问一句：「这个单位的人，一天到晚实际在干什么？」"
        "写完再自查一遍，有没有把某个单位的活儿安到另一个单位头上。"
    )
    return "\n".join(lines)


# 体制内话术示例。明确告知"示例"且要求自然融入，避免模型生硬堆砌。
BUREAUCRATIC_PHRASES = [
    "原则上可以",
    "顾全大局",
    "灵活把握",
    "按程序办",
    "特事特办",
    "一把手工程",
    "压实责任",
    "对标对表",
    "留痕",
    "打招呼",
    "协调一下",
    "组织上会考虑的",
    "这个事先放一放",
    "你懂的",
    "不要有思想包袱",
]

SYSTEM_PROMPT = """你是一款中国基层官场模拟经营游戏的剧本作者。你深谙县乡两级党政机关的运行逻辑、\
人情世故与问责机制，写出的桥段既要真实、有压迫感，又要让玩家在两难中做选择。

# 输出格式（绝对强制）
只输出一个 JSON 对象，不要输出任何其他内容。
禁止使用 markdown 代码块标记（不要出现 ```json 或 ```）。
禁止在 JSON 前后添加任何解释、前言、后记、注释。

JSON 结构必须严格如下，字段名一个字母都不能改：
{
  "id": "evt_<12位以内的小写英文或数字，本局内不得重复>",
  "title": "事件标题，不超过 14 个字",
  "description": "事件正文，80-160 字，第二人称'你'，交代清楚处境与两难",
  "options": [
    {
      "id": "opt_a",
      "text": "选项文案，不超过 20 个字，用第一人称口吻",
      "costAp": 0,
      "effects": { "energy": -10, "kpi": 5, "risk": 8 }
    }
  ]
}

# 字段规则
1. options 必须是 2 到 3 个，选项 id 依次为 opt_a、opt_b、opt_c。
2. costAp 取值 0、1 或 2，代表消耗的行动力。必须至少有一个选项 costAp 为 0，
   否则玩家行动力耗尽时会无路可走。
3. effects 的键只能从这八项里选，中文含义如下：
   energy 精力、authority 威信、mgmt 向上管理、popularity 人缘、
   ability 工作能力、kpi 政绩、risk 廉政风险（越高越危险）、health 健康。
   每个选项只写真正受影响的 2 到 5 项，不要八项全写。
4. effects 的数值为整数，单项绝对值不超过 25，可正可负。

# 内容规则（违反即不合格）
1. **职级匹配**：事件必须与玩家当前职级相称。副镇长不会去谈百亿级项目，
   县长不会亲自去调解邻里纠纷。事务的层级、能调动的人脉、面对的诱惑数额都要对得上。
2. **注入体制内话术**：在 description 或选项文案里自然融入官场黑话，
   例如：原则上可以、顾全大局、灵活把握、按程序办、特事特办、压实责任、
   对标对表、留痕、打招呼、协调一下、组织上会考虑的、这个事先放一放。
   一次用一到两句即可，不要堆砌，不要每句都用。
3. **没有完美选项**：这是最重要的一条。每个选项都必须有真实代价。
   给政绩的必然消耗精力或健康，给上级好感的往往抬高廉政风险，
   拉人缘可能损伤威信或工作能力。严禁出现"全加不减"或明显最优的选项。
   玩家应该感到每个选择都在割肉。
4. **风险与收益对称**：走捷径、打招呼、压下不报，短期给 kpi/mgmt/popularity，
   但必须显著抬高 risk。坚持原则给 authority/ability，但常常得罪人。
5. **措辞克制**：用白描笔法写实，不要写成网络段子，不要出现戏谑、夸张、
   或明示"这是游戏"的表达。
""" + _unit_rules_text()


def _resource_lines(resources: Dict[str, int]) -> str:
    return "、".join(
        f"{RESOURCE_CN.get(k, k)} {resources.get(k, 0)}%" if k in {"risk"}
        else f"{RESOURCE_CN.get(k, k)} {resources.get(k, 0)}/100"
        for k in RESOURCE_CN
    )


def build_forced_theme(status: Any) -> str:
    """
    按当前状态决定强制题材。返回提示词片段；无强制题材时返回空串。

    这是硬性要求，优先级高于模型的自由发挥。
    """
    resources = status.resources
    themes: List[str] = []

    if resources.risk > 50:
        themes.append(
            f"【强制题材】玩家廉政风险已达 {resources.risk}%，处于高危状态。"
            "本次事件必须是纪委暗访、函询谈话、巡视组下沉，"
            "或同僚借机发难的人事斗争。不得生成轻松日常题材。"
        )

    if resources.health < 30:
        themes.append(
            f"【强制题材】玩家健康已跌至 {resources.health}，身体濒临透支。"
            "本次事件必须围绕体检指标异常、住院、家属施压要求调岗展开。"
        )

    return "\n".join(themes)


def build_user_prompt(status: Any) -> str:
    """组装本次请求的用户提示词。"""
    player = status.player
    resources = status.resources
    next_level = status.next_level

    requirement = status.promotion_requirements.get(player.level)
    requirement_text = "（无）"
    if requirement is not None:
        requirement_text = (
            f"工作能力 {requirement.ability}、向上管理 {requirement.mgmt}、"
            f"人缘 {requirement.popularity}、政绩 {requirement.kpi}，"
            f"且廉政风险不得超过 {requirement.risk_max}%"
        )

    gap_lines = _describe_gaps(resources, requirement)
    forced = build_forced_theme(status)
    # 冷却中的事件 id。2.6.0 起不再有"本局已出现过的事件"这个列表——
    # 避重规则改成了冷却期，所以这里能给模型的是"当下正在冷却的那些"。
    used = list(status.game_status.event_cooldown.keys())

    unit_type = getattr(player, "unit_type", "")
    unit_theme = UNIT_TYPE_THEMES.get(unit_type, "（未知单位类型，按常规机关日常处理）")

    sections = [
        "# 玩家当前处境",
        f"姓名：{player.name}　年龄：{player.age} 岁",
        f"单位：{player.unit}（{unit_type}）",
        f"职级：{player.level}　职务：{player.position}",
        f"当前时间：{player.quarter}　剩余行动力：{player.ap}",
        "",
        "# 单位类型与场景底色",
        f"单位类型：{unit_type}",
        f"该单位的日常：{unit_theme}",
        "",
        "# 八项资源现状",
        _resource_lines(resources.model_dump()),
        "",
        "# 本次晋升目标",
        f"玩家正在争取提任：{next_level or '已至阶梯顶点，无晋升空间'}",
        f"提任门槛：{requirement_text}",
        gap_lines,
        "",
        "# 事件池避重",
        (
            f"以下事件 id 近期已出现过（仍在冷却期内），本次请勿重复：{', '.join(used[-20:])}"
            if used else "本局近期没有出现过的事件。"
        ),
    ]

    if forced:
        sections += ["", forced]

    sections += [
        "",
        "# 本次任务",
        f"请生成一个与「{player.position}」这一职务相称的突发事件，"
        "玩家需要在本季度的剩余行动力内做出抉择。",
        "直接输出 JSON，不要任何多余字符。",
    ]

    return "\n".join(sections)


def _describe_gaps(resources: Any, requirement: Any) -> str:
    """点明当前的短板，让模型知道往哪儿加压。"""
    if requirement is None:
        return ""

    pairs = [
        ("工作能力", resources.ability, requirement.ability),
        ("向上管理", resources.mgmt, requirement.mgmt),
        ("人缘", resources.popularity, requirement.popularity),
        ("政绩", resources.kpi, requirement.kpi),
    ]
    short = [f"{label}（{current}/{need}）" for label, current, need in pairs if current < need]

    if not short:
        return "距提任门槛：四项资历已全部达标，当前卡点在廉政风险与机遇。"

    return "距提任门槛尚缺：" + "、".join(short) + "。"


# ──────────────────────────────────────────────────────────────
# 兜底事件
#
# AI 超时、返回非法 JSON、或字段校验不通过时使用，保证游戏永远有事件可出。
# 同样遵守"无完美选项"原则，且按玩家状态挑选贴合的一款。
# ──────────────────────────────────────────────────────────────

FALLBACK_EVENTS: Dict[str, Dict[str, Any]] = {
    "high_risk": {
        "id": "evt_fallback_risk",
        "title": "谈话室里的茶",
        "description": (
            "县纪委监委的两名同志到了镇上，说只是「例行了解情况」，"
            "请你到谈话室坐一坐。茶已经泡好，记录本摊开在桌上。"
            "他们问起了去年那笔专项资金的走向。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "如实说明，把责任揽在自己身上",
                "costAp": 1,
                "effects": {"risk": -15, "mgmt": -8, "authority": 4, "energy": -10},
            },
            {
                "id": "opt_b",
                "text": "按程序办，请他们找分管领导核实",
                "costAp": 0,
                "effects": {"risk": 5, "mgmt": -4, "authority": -3},
            },
        ],
    },
    "low_health": {
        "id": "evt_fallback_health",
        "title": "体检报告",
        "description": (
            "体检报告出来了，医生把你单独留下，指着几项指标说："
            "「这个不能再拖了，必须住院进一步检查。」"
            "桌上还摊着书记刚批转过来的季度任务分解表。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "请一周假，先把身体查清楚",
                "costAp": 1,
                "effects": {"health": 18, "energy": 10, "mgmt": -5, "kpi": -6},
            },
            {
                "id": "opt_b",
                "text": "把报告收进抽屉，等忙完这阵子",
                "costAp": 0,
                "effects": {"health": -12, "kpi": 6, "mgmt": 4, "energy": -8},
            },
        ],
    },
    # ---- 以下四款按单位类型分档，AI 不可用且风险/健康均正常时启用 ----
    "core": {
        "id": "evt_fallback_core",
        "title": "凌晨两点的材料",
        "description": (
            "夜里两点，书记秘书的电话打了进来：明天一早的汇报会要一份材料，"
            "要有高度、有数据、有抓手，天亮前送到。整层楼只剩你办公室还亮着灯，"
            "烟灰缸里已经堆满了。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "通宵赶出来，天亮前送到",
                "costAp": 1,
                "effects": {"energy": -18, "health": -8, "mgmt": 10, "kpi": 8, "authority": 3},
            },
            {
                "id": "opt_b",
                "text": "按程序办，先报个提纲上去",
                "costAp": 0,
                "effects": {"mgmt": -8, "kpi": -5, "energy": 5, "health": 3},
            },
        ],
    },
    "township": {
        "id": "evt_fallback_township",
        "title": "堵在门口的乡亲",
        "description": (
            "二十几个村民堵在镇政府门口，为征地补偿款的事要个说法。"
            "分管领导去县里开会了，电话一直打不通。人群里有人举着手机在录，"
            "前面几个人开始往大门里挤。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "出去见，当场给个答复",
                "costAp": 1,
                "effects": {"popularity": 8, "authority": 5, "risk": 7, "kpi": 4, "energy": -12},
            },
            {
                "id": "opt_b",
                "text": "请信访办按程序接访",
                "costAp": 0,
                "effects": {"popularity": -8, "risk": -4, "kpi": -3, "energy": 4},
            },
        ],
    },
    "marginal": {
        "id": "evt_fallback_marginal",
        "title": "饮水机坏了",
        "description": (
            "办公室的饮水机坏了三天，报修单交上去一直没有动静。"
            "老周端着搪瓷缸子晃过来，说要不你去催催，「年轻人腿脚快」。"
            "走廊尽头的公示栏还空着，上个月的表彰名单一直没人贴。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "去催修，顺手把公示栏贴了",
                "costAp": 1,
                "effects": {"popularity": 5, "energy": -8, "authority": -3},
            },
            {
                "id": "opt_b",
                "text": "不催，等师傅自己来",
                "costAp": 0,
                "effects": {"popularity": -5, "energy": 5, "health": 3, "kpi": -2},
            },
        ],
    },
    "bureau": {
        "id": "evt_fallback_bureau",
        "title": "大厅里的投诉",
        "description": (
            "政务服务大厅，一位群众因为材料不全被窗口退了件，当场举起手机录像，"
            "说要发到网上去。窗口的小同志红着眼圈站在一边，"
            "身后还排着十几号人，都在往这边看。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "出面道歉，特事特办先给他办了",
                "costAp": 1,
                "effects": {"popularity": 8, "risk": 9, "mgmt": -4, "energy": -10},
            },
            {
                "id": "opt_b",
                "text": "按规定不予受理，做好解释",
                "costAp": 0,
                "effects": {"popularity": -7, "authority": 5, "risk": -5, "energy": -4},
            },
        ],
    },
    "default": {
        "id": "evt_fallback_default",
        "title": "下班前的电话",
        "description": (
            "临近下班，分管领导打来电话，说有位「老朋友」想约你吃个便饭，"
            "顺便「汇报点情况」。地点没定，对方说听你安排。"
            "这种事推一次是清高，推两次是不给面子。"
        ),
        "options": [
            {
                "id": "opt_a",
                "text": "去，但只吃饭不谈事",
                "costAp": 1,
                "effects": {"popularity": 6, "mgmt": 3, "risk": 10, "energy": -8},
            },
            {
                "id": "opt_b",
                "text": "推说家里有事，改日再约",
                "costAp": 0,
                "effects": {"risk": -5, "popularity": -6, "mgmt": -3, "energy": 4},
            },
            {
                "id": "opt_c",
                "text": "如实向书记报备一次",
                "costAp": 1,
                "effects": {"risk": -10, "mgmt": 6, "popularity": -8, "authority": 5},
            },
        ],
    },
}


# 单位类型 → 兜底事件键。每种单位都必须有一款，否则 AI 一挂就退回通用事件，
# 单位类型的差异在降级路径上会凭空消失。
_UNIT_FALLBACK_KEYS: Dict[str, str] = {
    "核心部门": "core",
    "基层乡镇": "township",
    "边缘部门": "marginal",
    "常规局委": "bureau",
}


def pick_fallback(status: Any) -> Dict[str, Any]:
    """
    按玩家状态挑最贴合的兜底事件。

    优先级：廉政风险 → 健康 → 单位类型 → 通用。

    前两档是**强制题材**，关乎玩法安全（风险触顶、健康归零都会直接结束本局），
    因此压过单位类型这个"场景底色"——一个风险 90 的乡镇干部，兜底给「饮水机坏了」
    是荒诞的。单位类型只影响代入感，不影响结局，排在其后。

    返回深拷贝：FALLBACK_EVENTS 是模块级常量，直接回传引用会让任何一个调用方
    的改动污染后续所有请求（进程生命周期内一直存在）。
    """
    resources = status.resources
    if resources.risk > 50:
        key = "high_risk"
    elif resources.health < 30:
        key = "low_health"
    else:
        key = _UNIT_FALLBACK_KEYS.get(getattr(status.player, "unit_type", ""), "default")

    return copy.deepcopy(FALLBACK_EVENTS[key])


# 断言：兜底事件的字段必须落在契约内，写错了要在启动时就炸，而不是运行时
def _validate_fallbacks() -> None:
    for name, event in FALLBACK_EVENTS.items():
        assert set(event) == {"id", "title", "description", "options"}, name
        assert event["options"], name
        assert any(o["costAp"] == 0 for o in event["options"]), (
            f"兜底事件 {name} 没有零消耗选项，玩家行动力耗尽时会卡死"
        )
        for option in event["options"]:
            assert set(option) == {"id", "text", "costAp", "effects"}, name
            unknown = set(option["effects"]) - RESOURCE_KEYS
            assert not unknown, f"{name} 的选项 {option['id']} 含未知资源键 {unknown}"
            assert 0 <= option["costAp"] <= 3, name

    # 每种单位类型都要有兜底事件，且指向的键真实存在
    for unit_type, key in _UNIT_FALLBACK_KEYS.items():
        assert key in FALLBACK_EVENTS, f"单位类型 {unit_type} 指向了不存在的兜底事件 {key!r}"
    missing = set(UNIT_TYPES) - set(_UNIT_FALLBACK_KEYS)
    assert not missing, f"以下单位类型没有兜底事件：{sorted(missing)}"

    # 事件 id 不得重复，否则前端的冷却表会把两条当成同一条
    ids = [e["id"] for e in FALLBACK_EVENTS.values()]
    assert len(ids) == len(set(ids)), f"兜底事件 id 重复：{ids}"


_validate_fallbacks()

# 职级阶梯留一份引用，便于将来按职级分档写兜底事件
LEVELS = LEVEL_LADDER


# ══════════════════════════════════════════════════════════════════
# 考公模块
#
# 命题与阅卷。注意分工：**AI 出题、AI 判档，Python 算分、Python 分配。**
# AI 永远不产出分数，只产出 full / half / zero 三档等级，
# 于是"AI 给分不稳定"这个风险被限制在三个离散值上，冲不出硬编码的包络。
# ══════════════════════════════════════════════════════════════════

EXAM_SYSTEM_PROMPT = """你是一款中国基层官场模拟游戏的命题人，负责编写录用考试试题。
你了解行测的出题套路，也熟悉机关里的人情世故与问责逻辑。

# 输出格式（绝对强制）
只输出一个 JSON 对象，不要输出任何其他内容。
禁止使用 markdown 代码块标记（不要出现 ```json 或 ```）。
禁止在 JSON 前后添加任何解释、前言、后记。

{
  "questions": [
    {
      "id": "q1",
      "type": "logic",
      "stem": "题干，不超过 200 字",
      "options": [
        {"id": "opt_a", "text": "选项文案，不超过 40 字"},
        {"id": "opt_b", "text": "..."},
        {"id": "opt_c", "text": "..."},
        {"id": "opt_d", "text": "..."}
      ],
      "best": "opt_b",
      "rationale": "一两句，点明为什么该选项最优、其余选项错在哪"
    }
  ]
}

# 命题规则
1. **必须恰好 5 道题**，id 依次为 q1 到 q5，顺序不可打乱：
   - q1 至 q2：行测逻辑题，type 填 "logic"
   - q3：职场情商与黑话题，type 填 "eq"
   - q4 至 q5：基层突发对策题，type 填 "field"
2. **每题恰好 4 个选项**，id 依次为 opt_a、opt_b、opt_c、opt_d，多一个少一个都不行。
3. best 必须是四个选项 id 之一，代表最符合体制内智慧的那个选项。
4. **选项必须极具迷惑性**：四个选项都要看上去"有道理"，绝不能有明显的凑数项。
   错误选项应当是新人最容易犯的错——书生意气、急于表态、撇清责任、激化矛盾、
   乱拍胸脯。要让考生真的纠结，而不是一眼就能排除。
5. **必须注入体制内黑话**：原则上可以、顾全大局、灵活把握、按程序办、特事特办、
   压实责任、对标对表、留痕、打招呼、协调一下、组织上会考虑的、这个事先放一放、
   不要有思想包袱。黑话要自然嵌进题干或选项，不要生硬堆砌。
6. 行测逻辑题要有**真实的推理内核**——真假话、排列组合、资料分析、定义判断都行，
   只是披上体制内的外衣。不要写成变相的情商题。
7. 基层突发对策题要给出**真实的紧迫情境**（汛情、群体事件、突击检查、
   舆情、安全事故），正确选项应体现"先保人、再报告、按程序"。
8. 背景一律虚构。**严禁出现真实地名、真实机关全称、真实领导人姓名**，
   统一使用「某县」「某镇」「A 村」「甲同志」这类代称。
9. 职场情商题要考"领导潜台词"——领导说出口的话与真实意图之间的落差。
"""

EXAM_GRADE_SYSTEM_PROMPT = """你是考公阅卷人。考生刚刚答完 5 道题，你要给出评判。

# 判档标准（只判三档，绝对不要给分数）
按「体制内智慧」判，不要死板地比对对错：
- "full"：选中的正是最符合体制内智慧的选项。既能办成事，又不留把柄，
  还让各方都过得去。
- "half"：勉强合格。略显书生意气、考虑不周、火候不到，但不至于闯祸。
- "zero"：激化矛盾、推卸责任、乱拍胸脯、越级行事，或者明显答错了。

# 输出格式（绝对强制）
只输出一个 JSON 对象，不要输出任何其他内容。
禁止使用 markdown 代码块标记，禁止任何解释性文字。

{
  "review": [
    {"id": "q1", "grade": "full", "comment": "一句话点评这名考生的这个选择"}
  ],
  "bonus": 0,
  "comment": "给这名考生的总评，两三句话"
}

# 规则
1. review 必须覆盖全部 5 道题，id 与题号一一对应，不可遗漏。
2. grade 只能是 full、half、zero 三者之一，**不要输出分数或百分比**。
3. comment 要具体、犀利，点出问题所在。例如「选择直接上报，虽规避了个人风险，
   但在领导眼里这是缺乏担当」。不要写空泛的鼓励。
4. comment（总评）用白描笔法，两三句话，不要吹捧，也不要刻薄。
"""

# 注：上面这两段（命题与阅卷）**已经没有调用方**——命题与判档都改成了
# 查本地题库，跑这一整套零外部依赖。留着是因为题库的写作规范就是它们：
# 迷惑性选项、体制内黑话、虚构地名、领导潜台词，扩题时照着这个标准写。
# 真要重新接上模型，记得 bonus 那一档已经作废（见 models.EXAM_BONUS_MAX）。


def build_exam_generate_prompt() -> str:
    """出题用的用户提示词。"""
    return "\n".join([
        "# 本次任务",
        "为拟录用人员编写一套 5 道题的单选题试卷。",
        "考生是刚通过笔试、准备分配单位的年轻人，尚无机关工作经验。",
        "",
        "题目难度分布：行测逻辑题考基础智商与阅读理解，职场情商题考向上管理",
        "与读懂领导潜台词，基层突发对策题考危机处理与担当。",
        "",
        "直接输出 JSON，不要任何多余字符。",
    ])


def build_exam_grade_prompt(questions_text: str, player_name: str) -> str:
    """阅卷用的用户提示词。questions_text 由调用方按题渲染好。"""
    return "\n".join([
        "# 考生",
        f"姓名：{player_name or '（未署名）'}",
        "",
        "# 试卷与作答",
        questions_text,
        "",
        "# 本次任务",
        "逐题判档（full / half / zero），给出点评，并决定伯乐加分。",
        "直接输出 JSON，不要任何多余字符。",
    ])


# ──────────────────────────────────────────────────────────────
# 兜底题库
#
# 题库文件读不出来、或抽出来的题不合卷面结构时整卷启用。
# 与兜底事件同理：宁可换一套题，也不能让玩家卡在考场上。
#
# 5 道题的题型配比与分值权重由 models.EXAM_COMPOSITION 决定，
# 这里的顺序必须与之一致（2 逻辑 + 1 情商 + 2 对策），
# 数量也必须是**恰好** 5 道——多一道少一道都会让下面的自检在导入时炸掉。
#
# 卷子从 10 道减到 5 道时，这里从原来的 10 道里挑了 5 道留下，
# 其余（容错纠错定义、真假话、看着办、饭局场面话、征地围堵）没有删，
# 它们都在正式题库 backend/data/questions.json 里，这里只是不再重复一遍。
# ──────────────────────────────────────────────────────────────

FALLBACK_EXAM_QUESTIONS: List[Dict[str, Any]] = [
    # ---- 行测逻辑 2 题 ----
    {
        "id": "q1",
        "type": "logic",
        "stem": "某镇要在 A、B、C、D、E 五个村中选三个建文化广场。已知："
                "① A、B 两村至少选一个；② C、D 两村只能选一个；"
                "③ 若选 E 村，则必选 A 村；④ B、C 两村不能同时入选。"
                "据此可以确定的是：",
        "options": [
            {"id": "opt_a", "text": "A 村一定入选"},
            {"id": "opt_b", "text": "B 村一定入选"},
            {"id": "opt_c", "text": "E 村一定入选"},
            {"id": "opt_d", "text": "D 村一定不入选"},
        ],
        "best": "opt_a",
        "rationale": "穷举全部符合条件的组合只有 {A,C,E}、{A,B,D}、{A,D,E} 三种，A 村在三种里都出现。",
    },
    {
        "id": "q2",
        "type": "logic",
        "stem": "某县 2023 年一般公共预算收入 12.6 亿元，比上年增长 5%；"
                "2022 年比上年增长 8%。则该县 2023 年一般公共预算收入比 2021 年约增长：",
        "options": [
            {"id": "opt_a", "text": "13%"},
            {"id": "opt_b", "text": "5%"},
            {"id": "opt_c", "text": "8%"},
            {"id": "opt_d", "text": "40%"},
        ],
        "best": "opt_a",
        "rationale": "两年累计为 1.05 × 1.08 = 1.134，约增长 13.4%，不是两年增速直接相加的 13% 之外的其他数。",
    },
    # ---- 职场情商与黑话 1 题 ----
    {
        "id": "q3",
        "type": "eq",
        "stem": "班子会上，主要领导听完你的汇报后说：「这个事原则上可以，"
                "你们先拿个方案出来。」最得体的回应是：",
        "options": [
            {"id": "opt_a", "text": "好的书记，我们明天就办完"},
            {"id": "opt_b", "text": "明白，我们按程序报，先把可行性论证做扎实"},
            {"id": "opt_c", "text": "原则上可以，是不是就是还不行？"},
            {"id": "opt_d", "text": "那这个事我们就先放一放"},
        ],
        "best": "opt_b",
        "rationale": "「原则上可以」是留有余地的同意，要领的是「按程序、拿方案」；当场点破或就此搁置都领会反了。",
    },
    # ---- 基层突发对策 2 题 ----
    {
        "id": "q4",
        "type": "field",
        "stem": "汛期暴雨，你值班时接到电话：某村后山出现裂缝，可能有滑坡风险，"
                "山下还有三十多户没有转移。此时你的第一反应是：",
        "options": [
            {"id": "opt_a", "text": "先向县里报告，等上级指示再行动"},
            {"id": "opt_b", "text": "立即通知村干部组织转移，同时报告县应急局和分管领导"},
            {"id": "opt_c", "text": "先派人上山核实，确认裂缝属实后再转移"},
            {"id": "opt_d", "text": "在各村工作群里发一条通知，提醒大家注意防范"},
        ],
        "best": "opt_b",
        "rationale": "群众生命安全高于程序。边转移边报告是唯一正确解——等指示、等核实、发群通知，都是在拿人命赌时间。",
    },
    {
        "id": "q5",
        "type": "field",
        "stem": "周五下午，县里突然通知下周一要来检查「双减」落实情况，"
                "而你分管这条线的台账一直是空白。此时你会：",
        "options": [
            {"id": "opt_a", "text": "周末组织人员突击补台账，先把材料做齐"},
            {"id": "opt_b", "text": "如实向主要领导报告现状，同时梳理已有工作痕迹，把能说清的说清楚"},
            {"id": "opt_c", "text": "请两天病假，把这次检查避过去"},
            {"id": "opt_d", "text": "托人打听检查组由谁带队，先做做工作"},
        ],
        "best": "opt_b",
        "rationale": "突击补台账一旦被看穿，性质就从工作不到位变成弄虚作假；请假和打招呼则是错上加错。",
    },
]


def _validate_exam_fallbacks() -> None:
    """兜底题库同样要在导入时自检，写错了不能留到考场上才炸。"""
    from models import EXAM_QUESTION_COUNT, EXAM_TYPE_BY_INDEX

    assert len(FALLBACK_EXAM_QUESTIONS) == EXAM_QUESTION_COUNT, (
        f"兜底题库应有 {EXAM_QUESTION_COUNT} 道题，实际 {len(FALLBACK_EXAM_QUESTIONS)} 道"
    )
    for idx, q in enumerate(FALLBACK_EXAM_QUESTIONS):
        assert set(q) == {"id", "type", "stem", "options", "best", "rationale"}, q.get("id")
        assert q["id"] == f"q{idx + 1}", f"题号顺序错乱：第 {idx + 1} 道是 {q['id']}"
        # 题型顺序必须与硬编码的权重表一致，否则分值会串位
        assert q["type"] == EXAM_TYPE_BY_INDEX[idx], (
            f"{q['id']} 题型为 {q['type']}，权重表要求 {EXAM_TYPE_BY_INDEX[idx]}"
        )
        assert len(q["options"]) == 4, q["id"]
        ids = [o["id"] for o in q["options"]]
        assert ids == ["opt_a", "opt_b", "opt_c", "opt_d"], q["id"]
        assert q["best"] in ids, f"{q['id']} 的完美选项 {q['best']} 不在选项内"


_validate_exam_fallbacks()
