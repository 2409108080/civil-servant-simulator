# -*- coding: utf-8 -*-
"""
数据契约（后端侧）

职责：校验前端上报的 JSON，确保转发给 DeepSeek 的数据格式无误。
本模块只做校验与序列化，不含任何 AI 调用逻辑。

字段命名：前端为 camelCase，后端为 snake_case，通过 alias 转换。
与 frontend/src/constants/gameConfig.js 逐字段对齐，改动需同步两侧并递增 GAME_VERSION。
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# 八项核心资源的合法键名，用于校验事件效果的作用对象
RESOURCE_KEYS = frozenset(
    {"energy", "authority", "mgmt", "popularity", "ability", "kpi", "risk", "health"}
)

# 单位类型（有序）。决定事件题材的"场景底色"，与前端 gameConfig.js 的 UNIT_TYPES 逐字对齐。
#   核心部门 = 两办/组织部/发改委，离权力近，事急事大
#   基层乡镇 = 乡镇街道，直面群众，矛盾贴身
#   常规局委 = 业务局委，有窗口有执法，按部就班
#   边缘部门 = 工青妇/史志办一类清水衙门，无权无钱无事
UNIT_TYPES: List[str] = ["核心部门", "基层乡镇", "边缘部门", "常规局委"]

# 资产类别与代持方式。与前端 constants/assets.js 的 ASSET_KINDS / ASSET_HOLDERS
# 逐字对齐——前端按这两项查价目表与季度风险，后端只负责拦住拼错的值。
ASSET_KINDS = ("house", "car")
ASSET_HOLDERS = ("self", "proxy")

# 职级阶梯（有序），用于校验 level 合法性及推导下一级
LEVEL_LADDER: List[str] = [
    "乡科级副职",
    "乡科级正职",
    "县处级副职",
    "县处级正职",
    "厅局级副职",
    "厅局级正职",
    "省部级副职",
    "省部级正职",
]


class _Base(BaseModel):
    """统一配置：允许按字段名赋值、禁止多余字段（宁可 422 暴露契约漂移，也不要静默丢数据）"""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class AssetInfo(_Base):
    """
    名下资产（房产、车辆）。

    它和 money 是两回事：money 是随时能动的现金，资产是**已经花出去、
    换成一个看得见的东西**的那部分钱。之所以要分开记，是因为它们在
    财产申报里的意义完全不同——现金可以少报，名下的车房藏不住。
    """

    id: str = Field(..., min_length=1, max_length=40, description="资产唯一 id")
    kind: str = Field(..., description="资产类别：house / car")
    name: str = Field(..., min_length=1, max_length=40, description="资产名，如「奥迪 A6L」")
    price: int = Field(..., ge=0, le=10_000_000_000, description="购入价（元，含代持手续费）")
    holder: str = Field(..., description="登记在谁名下：self 本人 / proxy 亲友代持")
    # 每季末往 risk 上加多少。它让"买了豪车"不是一次性代价，
    # 而是从此每季度都要还的一笔账。
    quarterly_risk: int = Field(0, alias="quarterlyRisk", ge=0, le=20, description="每季末累加的廉政风险")
    acquired_quarter: str = Field("", alias="acquiredQuarter", max_length=20, description="购入时的季度")

    @field_validator("kind")
    @classmethod
    def _kind_known(cls, v: str) -> str:
        if v not in ASSET_KINDS:
            raise ValueError(f"资产类别 {v!r} 不在合法范围内：{list(ASSET_KINDS)}")
        return v

    @field_validator("holder")
    @classmethod
    def _holder_known(cls, v: str) -> str:
        if v not in ASSET_HOLDERS:
            raise ValueError(f"代持方式 {v!r} 不在合法范围内：{list(ASSET_HOLDERS)}")
        return v


class PlayerInfo(_Base):
    """基础信息"""

    name: str = Field(..., min_length=1, max_length=20, description="姓名")
    age: int = Field(..., ge=22, le=65, description="年龄")
    level: str = Field(..., description="职级")
    position: str = Field(..., min_length=1, max_length=30, description="具体职务")
    unit: str = Field(..., min_length=1, max_length=50, description="单位")
    unit_type: str = Field(..., alias="unitType", description="单位类型")
    # 考公成绩。给默认值而不是必填：未参加考公的报文（如旧测试脚本）不应因此 422。
    exam_score: int = Field(0, alias="examScore", ge=0, le=100, description="考公成绩")
    salary: int = Field(..., ge=0, le=1_000_000, description="月薪（元）")
    # 家产（元）。**不属于那八项资源**（RESOURCE_KEYS），没有上限，
    # 所以区间给得很松：它只被用来挡"负数"，不是平衡用的旋钮。
    # 给默认值而不是必填：旧测试脚本的报文里没有这一项，不该因此 422。
    money: int = Field(0, ge=0, le=10_000_000_000, description="家产（元）")
    # 累计非法所得（元）。与 money 是**交叉**关系而不是包含关系：
    # 收下的钱进了 money（照样能花），同时记进这里；花掉之后 money 少了，
    # 这一笔却还在账上——它记的是"纪委手里有多少证据"，不是"你现在有多少钱"。
    # 立案审查时冰箱里能搜出多少、判几年，都看它。
    illicit_wealth: int = Field(
        0, alias="illicitWealth", ge=0, le=10_000_000_000, description="累计非法所得（元）"
    )
    # 累计合法收入（元）。财产申报要算"钱多出来多少"，分母就是它——
    # 没有这一项，`家产 + 资产 - 合法收入` 这个式子根本列不出来。
    # 工资与入职安家费计入，其余一律不计。
    legal_income: int = Field(
        0, alias="legalIncome", ge=0, le=10_000_000_000, description="累计合法收入（元）"
    )
    # 这辈子收过钱没有。**只置位、不复位**：第一次收到赃款时由前端置 true，
    # 退赃清零 illicitWealth 也不会把它改回来。
    #
    # 它不参与任何提示词——AI 写事件不需要知道玩家收没收过钱，
    # 同一件事对谁都该是同一个写法。放在这里纯粹是因为 extra="forbid"：
    # 前端把整个 player 原样发过来，模型里少一个字段就是一次 422，
    # 而 422 的表现是"事件生成失败、退回了兜底事件"，不是"少了个字段"。
    # 契约漂移必须当场暴露，所以宁可在这里多留一行。
    has_illicit_record: bool = Field(
        False, alias="hasIllicitRecord", description="是否有案底（收过钱）"
    )
    assets: List[AssetInfo] = Field(default_factory=list, description="名下资产")
    quarter: str = Field(..., min_length=1, max_length=20, description="当前季度，形如 第1年 Q3")
    ap: int = Field(..., ge=0, le=10, alias="ap", description="行动力")

    @field_validator("level")
    @classmethod
    def _level_in_ladder(cls, v: str) -> str:
        if v not in LEVEL_LADDER:
            raise ValueError(f"职级 {v!r} 不在合法阶梯内：{LEVEL_LADDER}")
        return v

    @field_validator("unit_type")
    @classmethod
    def _unit_type_known(cls, v: str) -> str:
        # 与 level 同样的从严策略：单位类型直接决定事件题材，
        # 写错（如「乡镇」「基层乡镇 」）会让 AI 退化成通用事件却不报错，宁可当场 422。
        if v not in UNIT_TYPES:
            raise ValueError(f"单位类型 {v!r} 不在合法范围内：{UNIT_TYPES}")
        return v


class Resources(_Base):
    """核心资源（八项）。区间与前端 RESOURCE_LIMITS 严格一致。"""

    energy: int = Field(..., ge=0, le=100, description="精力")
    authority: int = Field(..., ge=0, le=100, description="威信")
    mgmt: int = Field(..., ge=0, le=100, description="向上管理")
    popularity: int = Field(..., ge=0, le=100, description="人缘")
    ability: int = Field(..., ge=0, le=100, description="工作能力")
    kpi: int = Field(..., ge=0, le=150, description="政绩")
    risk: int = Field(..., ge=0, le=100, description="廉政风险（百分比）")
    health: int = Field(..., ge=0, le=100, description="健康")


class EventOption(_Base):
    """事件选项。【提案】当前事件对象的结构尚未定稿，待确认后可调整。"""

    id: str = Field(..., min_length=1, description="选项标识")
    text: str = Field(..., min_length=1, max_length=200, description="选项文案")
    cost_ap: int = Field(1, ge=0, le=3, alias="costAp", description="消耗行动力")
    effects: Optional[Dict[str, int]] = Field(
        None, description="各资源增减量，键须为七项资源之一"
    )

    @field_validator("effects")
    @classmethod
    def _effects_keys_valid(cls, v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if v is None:
            return v
        illegal = set(v) - RESOURCE_KEYS
        if illegal:
            raise ValueError(f"效果作用于未知资源：{sorted(illegal)}")
        return v


class GameEvent(_Base):
    """当前触发的事件。【提案】同上，待确认。"""

    id: str = Field(..., min_length=1, description="事件标识")
    title: str = Field(..., min_length=1, max_length=50, description="事件标题")
    description: str = Field(..., min_length=1, description="事件正文")
    options: List[EventOption] = Field(..., min_length=1, description="可选方案")


class GameStatus(_Base):
    """游戏状态"""

    current_event: Optional[GameEvent] = Field(None, alias="currentEvent")
    show_event_modal: bool = Field(False, alias="showEventModal")
    game_over: bool = Field(False, alias="gameOver")
    game_over_reason: str = Field("", alias="gameOverReason", max_length=200)
    game_over_ending: str = Field("", alias="gameOverEnding", max_length=30)
    # 冷却中的事件：id → 冷却结束的绝对季度序号，供提示词避重。
    # 2.6.0 起取代 used_event_ids（原先记的是"本局已出现过的事件 id"）——
    # 避重规则从"见过就永久排除"改成"结算后 4 个季度内不再出现"，见
    # frontend/src/constants/gameConfig.js 的 EVENT_COOLDOWN_QUARTERS。
    event_cooldown: Dict[str, int] = Field(default_factory=dict, alias="eventCooldown")


class PromotionRequirement(_Base):
    """
    单条提任门槛。键为【当前】职级，值为提任下一级所需条件。

    risk_max 为廉政风险上限，一票否决：风险超标时不看其余四项是否达标。
    '省部级正职' 作为阶梯顶点占位，各字段均为 0，不参与判定。
    """

    ability: int = Field(..., ge=0, le=100)
    mgmt: int = Field(..., ge=0, le=100)
    popularity: int = Field(..., ge=0, le=100)
    kpi: int = Field(..., ge=0, le=150)
    risk_max: int = Field(..., ge=0, le=100, alias="riskMax", description="廉政风险上限")


class PlayerStatus(_Base):
    """
    前端上报的完整档案，也是后续喂给 DeepSeek 的唯一入参载体。

    示例报文体：
    {
      "gameVersion": "1.3.0",
      "player": { "name": "李明", "age": 24, "level": "乡科级副职",
                  "unit": "XX镇人民政府", "unitType": "基层乡镇", ... },
      "resources": { "energy": 100, "authority": 30, "health": 100, ... },
      "gameStatus": { "currentEvent": null, "showEventModal": false, ... },
      "promotionRequirements": {
        "乡科级副职": { "ability": 40, "mgmt": 30, "popularity": 30, "kpi": 0, "riskMax": 20 }
      }
    }
    """

    game_version: str = Field(..., alias="gameVersion", description="存档版本号")
    player: PlayerInfo
    resources: Resources
    game_status: GameStatus = Field(..., alias="gameStatus")
    # 晋升门槛字典。后端不持久化任何玩家数据，故由前端随请求携带。
    promotion_requirements: Dict[str, PromotionRequirement] = Field(
        default_factory=dict, alias="promotionRequirements"
    )

    @field_validator("promotion_requirements")
    @classmethod
    def _requirements_keys_valid(
        cls, v: Dict[str, PromotionRequirement]
    ) -> Dict[str, PromotionRequirement]:
        illegal = set(v) - set(LEVEL_LADDER)
        if illegal:
            raise ValueError(f"晋升字典含未知职级：{sorted(illegal)}")
        return v

    # ---- 以下为便捷读取方法，供后续 prompts.py 组装提示词使用 ----

    @property
    def next_level(self) -> Optional[str]:
        """当前职级的上一级；已到终点返回 None"""
        try:
            idx = LEVEL_LADDER.index(self.player.level)
        except ValueError:
            return None
        return LEVEL_LADDER[idx + 1] if idx + 1 < len(LEVEL_LADDER) else None

    def to_prompt_payload(self) -> Dict[str, Any]:
        """裁剪为提示词用的精简结构（去界面态、去空字段）"""
        return {
            "gameVersion": self.game_version,
            "player": self.player.model_dump(),
            "resources": self.resources.model_dump(),
            "nextLevel": self.next_level,
            "promotionRequirements": {
                k: v.model_dump() for k, v in self.promotion_requirements.items()
            },
        }


# ══════════════════════════════════════════════════════════════════
# 考公模块
#
# 设计原则：**命题、判档、分值、分配全都在本地，没有任何外部依赖。**
# 卷子从题库抽，每题的三档等级（full / half / zero）查题库里写好的答案键；
# 权重与分配红线写死在本文件里，
# 因此这套卷子无论抽到哪五道题，都跑不出 [0, 100] 这个包络。
# ══════════════════════════════════════════════════════════════════

# 题型：logic 行测逻辑 / eq 职场情商与黑话 / field 基层突发对策
EXAM_TYPES = ("logic", "eq", "field")

EXAM_TYPE_LABELS = {
    "logic": "行测逻辑",
    "eq": "职场情商",
    "field": "基层对策",
}

# 题型配比与单题分值（策划案定稿，改这里就是改考卷）
#
# 5 道题 × 20 分 = 100 分，**满分即全对**。所以伯乐加分退场了：
# 它本来是为了在"基础分上限 95"的卷面上把最后那 5 分补出来，
# 现在第 5 道题自己就把这个缺口填上了，再加一个加分项，
# 成绩单上印的满分就不是 100 了（见下面 EXAM_BONUS_MAX 那段）。
#
# 配比 2 逻辑 / 1 情商 / 2 对策，落到分项上正好是
# 逻辑 40 / 情商 20 / 基层对策 40——成绩单上那三行就是这么来的。
EXAM_COMPOSITION = (
    ("logic", 2, 20),   # 2 题 × 20 分 = 40
    ("eq", 1, 20),      # 1 题 × 20 分 = 20
    ("field", 2, 20),   # 2 题 × 20 分 = 40
)

EXAM_QUESTION_COUNT = sum(n for _, n, _ in EXAM_COMPOSITION)     # 5
EXAM_BASE_MAX = sum(n * w for _, n, w in EXAM_COMPOSITION)       # 100

# 伯乐加分上限。**故意是 0，不是漏填**：
# 每题 20 分、五题加满正好 100，卷面本身已经没有留给"酌情"的空间。
# 留着这个常量而不是把字段删掉，是因为成绩单的响应契约里还有 bonus 一项
# （见 ExamResult），前端按 result.bonus > 0 决定要不要印那一行——
# 契约不动，那个分支就永远不会亮，不需要改前端。
EXAM_BONUS_MAX = 0
EXAM_MAX_SCORE = EXAM_BASE_MAX + EXAM_BONUS_MAX                  # 100

# 按题号展开的题型与权重。**下标即题号，题型由序号决定，不采信 AI 自报的 type**，
# 否则模型全出 5 分的逻辑题，满分就只剩 50。
EXAM_TYPE_BY_INDEX: List[str] = [t for t, n, _ in EXAM_COMPOSITION for _ in range(n)]
EXAM_WEIGHT_BY_INDEX: List[int] = [w for _, n, w in EXAM_COMPOSITION for _ in range(n)]

assert len(EXAM_TYPE_BY_INDEX) == EXAM_QUESTION_COUNT
assert len(EXAM_WEIGHT_BY_INDEX) == EXAM_QUESTION_COUNT

# AI 判档 → 得分系数。只认这三档，出现别的值一律按 0 处理（safe default）。
EXAM_GRADE_FACTORS = {"full": 1.0, "half": 0.5, "zero": 0.0}

EXAM_GRADE_LABELS = {"full": "满分", "half": "半分", "zero": "零分"}

# 分配红线（策划案定稿）。按分数从高到低匹配，第一个满足 score >= min 的即为结果。
# position 是随单位走的初始职务——只改 unit 不改 position 会出现
# 「市委办公室·副镇长」这种自相矛盾的档案。
#
# 三条线是 80 / 60 / 40，对着"答对几题"看就是 4 题 / 3 题 / 2 题
# （每题 20 分，半分那道算 10 分，落在哪档按分算，不为半分单开规则）。
# 因为单题分值统一成 20，原始分只可能是 10 的倍数，
# 早先那个"59.5 被舍入抬进上一档"的问题从结构上不存在了。
EXAM_TIERS: List[Dict[str, Any]] = [
    {
        "min_score": 80,
        "unit_type": "核心部门",
        "unit": "市委办公室",
        "position": "市委办公室综合科副科长",
        "comment": "笔试名列前茅。市委办要的就是能写、能熬、能扛的年轻人。",
        "attribute_bonus": {"ability": 10, "mgmt": 10, "authority": 5},
    },
    {
        "min_score": 60,
        "unit_type": "常规局委",
        "unit": "市财政局",
        "position": "市财政局预算科副科长",
        "comment": "成绩扎实。业务局委不求出彩，但求无过，正需要你这样稳当的人。",
        "attribute_bonus": {"ability": 6, "mgmt": 6, "popularity": 6},
    },
    {
        "min_score": 40,
        "unit_type": "基层乡镇",
        "unit": "XX镇人民政府",
        "position": "副镇长",
        "comment": "分数中庸，但基层最缺肯干事的人。先下去摔打两年，未必是坏事。",
        "attribute_bonus": {"popularity": 10, "ability": 5, "kpi": 5},
    },
    {
        "min_score": 0,
        "unit_type": "边缘部门",
        "unit": "市档案局",
        "position": "市档案局业务科副科长",
        "comment": "成绩不理想。清水衙门事少人闲，倒也不失为一个养人的去处。",
        # 养生局的补偿要落在"不会被上限吃掉"的资源上：
        # 原来给的精力/健康初始值本就是上限 100，加了个寂寞。
        # 改成好人缘 + 低风险——远离权力中心，自然少是非。
        "attribute_bonus": {"popularity": 10, "risk": -10},
    },
]

assert EXAM_TIERS[-1]["min_score"] == 0, "分配红线必须兜住 0 分，否则会出现无单位可去的情况"
for _tier in EXAM_TIERS:
    assert _tier["unit_type"] in UNIT_TYPES, _tier["unit_type"]
    assert not set(_tier["attribute_bonus"]) - RESOURCE_KEYS, _tier["unit_type"]


class ExamOption(_Base):
    """考公题目的选项"""

    id: str = Field(..., min_length=1, max_length=10)
    text: str = Field(..., min_length=1, max_length=200)


class ExamQuestion(_Base):
    """一道考公单选题"""

    id: str = Field(..., min_length=1, max_length=20)
    # AI 自报的题型，仅供排查问题用；计分时一律按题号覆写，不采信此值
    type: str = Field("logic", description="题型，计分时由后端按题号覆写")
    stem: str = Field(..., min_length=1, max_length=400, description="题干")
    options: List[ExamOption] = Field(..., min_length=3, max_length=4)
    best: str = Field(..., description="完美选项的 id")
    rationale: str = Field("", max_length=400, description="出题人视角的解析")

    @field_validator("best")
    @classmethod
    def _best_in_options(cls, v: str, info) -> str:
        options = info.data.get("options") or []
        if options and v not in {o.id for o in options}:
            raise ValueError(f"完美选项 {v!r} 不在选项列表内")
        return v


class ExamGenerateRequest(_Base):
    """出题请求。目前不需要入参，保留结构以便将来按职级/单位定制题库。"""

    player_name: str = Field("", alias="playerName", max_length=20)


class ExamEvaluation(_Base):
    """玩家某一题的作答"""

    question_id: str = Field(..., alias="questionId", min_length=1, max_length=20)
    choice: str = Field(..., min_length=1, max_length=10, description="所选选项 id")


class ExamEvaluateRequest(_Base):
    """
    阅卷请求。

    本服务不持久化任何数据，服务端手里没有题库，因此**原题必须随请求回传**。
    代价是完美选项 best 会下发到前端（单人本地游戏，无对抗性，可接受）；
    换来的是阅卷完全可复现——不依赖任何服务端状态。
    """

    player_name: str = Field("", alias="playerName", max_length=20)
    questions: List[ExamQuestion] = Field(..., min_length=1)
    answers: List[ExamEvaluation] = Field(..., min_length=1)

    @field_validator("questions")
    @classmethod
    def _composition_ok(cls, v: List[ExamQuestion]) -> List[ExamQuestion]:
        if len(v) != EXAM_QUESTION_COUNT:
            raise ValueError(
                f"题目数量必须为 {EXAM_QUESTION_COUNT} 道，收到 {len(v)} 道"
            )
        ids = [q.id for q in v]
        if len(ids) != len(set(ids)):
            raise ValueError("题目 id 重复")
        return v

    @model_validator(mode="after")
    def _answers_match_questions(self) -> "ExamEvaluateRequest":
        """
        每一条作答都必须落在本次试卷的题号上，且不得重复。

        允许少答（玩家跳过的题按零分计），但不允许答到不存在的题号、也不允许
        选一个该题根本没有的选项：两者都意味着客户端与服务端的试卷对不上，
        若放行，整张卷子会被静默判成 0 分——那是最难查的一类 Bug，
        宁可在这里直接 422 报出来。跳过的题请直接不传，而不是传个假选项。
        """
        options_of = {q.id: {o.id for o in q.options} for q in self.questions}
        seen: set = set()
        for answer in self.answers:
            if answer.question_id not in options_of:
                raise ValueError(f"作答的题号 {answer.question_id!r} 不在本次试卷中")
            if answer.question_id in seen:
                raise ValueError(f"题号 {answer.question_id!r} 重复作答")
            if answer.choice not in options_of[answer.question_id]:
                raise ValueError(
                    f"题号 {answer.question_id!r} 没有选项 {answer.choice!r}"
                )
            seen.add(answer.question_id)
        return self


class ExamReviewItem(_Base):
    """成绩单里的单题回顾，供玩家复盘"""

    question_id: str = Field(..., alias="questionId")
    index: int = Field(..., ge=1, description="题号，从 1 开始")
    type_label: str = Field(..., alias="typeLabel")
    stem: str
    your_choice: str = Field(..., alias="yourChoice")
    your_choice_text: str = Field(..., alias="yourChoiceText")
    best_choice: str = Field(..., alias="bestChoice")
    best_choice_text: str = Field(..., alias="bestChoiceText")
    grade: str = Field(..., description="full / half / zero")
    grade_label: str = Field(..., alias="gradeLabel")
    weight: int
    earned: float
    comment: str = Field("", description="AI 对该选项的点评")
    rationale: str = Field("", description="出题人解析")


class ExamBreakdownItem(_Base):
    """按题型汇总的得分"""

    type_label: str = Field(..., alias="typeLabel")
    count: int
    full_score: int = Field(..., alias="fullScore")
    earned: float


class ExamResult(_Base):
    """
    阅卷结果。

    分数与分配全部由 Python 算出：三档等级与每题点评来自题库，
    分项得分与红线见 EXAM_COMPOSITION 与 EXAM_TIERS。

    bonus 是伯乐加分，**恒为 0**（理由见 EXAM_BONUS_MAX）。字段保留是契约问题：
    前端按 result.bonus > 0 决定要不要印那一行，撤字段会连累成绩单。
    """

    score: int = Field(..., ge=0, le=EXAM_MAX_SCORE)
    base_score: float = Field(..., alias="baseScore")
    bonus: int = Field(..., ge=0, le=EXAM_BONUS_MAX, description="伯乐加分")
    max_score: int = Field(EXAM_MAX_SCORE, alias="maxScore")
    unit_type: str = Field(..., alias="unitType")
    unit: str
    position: str
    comment: str = Field(..., description="录用通知里的评语")
    ai_comment: str = Field("", alias="aiComment", description="AI 总评")
    attribute_bonus: Dict[str, int] = Field(..., alias="attributeBonus")
    breakdown: List[ExamBreakdownItem]
    review: List[ExamReviewItem]
