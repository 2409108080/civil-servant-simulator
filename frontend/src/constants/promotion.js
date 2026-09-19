/**
 * 晋升条件字典
 *
 * 语义约定：键 = 玩家【当前】职级，值 = 提任到【下一级】所需的最低门槛。
 * 例：玩家当前为"乡科级副职"，四项资源达到 { ability:40, mgmt:30, popularity:30, kpi:0 }
 *     且 risk <= 20，方满足提任"乡科级正职"的资历条件。
 *
 * 关于第 8 行：'省部级正职' 是阶梯顶点，没有"下一级"可升，该行为终点占位
 * （门槛字段全为 0），判定时由 nextLevelOf() 返回 null 直接拦截，不参与计算。
 * 保留它是为了让字典行数与职级数严格 1:1，避免后续维护时数漏。
 *
 * 关于 riskMax：廉政风险上限，一票否决——"带病提拔"是高压线。
 * 风险超标不看其他四项是否达标，直接触发暂缓提拔或纪委约谈，详见 evaluatePromotion()。
 */

import { RESOURCE_LABELS } from './gameConfig'

// 职级阶梯（有序）。用于推导"下一级"、判断是否已到终点。
export const LEVEL_LADDER = [
  { level: '乡科级副职', typicalPosition: '副镇长' },
  { level: '乡科级正职', typicalPosition: '镇长' },
  { level: '县处级副职', typicalPosition: '副县长' },
  { level: '县处级正职', typicalPosition: '县长' },
  { level: '厅局级副职', typicalPosition: '副市长' },
  { level: '厅局级正职', typicalPosition: '市长' },
  { level: '省部级副职', typicalPosition: '副省长' },
  { level: '省部级正职', typicalPosition: '省长' } // 阶梯顶点
]

// riskMax 一栏 1.4.0 整体上调（原 20/20/15/15/12/10/8）。玩家实测反馈"一票否决
// 卡得太死"：门槛越高，事件库里加风险的事反而越多，风险几乎只涨不落，
// 一旦越线就再也回不来，攒的政绩全废。放宽后越线仍然要付出代价（危机公关），
// 但不再是死局。
export const PROMOTION_REQUIREMENTS = {
  '乡科级副职': { ability: 40, mgmt: 30, popularity: 30, kpi: 0, riskMax: 35 },
  '乡科级正职': { ability: 55, mgmt: 45, popularity: 45, kpi: 20, riskMax: 30 },
  '县处级副职': { ability: 65, mgmt: 60, popularity: 55, kpi: 45, riskMax: 25 },
  '县处级正职': { ability: 75, mgmt: 70, popularity: 65, kpi: 75, riskMax: 20 },
  '厅局级副职': { ability: 82, mgmt: 80, popularity: 72, kpi: 100, riskMax: 20 },
  '厅局级正职': { ability: 88, mgmt: 88, popularity: 80, kpi: 125, riskMax: 20 },
  '省部级副职': { ability: 93, mgmt: 94, popularity: 86, kpi: 145, riskMax: 20 },
  '省部级正职': { ability: 0, mgmt: 0, popularity: 0, kpi: 0, riskMax: 0 } // 终点占位
}

/**
 * 职级档位。阶梯 8 级两两并档（科级/处级/厅级/省部级）。
 *
 * 放在这里而不是事件库里，是因为它有两个消费方：事件池按档取料（mock/localEvents.js），
 * 薪级表按档定月薪（constants/money.js）。抄两份的话，将来阶梯加一级，
 * 总有一边会静默漏掉新职级。
 */
export const BANDS = ['科级', '处级', '厅级', '省部级']

/** 职级 → 档位。未知职级返回 null，由调用方决定怎么兜底 */
export function bandOfLevel(level) {
  const idx = LEVEL_LADDER.findIndex((item) => item.level === level)
  if (idx === -1) return null
  return BANDS[Math.floor(idx / 2)] || BANDS[BANDS.length - 1]
}

// 参与门槛比对的四项资源（risk 单独走一票否决，不在此列）
export const PROMOTION_GATES = ['ability', 'mgmt', 'popularity', 'kpi']

/**
 * 名望加成：威信折算成门槛分的比率。
 *
 * 加这个是因为威信此前是个**废属性**——它只在事件结算里加减，不进任何判定。
 * 玩家几十局下来会发现涨威信不如涨工作能力，于是这条资源条等于不存在，
 * 而它占着八分之一的位置、还在事件里分走了不少选项的收益。
 *
 * 规则：每 10 点威信，四项资历门槛在**判定时**各视作 +1。
 * 上限 +10（威信满 100）。这个上限是刻意压着的：
 *   · 科级门槛 40，+10 是 25% 的折扣，前期威信能实打实帮你够线；
 *   · 省部级政绩门槛 145（政绩上限才 150），+10 只有 7%。
 * 也就是说"名望"越往上越顶不了硬资历——这跟体制里的实际观感是一致的，
 * 组织上不会因为你有威信就免了你的政绩。
 *
 * 为什么是"判定时视作"而不是直接加在 resources 上：威信是资源条上
 * 玩家看得见的一个数。悄悄给它加 6 点，资源条写着 62、判定按 68 算，
 * 两个数字对不上，玩家只会认为界面算错了。
 */
export const AUTHORITY_PER_BONUS = 10

/** 威信折算出的名望分。威信 62 → 6 */
export function authorityBonusOf(resources) {
  const authority = Number((resources && resources.authority) || 0)
  if (!(authority > 0)) return 0
  return Math.floor(authority / AUTHORITY_PER_BONUS)
}

/**
 * 风险超标的处置分档：
 *   risk <= riskMax                     → 通过
 *   riskMax < risk <= riskMax + margin  → 暂缓提拔（组织上再"观察观察"）
 *   risk >  riskMax + margin            → 纪委约谈（直接进谈话函询流程）
 * 该 margin 为建议值，待策划复核。
 */
export const RISK_INTERVIEW_MARGIN = 15

/**
 * 最低任职年限：任现职满 10 个季度（2.5 年）才列入提任考虑。
 *
 * ── 为什么要有这一条 ────────────────────────────────────────
 * 加它之前跑过 200 局「正常玩」模拟，最快登顶 37 岁、平均 37.9 岁，
 * 而策划要的是 45~55 岁。查下来根因不是"收益给多了"，是**阶梯没有时间成本**：
 * 四项门槛里能力与政绩很早顶到上限，只剩人缘在爬；人缘一季涨 18~20 点，
 * 而相邻两级的人缘门槛只差 8~10 点，于是人缘一旦补上，
 * 后面五级是**一个季度一级**连跳上去的（实测轨迹：13Q2 到 14Q3 连升五级）。
 *
 * 同时验证过"把正向属性收益整体调低"这条路：×0.8 就全线崩盘
 * （登顶率 0.4% → 0%，平均止步从第 2.5 级掉到第 1.3 级）——
 * 门槛是硬阈值，现在的收益量是"刚刚够跨过去"，往下调不是变慢，是变不可能。
 *
 * 任职年限就不一样：它是**线性、可预测**的地板，且只挡前面那一小撮跑得最快的人
 * （实测平均止步职级只从 2.5 掉到 2.2），不会误伤本来就上不去的多数。
 * 这跟体制内的实际规则也是一致的——提任下一级本来就有任职年限要求。
 *
 * 实测对照（每档 500 局，其余不变）：
 *   无年限 → 最快 38 岁   2 年 → 46 岁   2.5 年 → 49 岁   3 年 → 51 岁
 * 取 2.5 年在目标区间 45~55 的中位偏下，留一点余量。
 */
export const MIN_TENURE_QUARTERS = 10
/** 同上，换算成年，只用于文案 */
export const MIN_TENURE_YEARS = MIN_TENURE_QUARTERS / 4

export const AUDIT_BASE_PASS = 0.8
export const AUDIT_PENALTY_PER_MILLION = 0.05
export const AUDIT_MIN_PASS = 0.2

/**
 * 审查未通过后挂起几个季度。6 个季度 = 一年半。
 *
 * ── 为什么单靠"本次否决"不够 ────────────────────────────────
 * 审查只在"四项 + 年限全达标"的那一季触发，而贪腐流**连续很多季都达标**：
 * 实测每局掷骰中位 9 次、最多 20 次。按 65% 通过率，掷 9 次全不过的概率是
 * 0.35^9 ≈ 0.0001——单次否决 + 下季再来，数学上等于没有这道关，
 * 平均只把提任推迟约 1.5 个季度。60 局实测：不走动的登顶率 8.3%（达标），
 * 会走动的 16.7%（目标 5~10%，没压住）。
 *
 * 挂起才是真正的闸门：把"每季重掷一次"变成"失败一次就出局一段时间"，
 * 掷骰次数从 9 次量级降到个位数，这道关才咬得住。
 *
 * 6 是 200 局（种子 2000~2199）扫出来的：2 季 15.5% / 3 季 11.5% /
 * 4 季 13% / **6 季 8%**——只有 6 季让"会走动"与"不走动"两个画像的
 * 登顶率同时落进 5~10%，且落马率仍在 40~60% 内。挂 12 季会过度
 * （走动 6.7%，把人彻底按住，提任的挫败感盖过廉政审查本身的意义）。
 *
 * 一年半在体制内也是个说得通的时长：够一次审查结论走完，
 * 又不至于让一个干部的政治生命就此停摆。
 */
export const AUDIT_HOLD_QUARTERS = 6

/** 审查未通过的通报。面板、季末通报、结局都用这一句，避免三处各写各的 */
export const AUDIT_FAIL_NOTE =
  '廉政审查未通过，材料挂起，一年半内不列入提任考虑。'

/**
 * 廉政审查：有案底的人提任时多过的一道关。
 *
 * ── 为什么要有这一道 ────────────────────────────────────────
 * 记账漏洞修掉之后，贪腐流的落马率回到了 51.7%（目标 40~60%），
 * 但登顶率还停在 16.7%，目标是 5~10%。差的这一截是**幸存者**：
 * 差额还没攒到立案线、或者赌赢了决定书的那批人，照样一级一级往上走。
 * 而现实里"带病提拔"本来就是组织上最防的一件事——
 * 差额没到立案线不等于组织上不知道，只等于还不到收网的时候。
 *
 * ── 通过率为什么跟金额挂钩 ──────────────────────────────────
 * 审查不是掷一次骰子，是**看材料**：账上说不清的部分越多，
 * 能自圆其说的空间越小。这条曲线与决定书上狡辩成功率同源
 * （见 investigation.js 的 excuseOdds，那边是每百万扣 3 个点）——
 * 同一笔赃款，在决定书上让你张不开嘴，在审查室里同样让你张不开嘴。
 *
 * 退过赃的人这里会轻松很多：surrender() 把 illicitWealth 清零，
 * 于是审查通过率回到 80%。这是**有意**的——账已经交清了，
 * 组织上要看的正是"有没有交清"，而不是"历史上有没有拿过"。
 *
 * ── 为什么单独成一个函数，不并进 evaluatePromotion ──────────
 * evaluatePromotion 是**纯函数**，PromotionPanel.vue 每次渲染都会调它。
 * 把掷骰子塞进去，面板显示的结果会和季末裁定的结果不是同一次——
 * 玩家看到"通过"，季末却被告知没通过，那是这个界面上最不该有的东西。
 * 所以这里只提供**通过率**（纯函数、可测），掷骰子由引擎在裁定那一刻做。
 *
 * @param {number} illicitWealth 累计非法所得（退赃后已清零）
 * @returns {number} 通过率 0~1
 */
export function auditPassOddsOf(illicitWealth) {
  const millions = (Number(illicitWealth) || 0) / 1000000
  const odds = AUDIT_BASE_PASS - millions * AUDIT_PENALTY_PER_MILLION
  return Math.max(AUDIT_MIN_PASS, Math.min(1, odds))
}

// 提任裁定结果
export const PROMOTION_VERDICT = {
  PROMOTABLE: 'promotable',         // 条件达标，可上会研究
  PENDING: 'pending',               // 资历未到，暂缓提拔
  TENURE_PENDING: 'tenure_pending', // 四项都达标了，只是任现职年限不够
  RISK_SUSPENDED: 'risk_suspended', // 廉政风险超标，暂缓提拔
  RISK_INTERVIEW: 'risk_interview', // 廉政风险严重超标，触发纪委约谈
  AUDIT_FAILED: 'audit_failed',     // 四项与年限都达标，廉政审查没过（有案底）
  AUDIT_HELD: 'audit_held',         // 审查已挂起，本季连骰子都不掷
  TERMINAL: 'terminal',             // 已到阶梯顶点，无可再升
  NO_CONFIG: 'no_config'            // 字典缺该职级配置（数据异常，需排查）
}

/** 取某职级的下一级，已到顶点返回 null */
export function nextLevelOf(level) {
  const idx = LEVEL_LADDER.findIndex((item) => item.level === level)
  if (idx === -1 || idx === LEVEL_LADDER.length - 1) return null
  return LEVEL_LADDER[idx + 1].level
}

/**
 * 取某职级的上一级，已在最底层（或职级不在阶梯里）返回 null。
 *
 * 降级用的。只在"认罪退赃、降一级使用"这一处用到——
 * 它不参与晋升逻辑，所以刻意不给它任何门槛判定：
 * 降级是组织决定，不看你的四项达标没有。
 */
export function prevLevelOf(level) {
  const idx = LEVEL_LADDER.findIndex((item) => item.level === level)
  if (idx <= 0) return null
  return LEVEL_LADDER[idx - 1].level
}

/** 取某职级的提任门槛，无配置返回 null */
export function requirementOf(level) {
  return PROMOTION_REQUIREMENTS[level] || null
}

/**
 * 提任裁定。纯函数，前端与后端可共用同一套规则。
 *
 * @param {Object} resources      八项资源当前值
 * @param {string} level          玩家当前职级
 * @param {number} [tenureQuarters] 任现职已满几个季度。**不给就不判年限**——
 *        这让不掌握年限的调用方（如只渲染资源条的场景）行为与加这一条之前完全一致，
 *        不必为了签名完整硬塞一个假值进来。
 * @returns {{
 *   verdict: string,        // PROMOTION_VERDICT 之一
 *   level: string,          // 当前职级
 *   nextLevel: string|null, // 拟提任职级
 *   requirement: Object|null,
 *   missing: Array<{key, label, current, raw, required}>, // 尚缺的门槛（current 已含名望分）
 *   riskOver: number,       // 风险超出上限的幅度，未超标为 0
 *   authorityBonus: number, // 威信折算出的名望分（四项门槛各 +这么多）
 *   tenureQuarters: number|null, // 任现职季度数，未知为 null
 *   tenureShort: number,    // 还差几个季度才够年限，够或未知为 0
 *   reason: string          // 面向玩家的说辞
 * }}
 */
export function evaluatePromotion(resources, level, tenureQuarters) {
  const next = nextLevelOf(level)
  const authorityBonus = authorityBonusOf(resources)
  const knownTenure = Number.isFinite(Number(tenureQuarters))
  const tenure = knownTenure ? Number(tenureQuarters) : null
  const tenureShort = knownTenure ? Math.max(0, MIN_TENURE_QUARTERS - tenure) : 0

  // 已到顶点
  if (!next) {
    return {
      verdict: PROMOTION_VERDICT.TERMINAL,
      level,
      nextLevel: null,
      requirement: null,
      missing: [],
      riskOver: 0,
      authorityBonus,
      tenureQuarters: tenure,
      tenureShort: 0,
      reason: '已至阶梯顶点，再无提任空间。'
    }
  }

  const req = requirementOf(level)
  const base = {
    level,
    nextLevel: next,
    requirement: req,
    missing: [],
    riskOver: 0,
    authorityBonus,
    tenureQuarters: tenure,
    tenureShort
  }

  if (!req) {
    return {
      ...base,
      verdict: PROMOTION_VERDICT.NO_CONFIG,
      reason: `晋升条件字典缺少「${level}」的配置，请排查数据。`
    }
  }

  // ── 一票否决：先查廉政风险，风险超标时不看其余四项 ──
  const risk = Number(resources.risk) || 0
  const riskOver = risk - req.riskMax
  if (riskOver > 0) {
    const toInterview = riskOver > RISK_INTERVIEW_MARGIN
    return {
      ...base,
      riskOver,
      verdict: toInterview
        ? PROMOTION_VERDICT.RISK_INTERVIEW
        : PROMOTION_VERDICT.RISK_SUSPENDED,
      reason: toInterview
        ? `廉政风险 ${risk}% 已远超上限 ${req.riskMax}%，先到纪委谈谈话。`
        : `廉政风险 ${risk}% 超出上限 ${req.riskMax}%，此次提任暂缓。`
    }
  }

  // ── 四项资历门槛 ──
  // 名望分只在这一处生效：比较的是"当前值 + 名望分"，不是 resources 本身。
  // 判定和提示都走同一个 effective，界面上就不会出现"数字没够、却显示已达标"。
  const effectiveOf = (key) => (Number(resources[key]) || 0) + authorityBonus

  const missing = PROMOTION_GATES.filter((key) => effectiveOf(key) < req[key])
    .map((key) => ({
      key,
      label: RESOURCE_LABELS[key] || key,
      current: effectiveOf(key),
      raw: Number(resources[key]) || 0,
      required: req[key]
    }))

  if (missing.length > 0) {
    return {
      ...base,
      missing,
      verdict: PROMOTION_VERDICT.PENDING,
      reason: '资历尚浅，组织上再考察考察。'
    }
  }

  // ── 任职年限：四项都够了，但椅子还没坐热 ──
  // 排在四项之后、PROMOTABLE 之前，是为了让提示**只在真达标时**出现。
  // 反过来的话，一个四项还差一半的人会看到"四项条件已达标"，
  // 那句话会当场把玩家对这个界面的信任打掉。
  if (tenureShort > 0) {
    return {
      ...base,
      verdict: PROMOTION_VERDICT.TENURE_PENDING,
      reason: '四项条件已达标，但任职年限尚浅，组织上再考察考察。'
    }
  }

  return {
    ...base,
    verdict: PROMOTION_VERDICT.PROMOTABLE,
    reason: `条件成熟，可提请研究提任「${next}」。`
  }
}
