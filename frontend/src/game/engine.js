/**
 * 回合引擎
 *
 * 玩法循环（一季多事、AP 驱动）：
 *   玩家每季度有 AP_PER_QUARTER 点行动力
 *     → 连续处理事件，每选一个选项扣该选项的 costAp
 *     → AP 耗尽（或无事件可处理）即季度结束
 *   advanceQuarter()：
 *     季度号推进、AP 回满、精力/健康自然恢复、廉政风险自然衰减
 *     跨年时年龄 +1、按年度调整薪资
 *     季末做晋升裁定，达标则提任
 *     判定游戏结束条件
 *
 * 本文件是纯逻辑，不含任何 DOM / 组件代码，便于单测与复用。
 * 所有可调数值集中在下方 TUNING 常量里，策划可直接改。
 */

import {
  RESOURCE_LIMITS,
  RESOURCE_LABELS,
  AP_PER_QUARTER,
  DEFAULT_QUARTERLY_EXPENSE,
  EVENT_COOLDOWN_QUARTERS,
  QUARTERLY_EXPENSE
} from '@/constants/gameConfig'
import {
  AUDIT_FAIL_NOTE,
  AUDIT_HOLD_QUARTERS,
  LEVEL_LADDER,
  MIN_TENURE_YEARS,
  PROMOTION_VERDICT,
  auditPassOddsOf,
  evaluatePromotion,
  nextLevelOf,
  prevLevelOf
} from '@/constants/promotion'
import {
  BALANCE,
  MONTHS_PER_QUARTER,
  formatMoney,
  salaryFloorOf
} from '@/constants/money'
import {
  DECLARE_EVERY_QUARTERS,
  DECLARE_GRACE_QUARTERS,
  DECLARE_TALK_RISK,
  assetCostOf,
  balanceMoneyCostOf,
  BALANCE_RECORD_QUARTERLY_CAP
} from '@/constants/assets'
import { organFor, positionFor } from '@/constants/positions'
import { resolveTransfer } from './transfer'
import {
  DECLARE_TIER,
  buyAsset,
  declarationGapOf,
  declarationTierOf,
  hintForTier,
  legalIncomeOf,
  moneyOf as wealthMoneyOf,
  quarterlyAssetRisk,
  runDeclaration,
  visiblePropertyOf
} from './wealth'
import {
  INVESTIGATION_EVENT_ID,
  confessionText,
  hasGraft,
  isExcuseOption,
  verdictText
} from './investigation'
import { REASSIGN_MGMT_PENALTY, reassign, shouldReassign } from './reassign'
// 只引一个事件 id 常量。crisis.js 那边只引 constants 下的东西，
// 所以 engine → crisis 是单向的，不会绕回来成环。
import { CRISIS_EVENT_ID } from './crisis'
// 铺路成本的算法住在 flee.js 里（事件里显示的与这里真扣的必须是同一个函数，
// 各写一份迟早出现"写了三成、扣了两成"），引擎只负责按它算出来的数记账。
import { fleeCostOf } from './flee'
import { clamp } from '@/utils/storage'

// ── 可调参数（建议值，待策划复核）──
export const TUNING = {
  // 季度休整：精力/健康自然恢复，廉政风险随风波平息自然衰减
  energyRecover: 20,
  healthRecover: 5,
  // 3 → 5（1.4.0）。原值下"只闷头干活、不主动化解"的玩法五季内越线率过高：
  // 实测 20000 局，季末风险越线的比例 63%，而"越线"是一票否决，玩家没有第二次机会。
  // 调这一项是因为它对**不主动管理风险**的玩家收益最直接（越线率 63% → 56%），
  // 而对会用「走动关系」的玩家几乎无影响（两种取值下都是 99.8% 不越线）——
  // 换句话说它只放宽了兜底，没有削弱风险机制本身。
  riskDecay: 5,

  // 跨年调薪：0 就是不调。原先按 3% 复利上浮，三十多年下来工资翻了近三倍，
  // 把薪级表整个架空——玩家算"我该挣多少"时看的是职级，实际到手的却一路自己涨，
  // 死工资攒不下钱这件事就立不住了。现在工资**只跟职级走**：
  // 想涨薪只有一条路，提任。攒钱的速度因此牢牢钉在 QUARTERLY_EXPENSE 那张表上。
  annualSalaryRate: 0,
  salaryRoundTo: 10,

  // 提任加薪
  promotionSalaryRate: 0.15,

  // 到龄退休
  retireAge: 60
}

const QUARTER_RE = /^第(\d+)年\s*Q([1-4])$/

/** 解析季度字符串，形如 '第1年 Q3'。无法解析时返回 null */
export function parseQuarter(text) {
  const m = QUARTER_RE.exec(String(text || '').trim())
  if (!m) return null
  return { year: Number(m[1]), q: Number(m[2]) }
}

/** 组装季度字符串 */
export function formatQuarter(year, q) {
  return `第${year}年 Q${q}`
}

/**
 * 当前绝对季度序号：(年-1)×4 + 季。第 1 年第 1 季 = 1，第 2 年第 1 季 = 5。
 *
 * 凡是"某件事持续到什么时候"的记录一律存**结束序号**，不存"还剩几季"：
 * 剩余值每季都要记得减一，漏减一次就永久生效，而且不报错；
 * 结束序号则是只写不改，用的时候现算，没有"累计值忘了更新"这一类 bug。
 * 目前两个消费方都是这个形状——eventCooldown 与 auditHoldUntil。
 */
export function absQuarterOf(state) {
  const parsed = parseQuarter(state && state.player && state.player.quarter) || { year: 1, q: 1 }
  return (parsed.year - 1) * 4 + parsed.q
}

/** 金额抹零到整十位 */
function roundSalary(amount) {
  const step = TUNING.salaryRoundTo
  return Math.round(amount / step) * step
}

/** 家产。player.money 理论上一定存在，但读档/老数据都可能缺，取不到就当 0 */
export function moneyOf(state) {
  return Number(state && state.player && state.player.money) || 0
}

/**
 * 记账。money 没有上下限（它不是资源条），只挡一个"不能欠债"的下限 0。
 *
 * 返回的明细对象刻意与资源变化同形（key/delta/before/after/actual），
 * 这样界面那套飘字与播报逻辑不用为钱另写一份。
 */
function moneyChange(state, delta) {
  const before = moneyOf(state)
  const after = Math.max(0, before + delta)
  state.player.money = after
  return { key: 'money', delta, before, after, actual: after - before }
}

/**
 * 花出去一笔钱，并把它记进累计支出。
 *
 * ── 为什么"花掉的钱"必须记一笔 ──────────────────────────────
 * 财产申报的差额是 `家产 + 名下资产 + 累计支出 − 合法收入`（见 wealth.js）。
 * 这个式子成立的唯一前提是**每一笔出账都在累计支出里**：
 * 一笔钱花掉了，家产里没有它，可它确实来过、也确实没了；
 * 不记账，它就凭空从分子上消失——而分子正是"你手上有多少"。
 *
 * 换句话说，**不记支出 = 洗钱**。玩家花掉的不再是钱，是差额。
 * 生活支出早就记住了（见 advanceQuarter），crisis 与走动关系却漏在外面：
 * 实测贪腐流带案底的人每局走掉 17 趟、¥400 万上下的差额，
 * 落马率被这一个漏点从 50% 压到 10%——而且**涨价会让它更安全**，
 * 因为涨的是洗钱通道的吞吐量（×2 时 20%，×5 时 11.7%）。
 *
 * ── 为什么 buyAsset 不走这里 ────────────────────────────────
 * 置办资产的钱没有消失，它变成了车和房，而车房本身就在申报的分子里。
 * 再记一笔支出就是把同一笔钱算两遍，差额凭空翻倍。
 * 那条路只能走 wealth.js 的 buyAsset()，这里**刻意不提供**资产入口。
 *
 * @returns {Object} 与 moneyChange 同形的明细，供界面播报
 */
function spendMoney(state, amount, changes) {
  const entry = moneyChange(state, -amount)
  // 记实付而不是名义值：家底见底时 moneyChange 会截在 0，
  // 记名义值会让累计支出的增量大于家产的实际减少，差额对不上。
  const paid = -entry.actual
  if (paid > 0) {
    state.gameStatus.expenseTotal = (Number(state.gameStatus.expenseTotal) || 0) + paid
  }
  if (changes) changes.push(entry)
  return entry
}

/**
 * 掷一次提任廉政审查。只在**真要提任的那一刻**调用。
 *
 * 通过率是 illicitWealth 的纯函数（见 promotion.js 的 auditPassOddsOf），
 * 掷骰子留在引擎这一侧：evaluatePromotion 会被界面反复调用，
 * 随机数进去就会出现"面板说通过、季末说没通过"。
 *
 * 掷骰只在有案底的人身上发生，所以清廉流的随机数序列一个都不动——
 * 这也是这次改动能宣称"清廉流不受影响"的依据，不是估计。
 */
function rollPromotionAudit(state) {
  const odds = auditPassOddsOf(state.player.illicitWealth)
  return Math.random() < odds
}

/** 审查挂起中：本季度不受理提任，也不掷骰（不消耗随机数） */
function auditHeldAt(state, absQuarter) {
  return absQuarter < (Number(state.gameStatus.auditHoldUntil) || 0)
}

/**
 * 检查选项的附加门槛，够则返回 null，不够返回一句给玩家看的话。
 *
 * money 要单独认：它不在 resources 里（见 gameConfig.js），
 * 统一按 `state.resources[key]` 取会永远取到 undefined，判成 0，
 * 于是"钱够"的选项也会被拦下。
 */
export function unmetRequirement(state, option) {
  const need = (option && option.requires) || {}
  const keys = Object.keys(need)
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    const want = Number(need[key]) || 0
    if (want <= 0) continue
    const have = key === 'money' ? moneyOf(state) : Number(state.resources[key]) || 0
    if (have >= want) continue
    const label = key === 'money' ? '家产' : RESOURCE_LABELS[key] || key
    const unit = key === 'money' ? `¥${formatMoney(want)}` : `${want} 点`
    return `${label}不足（需 ${unit}）。`
  }
  return null
}

/**
 * 把一组 { 资源键: 增量 } 应用到 state，返回明细数组。
 *
 * 事件效果与危机公关的"硬扛"掷骰结果都走这里——两处的语义完全一样
 * （收敛到区间、忽略契约外的键），分开写迟早会有一边忘了 clamp。
 */
function applyEffects(state, effects, changes) {
  Object.keys(effects || {}).forEach((key) => {
    if (!(key in state.resources)) return // 契约外的键直接忽略，不污染状态
    const [min, max] = RESOURCE_LIMITS[key]
    const delta = Number(effects[key]) || 0
    const before = state.resources[key]
    const after = clamp(before + delta, min, max)
    if (after === null) return
    state.resources[key] = after
    changes.push({ key, delta, before, after, actual: after - before })
  })
}

/**
 * 结算一个事件选项。
 * 就地修改 state，返回本次结算明细供界面做飘字/提示。
 *
 * @param {Object} state  含 player / resources / gameStatus
 * @param {Object} option GameEvent.options 中的一项
 * @returns {{ok: boolean, message: string, changes?: Array, apLeft?: number}}
 */
export function applyOption(state, option) {
  if (!option) return { ok: false, message: '选项不存在。' }

  const cost = Number(option.costAp) || 0
  if (state.player.ap < cost) {
    return { ok: false, message: `行动力不足，这个选项跑不动（需 ${cost} 点）。` }
  }

  // ── 家底门槛：先验资再扣，钱不够就整条不执行 ──
  // 判断必须放在改动任何状态之前。EventModal 上这个选项已经置灰了，
  // 这里是第二道：置灰归界面，能不能真扣得起归引擎——界面漏了不该让状态烂掉。
  //
  // 置办资产的价钱**也要算进来**，而且必须在这里验。它的钱不由 costMoney 管，
  // 是问资产目录算的，扣在后面的 buyAsset 里。漏了这一道会这样：
  // 钱不够 → buyAsset 拒绝置办 → 但**上面的 effects 已经加过了**
  // （威信 +15、健康 +10 白拿），钱一分没花。所以本金要一次问清。
  const costMoney = Number(option.costMoney) || 0
  const buyCost = option.buyAsset
    ? assetCostOf(option.buyAsset.kind, option.buyAsset.holder)
    : 0
  // 类别写错时目录会返回 0。0 元的资产是最坏的一种"失败"：
  // 钱一分不扣、验资那关也过得去，而 effects 照加不误。
  // 自检已经拦了一道（见 localEvents.js 的 validatePool），这里是第二道。
  if (option.buyAsset && buyCost <= 0) {
    return { ok: false, message: '这件资产不在目录内，本次置办作废。' }
  }

  const totalCost = costMoney + buyCost
  if (totalCost > 0 && moneyOf(state) < totalCost) {
    return {
      ok: false,
      message: `家底不够（需 ¥${formatMoney(totalCost)}，现有 ¥${formatMoney(moneyOf(state))}）。`
    }
  }

  // ── 其余门槛（requires）。只判够不够，不负责扣 ──
  // 「花 10 点向上管理」的扣减写在 effects 里，这里只管"不足 10 点就别让他点"。
  // 两件事分开，是因为扣减要跟着资源区间收敛，而门槛只做一次比较。
  const short = unmetRequirement(state, option)
  if (short) return { ok: false, message: short }

  state.player.ap -= cost

  const changes = []
  applyEffects(state, option.effects, changes)

  // 走 spendMoney 而不是 moneyChange：选项花的钱与危机公关的平事钱
  // 都必须记进累计支出，否则差额的分子上会凭空少一块（见 spendMoney）。
  if (costMoney > 0) spendMoney(state, costMoney, changes)
  const gainMoney = Number(option.gainMoney) || 0
  if (gainMoney > 0) changes.push(moneyChange(state, gainMoney))

  // ── 非法所得：先进家产，同时记进纪委那本账 ──
  // 两个字段一起写，是为了让"收下了"这件事只有一个入口。
  // 若让事件作者分别写 gainMoney 和 gainIllicit，迟早有人只写前一个——
  // 表现是钱到账了、纪委却永远查不到，贪腐流变成无风险套利。
  const gainIllicit = Number(option.gainIllicit) || 0
  if (gainIllicit > 0) {
    changes.push(moneyChange(state, gainIllicit))
    state.player.illicitWealth = (Number(state.player.illicitWealth) || 0) + gainIllicit
    // 案底：收过就永久置位。放在这里而不是别处，是因为"收下一笔钱"
    // 只有本函数一个入口——让各条支线自己记得置位，迟早漏掉一条，
    // 而漏掉的表现是"某几笔钱不收白不收"，不是报错。
    // 与上面那行相邻是有意的：两件事同生同死，分开写迟早只改一处。
    state.player.hasIllicitRecord = true
    // 这里曾挂过"要不要退一半"的待办（refundPending，见已删除的 game/refund.js）。
    // 整条支线连事件一起砍了：它的核心是"退一半"，而"退一半"与退赃、走动关系
    // 三者在玩家的直觉里是同一件事——留着的那一半到底算不算赃款，
    // 玩家说不清，规则也就说不清。现在收钱之后只剩两个出口：
    // 留着（差额照挂），或者在立案决定书上一次性认罪退赃（一辈子一次）。
    changes.push({
      key: 'illicitWealth',
      delta: gainIllicit,
      before: state.player.illicitWealth - gainIllicit,
      after: state.player.illicitWealth,
      actual: gainIllicit
    })
  }

  // ── 赌一把的选项（危机公关的"硬扛"）──
  // 效果是随机的，塞不进静态的 effects，所以单列一个 gamble 字段在结算时掷骰。
  const extraNotes = []
  // 调动改的是 player 上的三样东西，不是资源，塞不进 changes。
  // 单独带出去，让界面可以拿它播报"从哪到哪"，而不是只说一句"成功"。
  let changedProfile = null

  // ── 单笔过大，当场惊动组织部（见 game/reassign.js）──
  // 必须等 extraNotes / changedProfile 声明之后才能落：它们在上面那个
  // gainIllicit 块里还不存在，写在那儿会直接 ReferenceError。
  // 位置也正好合适——**排在退赃待办之后**：玩家先被问到"退不退"，
  // 再收到调令。退赃能救回钱，救不回岗位，这个先后本身就是那句话的意思。
  if (shouldReassign(gainIllicit)) {
    const out = reassign(state)
    applyEffects(state, { mgmt: -REASSIGN_MGMT_PENALTY }, changes)
    extraNotes.push(out.message)
    changedProfile = out.profile
    // 通报分两处：上面那句是**即时**播报，这一条留给季末的「近期通报」面板
    // （它取的是 advanceQuarter 的 notes）。两个都要有——
    // 只看即时消息的人事后翻不到，只看面板的人当场不知道发生了什么。
    state.gameStatus.pendingNotice = out.notice
  }
  // ── 跑路的铺路成本（见 game/flee.js）──
  // 先付钱，再掷骰。这笔钱是**安排路子**的钱，成不成都不退，
  // 所以它不属于掷骰的结果，必须排在 gamble 里那一掷之前。
  //
  // 两笔账一起记——家产与赃款账：钱花掉的同时，那笔赃款也确实不在你手上了。
  // 与上面 gainIllicit 那段是同一条规矩（同生同死，分两处写迟早只改一处）。
  // 家产那笔走 spendMoney，不记累计支出的出账就是洗钱（见那个函数的说明）；
  // 赃款账按**实付**冲减，不按名义的三成——两笔账对不上就等于凭空多出一个数。
  if (option.fleeBurn) {
    const cost = fleeCostOf(state.player.illicitWealth, moneyOf(state))
    const paid = -spendMoney(state, cost.paid, changes).actual
    if (paid > 0) {
      const before = Number(state.player.illicitWealth) || 0
      state.player.illicitWealth = Math.max(0, before - paid)
      changes.push({
        key: 'illicitWealth',
        delta: -paid,
        before,
        after: state.player.illicitWealth,
        actual: -paid
      })
      extraNotes.push(`中间人先收了 ¥${formatMoney(paid)}，护照与口岸那边的路子才算落地。`)
    }
  }

  if (option.gamble) {
    const odds = Number(option.gamble.odds)
    const hit = Math.random() < (Number.isFinite(odds) ? odds : 0.5)
    if (hit) applyEffects(state, option.gamble.hit, changes)
    // 失败也可能有代价。危机公关的"硬扛"没有这一项（失败就是原地不动），
    // 立案审查的狡辩用得上——但真正致命的不是这几点资源，是下面那一行。
    else if (option.gamble.miss) applyEffects(state, option.gamble.miss, changes)

    // 掷骰的**终局**。只置位不在这里收摊：结局统一由 checkGameOver 裁定，
    // 而 GameMain 在 applyOption 返回后会立刻调 settleGameOver，
    // 所以置位就够了，不需要在这里另开一条结束流程。
    //
    // 成功也可能终结本局（卷款跑路走得掉就是终局），所以 hit 一侧也要认。
    // 早先只有 missEnding，是默认了"掷骰成功 = 继续玩"——
    // 那条假设在危机公关和立案狡辩上都成立，到了跑路才第一次不成立。
    if (!hit && option.gamble.missEnding) {
      state.gameStatus.forcedEnding = option.gamble.missEnding
      // 记下玩家**刚才说的是哪一句**。判词要用它开头，否则无论选哪条，
      // 结局海报上都是同一段话——三个选项当场就露馅了（见 verdictText）。
      if (isExcuseOption(option.id)) state.gameStatus.verdictExcuse = option.id
    } else if (hit && option.gamble.hitEnding) {
      state.gameStatus.forcedEnding = option.gamble.hitEnding
    }

    // 兜底文案要认得 missEnding：带终局的掷骰失败是"落马"，
    // 跟危机公关那种"没查出实据"完全是两回事，共用一句"侥幸没被揪住"
    // 会把玩家落马前看到的最后一句话写成报平安。
    extraNotes.push(hit
      ? option.gamble.hitText || '这一步走通了。'
      : option.gamble.missText
        || (option.gamble.missEnding ? '这一步没能走通。' : '这次侥幸没被揪住。'))
  }

  // ── 置办资产 ──
  // 价格不写在事件里，由 constants/assets.js 的目录算（见那个文件的说明）。
  // 扣钱在 buyAsset 内部做，所以这里必须先验资再调，避免"验过了又被别的路径花掉"。
  if (option.buyAsset) {
    const out = buyAsset(state, option.buyAsset)
    if (out.ok) {
      changes.push({
        key: 'money',
        delta: -out.cost,
        before: wealthMoneyOf(state) + out.cost,
        after: wealthMoneyOf(state),
        actual: -out.cost
      })
      extraNotes.push(`${out.message}名下添了一份要按季度还的账。`)
    } else {
      extraNotes.push(out.message)
    }
  }

  // ── 认罪退赃：降一级使用，保留公职 ──
  if (option.surrender) {
    const out = surrender(state)
    extraNotes.push(out.message)
    changedProfile = out.profile || changedProfile
  }

  // ── 遴选 / 借调：换单位流派 ──
  // 成败由能力与向上管理算出来的概率决定（见 game/transfer.js），
  // 成功则改 unitType / unit / position 三样，失败不额外惩罚。
  if (option.transfer) {
    const out = resolveTransfer(state, option.transfer)
    extraNotes.push(out.note)
    if (out.ok) changedProfile = { from: out.from, to: out.to }
  }

  // 提任否决：只置位，不在这里生效——季末裁定在 advanceQuarter 里做
  if (option.veto) state.gameStatus.promotionVeto = true

  // 风声里那句"你自己看着办"，他选择了没听见。同样只置位：
  // 立案是下个季度的事（见 advanceQuarter 的 7.5 步），当场发作会让
  // "下个季度"这四个字落空——与函询那条线（inquiryDefiance）是同一个道理。
  if (option.fleeRefusal) state.gameStatus.fleeRefused = true

  // ── 事件冷却：这条事件多少季度之后才能再出现 ──
  // 记在**引擎**里，不记在界面上。理由不是"分层更干净"，是**测得到**：
  // 界面层的记账（这段原先写在 GameMain 的 onChoose 里，记的是 usedEventIds）
  // 模拟器走不到，于是跑出来的平衡数据和真实游戏不是同一局——实测两个口径下
  // 贪腐流的落马率是 74% 和 0%，差了整整一个数量级，而两边都没有报错。
  // 引擎记则模拟器必然跟着走，这类偏差从结构上不可能再发生。
  //
  // 位置上必须在这里：下面几行就会把 currentEvent 置空，
  // 放到那之后再读，就再也问不出"刚刚结算的是哪一条"了。
  const doneEvt = state.gameStatus.currentEvent

  // ── 危机公关：记下这次走的是哪条路 ──
  // 平事的代价随次数递增（见 crisis.js 的三个刻度函数），所以得有个地方
  // 把"用过几次"存下来。存**引擎**而不是 GameMain，跟上面事件冷却是同一个理由：
  // 界面层的记账模拟器走不到，跑出来的平衡数据就和真实对局不是同一局。
  //
  // 认的是事件 id + 选项 id，不看选项对象上新加的字段。理由跟 investigation.js
  // 那份说明一样：选项对象要被存进存档、还要过 EventModal 的白名单，
  // 新加一个 "isCrisisOptA: true" 这类标记，一旦漏进白名单就是**静默失效**
  // ——白名单缺字段不报错，只是那条选项什么也不做。
  // 事件 id 是常量，比对它不引入任何新的契约。
  if (doneEvt && doneEvt.id === CRISIS_EVENT_ID) {
    const optId = (option || {}).id
    if (optId === 'opt_a') {
      state.gameStatus.crisisHandledCount = (Number(state.gameStatus.crisisHandledCount) || 0) + 1
    } else if (optId === 'opt_b') {
      state.gameStatus.crisisFavorCount = (Number(state.gameStatus.crisisFavorCount) || 0) + 1
    }
  }

  // ── 一次性事件：处理过就永远不再抽到 ──
  // 标记写在**事件**上（onceFlag: '字段名'），置位动作同样在这里统一做。
  // 它是冷却的补集，不是同一个东西：冷却管"这一局别老是同一件事"，
  // onceFlag 管"这件事在剧情上就只发生一次"——一份已经交上去的函询说明
  // 不会因为过了一年就重新寄来一份。
  //
  // 写在冷却**前面**，且写冷却时要把它排除掉：一次性事件已经永久退池，
  // 再给它记一条冷却纯属多余，而且是有害的多余——那张表会作为"避重清单"
  // 上报给后端（见 api/event.js 的 eventCooldown），里面躺着一条再也抽不到的
  // 事件 id，读到的人只会以为它还会回来。
  const retired = Boolean(doneEvt && doneEvt.onceFlag)
  if (retired) state.gameStatus[doneEvt.onceFlag] = true

  if (doneEvt && doneEvt.id && !retired) {
    if (!state.gameStatus.eventCooldown) state.gameStatus.eventCooldown = {}
    state.gameStatus.eventCooldown[doneEvt.id] =
      absQuarterOf(state) + EVENT_COOLDOWN_QUARTERS
  }

  // 函询上的对抗/沉默：下一季度直接进入立案审查。
  // 只置位，具体的立案动作在 advanceQuarter 的第 8.5 步做——
  // 当场立案会让"下一季度"这四个字落空，决定书会紧跟着选项弹出来。
  if (option.inquiryDefiance) state.gameStatus.inquiryEscalated = true

  // 立案审查处理完了，撤掉待办标记。
  // 不能不清：needsInvestigation 只看这个标记，不清就会在每次「推进工作」时
  // 反复弹同一份决定书，玩家永远走不出去。下一次申报（5 个季度后）
  // 会按那时的差额重新决定要不要再挂。
  const resolvedId = state.gameStatus.currentEvent && state.gameStatus.currentEvent.id
  if (resolvedId === INVESTIGATION_EVENT_ID) {
    state.gameStatus.investigationPending = false
    // usedRetreat **不在这里清**。待办是一次性的，退赃机会是一辈子的：
    // 这一案的卷宗合上了，不等于组织上忘了你退过一次赃。
    // 谁把它连同待办一起清掉，谁就等于把"限一次"改回了"无限次"。
  }
  // 事件结算，收摊
  state.gameStatus.currentEvent = null
  state.gameStatus.showEventModal = false

  return {
    ok: true,
    changes,
    changedProfile,
    apLeft: state.player.ap,
    message: extraNotes.length ? extraNotes.join('') : '处理完毕。'
  }
}

/**
 * 执行提任。职级上调、职务换成该职级常见职务、**调动单位**、薪资上浮。
 *
 * unitChanged 只在**单位真的换了**那一级为 true（见 positions.js 的 ORGANS）：
 * 科级、处级那几档职务模板自带单位名，人还在原来的衙门里，
 * 通报里就不该多出一句"调XX"——那是凭空多出来的动静。
 *
 * @returns {{from:string,to:string,position:string,unit:string,
 *            unitChanged:boolean,salary:number}|null}
 */
export function promote(state) {
  const to = nextLevelOf(state.player.level)
  if (!to) return null

  const from = state.player.level

  state.player.level = to
  // 职务由 **单位 + 职级** 共同决定，不再查职级表。
  // 老表里"乡科级正职 → 镇长"是全局唯一解，于是市档案局的人也会当上镇长。
  // 详见 constants/positions.js。
  const position = positionFor(state.player.unit, state.player.unitType, to)
  if (position) state.player.position = position
  // 单位跟着职级一起走。**顺序不能反**：positionFor 在科级/处级那几档
  // 是用当前单位名拼职务的（`${u}预算科科长`），先改单位就会拼出
  // "省财政厅预算科科长"这种一步登天的东西。
  // 到了上面几级模板不再嵌单位，这一步补的就是"省长还在档案局上班"
  // ——职务换了、单位没换的那半边（见 constants/positions.js 的 ORGANS）。
  const organ = organFor(state.player.unitType, to)
  if (organ) state.player.unit = organ
  state.player.salary = roundSalary(state.player.salary * (1 + TUNING.promotionSalaryRate))

  // 提任当季就把**新职级**的薪级地板压上。
  //
  // 不压的话会穿帮：4.5 节的地板跑在晋升裁定之前，压的是**旧职级**那一档
  // （4500 × 1.15 = 5180），而下一季的地板才把它抬到新职级的 5500。
  // 于是提任播报写着"月薪调整为 5180 元"，玩家下一季实际到手却是 5500——
  // 播报和工资对不上，看上去就像薪级表没生效。
  const salaryFloor = salaryFloorOf(to)
  if (salaryFloor > state.player.salary) state.player.salary = salaryFloor

  return {
    from,
    to,
    position: state.player.position,
    unit: state.player.unit,
    unitChanged: Boolean(organ),
    salary: state.player.salary
  }
}

/**
 * 认罪退赃：降一级使用，全额退赃，保留公职。
 *
 * 退赃的范围是**非法所得及其置办的资产**，不是玩家的全部家当：
 * 工资攒下的那部分不该跟着一起没。先拿现金抵，资产则整体上交——
 * 车房本来就是用那笔钱买的，留在名下既不合逻辑，也会让下一次财产申报
 * 又把差额顶过红线，变成一场永远走不出去的循环。
 *
 * 降到底（乡科级副职）就不再降，只退赃。组织上也不能把人降到没有。
 *
 * @returns {{message: string, profile: Object|null}}
 */
export function surrender(state) {
  const ill = Number(state.player.illicitWealth) || 0

  // 退赃：现金先扣，扣不动的部分由资产顶上（整体上交）
  const cashBefore = moneyOf(state)
  const cashPaid = Math.min(cashBefore, ill)
  state.player.money = cashBefore - cashPaid
  const assetsSeized = state.player.assets ? state.player.assets.length : 0
  // 清空 assets 就是**全部**的清账动作，没有第二处要清的计数器：
  // 季度资产风险的唯一来源是 quarterlyAssetRisk(state)，而它只遍历
  // player.assets（见 wealth.js）。这里清干净，季末那条"名下 N 处资产…
  // 廉政风险 +X"的通报自然就不出现了——不是靠额外的开关压住它，
  // 是它压根没有别的数据可读。**别再往这里加一个 assetRiskPenalty 之类的
  // 影子计数**：多一个能跟 assets 说不一样话的字段，就多一处会忘记同步的地方。
  state.player.assets = []
  state.player.illicitWealth = 0

  // 风险一并清零。现实里说不通（组织上刚查过你，怎么可能转头就不盯着了），
  // 但这里是**数值上的必要**：风险是玩家进决定书的唯一入口，
  // 不清的话退完赃出来风险照旧压在头上，下一季又立案，
  // 而那时已经没有退赃机会了——"限一次"会退化成"退完就死"，
  // 玩家等于用一级职级买了一个季度的命。
  // 清零之后他有一段干净的窗口可以重新做人，也可以重新伸手。
  state.resources.risk = 0

  // 记下这次机会已经用掉。**这是"限一次"的全部实现**——
  // 决定书下次拼选项时只读这个标记（见 game/investigation.js）。
  state.gameStatus.usedRetreat = true

  // 收入起算点推到当前：退赃之前挣的那些工资不再替他打掩护。
  // 家产和资产刚被抄干净，从这一刻起，"现有财产 − 此后新挣的工资"
  // 剩下的就是他又伸手拿的钱——差额会随着他重新贪而重新长起来，
  // 第二次立案才来得了。不推这个点的话，一辈子的工资总额还挂在那里，
  // 等于把"退赃限一次"重新变回"退完就安全"。
  state.gameStatus.retreatLegalBaseline = legalIncomeOf(state)
  // 支出计数器一并归零：它和家产是同一个恒等式的两端，
  // 只清家产不清它，等式右边会凭空多出一辈子的家用，
  // 退完赃下一期就报出一个天文数字的差额——比不重置更糟。
  state.gameStatus.expenseTotal = 0

  // 降一级
  const to = prevLevelOf(state.player.level)
  let profile = null
  if (to) {
    const from = state.player.level
    state.player.level = to
    const position = positionFor(state.player.unit, state.player.unitType, to)
    if (position) state.player.position = position
    // 降级同样要跟着走：一个从市长位置上退下来的基层干部，
    // 去处是县政府，不是"市人民政府的县长"。顺序同 promote，先算职务再换单位。
    // （核心部门那类降到处级时 organFor 返回 ''，单位原样保留。）
    const organ = organFor(state.player.unitType, to)
    if (organ) state.player.unit = organ
    const floor = salaryFloorOf(to)
    if (state.player.salary > floor) {
      state.player.salary = roundSalary(Math.max(floor, state.player.salary * 0.85))
    }
    profile = {
      from: { unit: state.player.unit, unitType: state.player.unitType },
      to: { unit: state.player.unit, unitType: state.player.unitType, position: state.player.position },
      demoted: true,
      fromLevel: from,
      toLevel: to
    }
  }

  const parts = []
  if (cashPaid > 0) parts.push(`退缴 ¥${formatMoney(cashPaid)}`)
  if (assetsSeized > 0) parts.push(`上交 ${assetsSeized} 处资产`)
  return {
    message: `你写了说明材料，全额退赃${parts.length ? `（${parts.join('、')}）` : ''}。`
      + (to
        ? `组织上念在态度诚恳，降一级使用，改任「${state.player.position}」，保留公职。`
        : '组织上念在态度诚恳，从轻处理，保留公职。')
      + '这一关算是过去了，但档案里那一页翻不回来。',
    profile
  }
}

/**
 * 结局代号表。
 *
 * **代号比"结局种数"多**：给玩家看的是七种分类、四套皮肤（见 RulesModal），
 * 这里是一种处置一个代号——光是"退休"那一家就有光荣退休、涉险过关、
 * 平安落地三个，用一套皮肤说话、拿代号区分。
 * tone 供界面选用 Element 的语义色：success 正面、info 中性、error 负面。
 *
 * reason 可以是字符串，也可以是 (state) => string：落马判词必须带上
 * 玩家的名字和非法所得数额，写死一段话就只能是某个特定玩家的故事。
 */
export const ENDINGS = {
  peak: {
    label: '光荣退休',
    tone: 'success',
    reason: '主政一方，政声卓著。到龄光荣退休，名字写进了县志。'
  },
  // 登顶那条线上的**中间态**：伸手拿过钱，但差额一直没到立案线，
  // 于是到头来既没被查，也没真干净。见 checkGameOver 里到顶那一段的三分流。
  //
  // tone 取 info 而不是 success 或 error：组织上没有否定他（不是 error），
  // 可这也不是一份干净的结论（不是 success）。他拿到的是干净人拿到的那份履历，
  // 差别只在夜里。
  narrow: {
    label: '涉险过关',
    tone: 'info',
    reason: '主政一方，政声卓著。你当上了省长，名字写进了县志。'
      + '只是从那以后，每到深夜，你总会听见敲门声。你不敢开门。'
  },
  landed: {
    label: '平安落地',
    tone: 'info',
    reason: '仕途止步于此，但全身而退。到龄退休，含饴弄孙，也算善终。'
  },
  purged: {
    label: '纪委监委留置',
    tone: 'error',
    // 中段插一句忏悔语录。**这条路没有 verdictExcuse**——
    // 玩家是被风险顶出去的，没有经过"写说明材料"那一屏，也就没有亲口说过什么，
    // 所以他配到的是五类里**随机**的一条（见 investigation.js 的 pickConfession
    // 第 3 条规则）。这一条正好补上了那份决定书里问不出来的话：
    // 他辩解过什么、组织上又是怎么驳回去的。
    reason: (state) =>
      '廉政风险触顶，被纪检监察机关立案审查。'
      + confessionText(state)
      + '政治生命就此终结。'
  },
  // 风险触顶，但一分钱没贪。与 purged 分开**不是**措辞上的讲究：
  // 留置是刑事结论，免职是组织处理，两者之间隔着"有没有伸手"这条线。
  // 判词里不能出现任何账目——他本来就没有账。
  dismissed: {
    label: '免职闲赋',
    tone: 'info',
    reason: (state) => {
      const name = (state && state.player && state.player.name) || '该同志'
      return `经查，未发现${name}同志存在违纪违法问题。`
        + '但因其长期工作方式不当、群众反映强烈，'
        + '组织决定免去其现任职务，另行安排工作。'
    }
  },
  collapse: {
    label: '倒在工作岗位上',
    tone: 'error',
    // 年龄必须现取。这里原先写死的是"年仅若干"，一句没填完的占位——
    // 而"若干"正好落在讣告最该有分量的那个位置：四十三岁和五十九岁
    // 是两种完全不同的惋惜，写死了就等于对所有玩家说同一句空话。
    reason: (state) => {
      const age = Number(state && state.player && state.player.age) || 0
      return '常年连轴转，身体终于撑不住了。'
        + `倒在工作岗位上，年仅 ${age} 岁。`
    }
  },
  // 立案审查的终局。与 purged（风险触顶的留置）分开记，
  // 是因为两者的成因完全不同：一个是"有人反映你"，一个是"你的钱解释不通"。
  // 结局海报上的那段话由 investigation.verdictText 按玩家自己的数字生成。
  corrupted: {
    label: '立案审查调查',
    tone: 'error',
    reason: (state) => verdictText(state)
  },
  // ── 风声那通电话的两个终局（见 game/flee.js）──
  // 这两个和上面三个的区别是：它们不是"状态到了阈值"，是玩家**自己选的**——
  // 电话打来之前他只是收钱，接完电话之后走不走，是他这辈子最后一次拿主意。
  // 所以判词里要出现玩家的名字和那笔钱，否则这一选跟别的结局没有分别。
  rednotice: {
    label: '红色通缉令',
    tone: 'error',
    reason: (state) => {
      const name = (state.player && state.player.name) || '某'
      const amount = Number(state.player && state.player.illicitWealth) || 0
      return `你带着 ¥${formatMoney(amount)} 元，从南边的口岸走了出去。`
        + `三个月后，国际刑警组织对${name}发布红色通报。`
        + '此后的每一个春节，你都在看新闻里那张自己的照片。'
    }
  },
  caught: {
    label: '机场被拦',
    tone: 'error',
    reason: (state) => {
      const name = (state.player && state.player.name) || '某'
      const amount = Number(state.player && state.player.illicitWealth) || 0
      return `${name}同志，边检在登机口把你请了下来。`
        + `行李箱里那 ¥${formatMoney(amount)} 元还没来得及换成任何别的东西。`
    }
  }
}

/**
 * 游戏结束判定。
 *
 * 判定优先级：留置 / 病倒 是硬性失败，先判；
 * 其次是登顶（顶点即通关），最后才是到龄退休。
 * 省部级正职且到龄时算"光荣退休"，不算"平安落地"。
 *
 * @returns {{ending: string, label: string, tone: string, reason: string}|null} 未结束返回 null
 */
export function checkGameOver(state) {
  const { resources, player } = state

  // 已被判定落马的，压过一切。
  // 排在第一位是因为它不是"状态到了某个阈值"，而是**已经发生的事**：
  // 狡辩失败、判决书当庭宣读，这之后玩家手里有多少风险值、多少健康都不再相干。
  const forced = state.gameStatus && state.gameStatus.forcedEnding
  if (forced && ENDINGS[forced]) return buildEnding(forced, state)

  // ── 决定书批下来了，账上却没有一笔是他收的 ──
  //      与下面"风险触顶"那条成对：那条管风险条顶到 100，这条管立案程序，
  //      两件事的终点都是免职闲赋（同一个道理，见 ENDINGS.dismissed 的说明）。
  //      第 8 / 8.5 步现在都在**置位那一刻**就了结了（见那两处的说明），
  //      这里兜的是旧存档：标记还在、人还没结束，别让他带着一份
  //      送不出来的决定书照常上班。
  if (state.gameStatus && state.gameStatus.investigationPending && !hasGraft(state)) {
    return buildEnding('dismissed', state)
  }

  // ── 风险触顶：判「留置」还是「免职」，看这人兜里有没有赃款 ──
  // 留置是**犯罪**的结论，判词里那句忏悔（"你说那都是土特产，几箱脐橙…"）
  // 说的是他收过钱。一个一分钱没贪、只是工作方式把自己作到风险 100 的人，
  // 配到那句话就是把两件不相干的事焊在一起——而且这不是理论上的边角：
  // 实测一个"只要风险、不要钱"的机器人 10 局 10 次顶到 100，
  // 十次全被判了留置，判词里的金额是 ¥0。
  //
  // 风险触顶这条线本身不动（它是"组织上盯上你了"的累积），
  // 动的是**顶到之后算什么**：收过钱的才是留置，没伸手的按免职处理。
  // 现实里这也是两回事：前者进留置室，后者只是不再让他主政一方。
  // 判据一律问 hasGraft，不在这里再写一遍 Number(player.illicitWealth)：
  // 同一个问题两处各问各的，迟早有一处忘了跟着改
  if (resources.risk >= RESOURCE_LIMITS.risk[1]) {
    return buildEnding(hasGraft(state) ? 'purged' : 'dismissed', state)
  }
  if (resources.health <= RESOURCE_LIMITS.health[0]) return buildEnding('collapse', state)
  // ── 到顶即退休：**登顶不等于善终** ──────────────────────────
  // 原先这一行只看职级，于是"带着 679 万赃款升到省部级正职"会当场判成
  // 光荣退休，判词写着"主政一方，政声卓著"——一句话里出现了两个假：
  // 他没退，也没卓著。而且它与整局都在算的那笔账自相矛盾：
  // 玩家可能上一季刚在财产申报里被约谈过，转头就风光退休。
  //
  // 判据用 hasGraft（账上**还有**赃款），不是 hasIllicitRecord（收过钱）：
  // 退过赃的人账是干净的、事也了结过，"退赃之后还能重新做人"正是
  // 光荣退休那条路存在的意义——他该走那一条（见 investigation.js 的说明）。
  //
  // 走 corrupted 而**不**改判 investigationPending 去补一屏狡辩：
  // 狡辩是给申报差额那条路用的，成功一次就是"经查未发现问题"的免职闲赋
  // （见 ENDINGS.dismissed），对着一笔 679 万的账说"未发现问题"，
  // 比原来那句"政声卓著"还荒唐。到顶这一下的账已经不需要再问什么了。
  // **三分流，不是两分流。**只有"立案"和"干净"两种的话，
  // 贪腐流就只剩落马一条路——玩家很快会算明白"伸手必被抓"，
  // 于是没人伸手，博弈感消失。现实中真正多的是第三种人：
  // 伸过手，差额一直没够到立案线，最后照样到点下车。
  // 他拿到的是干净人拿到的那份履历，差别只在夜里。
  //
  // 判据是**差额**，不是赃款本身：差额才是组织上真能看见的那个数
  // （见 wealth.js 的 declarationGapOf），与每次财产申报问的是同一个问题。
  // 一律用可见财产算，不含没被翻出来的代持，也**不掷骰子**——
  // 这个函数在同一局里会被调用多次，掷骰子会让同一个人一会儿过关一会儿不过关。
  if (player.level === LEVEL_LADDER[LEVEL_LADDER.length - 1].level) {
    const { gap } = declarationGapOf(state, visiblePropertyOf(state))
    const tier = declarationTierOf(gap, player.level)
    if (tier === DECLARE_TIER.CASE || tier === DECLARE_TIER.SEVERE) {
      return buildEnding('corrupted', state)
    }
    if (hasGraft(state)) return buildEnding('narrow', state)
    return buildEnding('peak', state)
  }
  if (player.age >= TUNING.retireAge) return buildEnding('landed', state)

  return null
}

/** reason 允许写成函数：判词里要嵌玩家的名字与金额，静态字符串做不到 */
function buildEnding(code, state) {
  const spec = ENDINGS[code]
  const reason = typeof spec.reason === 'function' ? spec.reason(state) : spec.reason
  return { ending: code, label: spec.label, tone: spec.tone, reason }
}

/**
 * 把结局写进状态，并收起弹窗。
 *
 * `notes` 是**这一季已经攒下的通报**，默认空。季末裁定里收尾的那两种情况
 * （待办事件不弹时的 0 点、以及后面几处）必须把它交进来：
 * 交空数组的话，界面那边 `notes.length` 为 0，会兜底成
 * "本季度平稳度过，无事发生。"——宣判免职的那一屏底下挂着这么一句，
 * 比不写还难看。事件结算那条路上没有季报，保持默认即可。
 */
function finishGame(state, ending, notes = []) {
  state.gameStatus.gameOver = true
  state.gameStatus.gameOverEnding = ending.ending
  state.gameStatus.gameOverReason = ending.reason
  state.gameStatus.currentEvent = null
  state.gameStatus.showEventModal = false
  return {
    quarter: state.player.quarter,
    notes,
    promotion: null,
    verdict: null,
    gameOver: ending
  }
}

/**
 * 事件结算后的即时判定。
 * 事件里把风险顶到 100、或把健康打到 0，必须当场结束，
 * 不能等到点"进入下一季度"——那时休整回血会把人从留置线上捞回来。
 *
 * @returns {Object|null} 结局对象，未结束返回 null
 */
export function settleGameOver(state) {
  const ending = checkGameOver(state)
  if (!ending) return null
  finishGame(state, ending)
  return ending
}

/**
 * 两个立案档在季末通报里的说法。分档措辞，因为对玩家的含义不同。
 *
 * 措辞按**这是第几次立案**分，不再按档位分——认罪退赃改成了"一辈子一次"
 * （见 gameConfig 的 usedRetreat），所以决定"还有没有退路"的是次数，
 * 不是差额大小。头一次进来，通报留一句余地；第二次进来，
 * 通报就得当面把话说明白：这次没有退赃这一说了。
 * 先给希望再收走，比一上来就写死更让人记得住是哪一步走错的。
 */
const DECLARE_CASE_LINE = {
  [DECLARE_TIER.CASE]: '已达立案标准',
  [DECLARE_TIER.SEVERE]: '远超立案标准'
}

/**
 * 季度推进。AP 回满、休整结算、跨年结算、季末晋升裁定、结束判定。
 *
 * @returns {{
 *   quarter: string,
 *   notes: string[],
 *   promotion: Object|null,
 *   verdict: Object,
 *   gameOver: string
 * }}
 */
export function advanceQuarter(state) {
  const notes = []
  // 本季财产申报的提示（没到最低那档就是 null）。单独带出去是为了让界面能按等级上色
  let declaration = null

  // ── 0. 先判结局 ──
  // 必须排在休整回血之前：玩家把风险顶到 100 或健康打到 0 之后点"进入下一季度"，
  // 若先回血就会被救回来，留置/病倒两个结局永远触发不了。
  const preEnding = checkGameOver(state)
  if (preEnding) return finishGame(state, preEnding)

  const parsed = parseQuarter(state.player.quarter) || { year: 1, q: 1 }

  // ── 1. 季度号推进 ──
  const crossedYear = parsed.q + 1 > 4
  const year = crossedYear ? parsed.year + 1 : parsed.year
  const q = crossedYear ? 1 : parsed.q + 1
  state.player.quarter = formatQuarter(year, q)

  // 本季的绝对序号：(年-1)×4 + 季，第1年第1季 = 1。
  // 提前到这里算，是因为下面第 5 步判任职年限要用；
  // 第 8 步的财产申报周期也用它，两处必须是**同一个数**——
  // 各算各的迟早会出现"提任按推进后的季度、申报按推进前的季度"这种错位。
  const absQuarter = (year - 1) * 4 + q

  // ── 2. 行动力回满 ──
  state.player.ap = AP_PER_QUARTER

  // ── 3. 季度休整：只恢复精力与健康。
  //      廉政风险不在此衰减，见第 6 步。
  const rest = (key, amount) => {
    const [min, max] = RESOURCE_LIMITS[key]
    state.resources[key] = clamp(state.resources[key] + amount, min, max)
  }
  rest('energy', TUNING.energyRecover)
  rest('health', TUNING.healthRecover)

  // ── 4. 跨年结算 ──
  if (crossedYear) {
    state.player.age += 1
    const before = state.player.salary
    state.player.salary = roundSalary(before * (1 + TUNING.annualSalaryRate))
    // annualSalaryRate 为 0 时工资不变，这句"由 4500 元调整为 4500 元"就是句废话。
    // 涨薪那半句只在真涨了的时候说。
    notes.push(
      `新的一年来到，年满 ${state.player.age} 岁。`
      + (state.player.salary !== before
        ? `月薪由 ${before} 元调整为 ${state.player.salary} 元。`
        : '')
    )
  }

  // ── 4.5 发薪与开销 ──
  // 发的是**一个季度**的工资（三个月），不是一个月。
  // 月薪先按薪级表"托底"再发：提任加薪与年度调薪都只会往上加，
  // 所以取 max 而不是直接覆盖——覆盖会让提任那点涨幅被抹平。
  const salaryFloor = salaryFloorOf(state.player.level)
  if (salaryFloor > state.player.salary) state.player.salary = salaryFloor
  const payroll = state.player.salary * MONTHS_PER_QUARTER
  const paid = moneyChange(state, payroll)
  // 工资是**合法收入**，要单独累计：财产申报算的是"你说不清来路的钱"，
  // 分母就是这一项。不累计的话，一个勤恳干到厅级的老干部会因为工资攒得多
  // 而被请去喝茶——那不是反腐，那是算错了账。
  state.player.legalIncome = (Number(state.player.legalIncome) || 0) + paid.actual

  // 财产申报的差额不需要在这里维护任何东西：它减的是累计合法收入，
  // 只在**退赃**那一刻被推高一次（见 surrender）。这里发薪、那里查账，
  // 两件事完全解耦——中间不需要每季推窗口之类的同步动作，
  // 也就没有"哪一处忘了喂一口"的空间。

  // 支出**不走 legalIncome**：它是花出去的钱，不是挣来的钱。
  // 混进去会让"合法收入"变成一笔糊涂账，财产申报的差额跟着失真。
  // 它只减 money——而 money 正是申报公式里"你手上有多少"的那一项，
  // 所以支出压低的是**差额**，也就等于压低被查的概率。
  // 反过来说：一个只靠工资过日子的玩家，差额常年是负的，纪委永远找不到他。
  //
  // 记账统一交给 spendMoney（累计支出存在 gameStatus 而不是 player 上：
  // 后端的 PlayerInfo 是 extra="forbid" 的，往 player 里加字段会让请求
  // 直接被拒；gameStatus 只挑固定几个字段过网，加在这里是契约安全的）。
  const expense = QUARTERLY_EXPENSE[state.player.level] || DEFAULT_QUARTERLY_EXPENSE
  const spent = spendMoney(state, expense)

  // 支出取 -spent.actual 而不是 expense：家底见底时 moneyChange 会截在 0，
  // 实付就小于名义支出。播报里报实付，这一行的加减才对得上——
  // 报名义值的话，玩家会看到"支出 8000、净攒 8500"，而 13500 − 8000 = 5500。
  notes.push(
    `本季度工资到账 ¥${formatMoney(paid.actual)}（月薪 ${formatMoney(state.player.salary)} 元 × 3），`
    + `家庭与应酬支出 ¥${formatMoney(-spent.actual)}，`
    + `净攒 ¥${formatMoney(paid.actual + spent.actual)}，`
    + `家产合计 ¥${formatMoney(moneyOf(state))}。`
  )

  // ── 4.6 名下资产的季度账 ──
  // 买了车房不是一次性代价，而是从此每季度都要还的一笔账。
  // 代持的已经在 assetQuarterlyRiskOf 里减半，这里不用再判。
  const assetRisk = quarterlyAssetRisk(state)
  if (assetRisk > 0) {
    const [minR, maxR] = RESOURCE_LIMITS.risk
    const before = state.resources.risk
    const after = clamp(before + assetRisk, minR, maxR)
    if (after !== null && after !== before) state.resources.risk = after
    const count = (state.player.assets || []).length
    notes.push(
      `名下 ${count} 处资产又过了一个季度，${assetRisk > 0 ? '该打点的地方一处没少' : ''}`
      + `，廉政风险 +${assetRisk}。`
    )
  }

  // ── 5. 季末晋升裁定（一票否决在此生效，按本季峰值风险判）──
  // 任职年限由起算点现算，不在存档里维护一个累加值（理由见 gameConfig 的 tenureStartAbs）。
  const tenureQuarters = absQuarter - (Number(state.gameStatus.tenureStartAbs) || 1)
  const verdict = evaluatePromotion(state.resources, state.player.level, tenureQuarters)
  let promotion = null

  if (verdict.verdict === PROMOTION_VERDICT.PROMOTABLE) {
    if (state.gameStatus.promotionVeto) {
      // 危机公关里选了「硬扛」：这次提任已经废了，条件够也不上会。
      // 必须明确说出来，否则玩家会以为是判定出了 bug——四项都达标却不提任。
      notes.push('组织上对你近期的反映还有存疑，此次提任不予考虑，先以观后效。')
    } else if (state.player.hasIllicitRecord && auditHeldAt(state, absQuarter)) {
      // ── 挂起期内：连骰子都不掷 ──
      // 必须排在掷骰**之前**，否则挂起期内还在消耗随机数，白白挪动
      // 后面所有事件的随机序列，而且没有任何好处。
      promotion = null
      const left = (Number(state.gameStatus.auditHoldUntil) || 0) - absQuarter
      notes.push(`廉政审查的结论还没销，${(left / 4).toFixed(1)} 年内不列入提任考虑。`)
      verdict.verdict = PROMOTION_VERDICT.AUDIT_HELD
      verdict.reason = AUDIT_FAIL_NOTE
    } else if (state.player.hasIllicitRecord && !rollPromotionAudit(state)) {
      // ── 廉政审查：有案底的人多过的一道关 ──
      // 排在 promotionVeto **之后**：硬扛已经废掉的那一次不再掷骰子，
      // 否则同一季度会消耗两个随机数，还可能在通报里给出两条互相打架的理由。
      //
      // 掷骰子放在这里、不放进 evaluatePromotion，是因为那个函数是纯的、
      // 界面每次渲染都会调（见 promotion.js 的 auditPassOddsOf 那段说明）。
      promotion = null
      // 挂起：失败一次就出局一年半。单靠"本次否决"是拦不住的——
      // 贪腐流连续很多季都达标，每季重掷一次等于没有这道关（见 AUDIT_HOLD_QUARTERS）。
      state.gameStatus.auditHoldUntil = absQuarter + AUDIT_HOLD_QUARTERS
      // 裁定的结论也要跟着改。不改的话，季末通报说"挂起"、
      // 而提任面板仍旧显示"条件成熟，可提请研究提任"，
      // 玩家会以为是系统吃了他的晋升——这一处的口径必须与通报一致。
      verdict.verdict = PROMOTION_VERDICT.AUDIT_FAILED
      verdict.reason = AUDIT_FAIL_NOTE
      notes.push(AUDIT_FAIL_NOTE)
    } else {
      promotion = promote(state)
      if (promotion) {
        // 提任成功即重置任职起算点。**必须写在这里**，不能写进 promote()——
        // promote() 是"把人提到某个职级"这一步，它在哪一季发生的由调用方决定，
        // 让它自己去读季度号，等于把两个函数的职责搅在一起。
        state.gameStatus.tenureStartAbs = absQuarter
        // 换了单位就要报出来。厅局级以上职务模板不再带单位名，
        // 不说这一句的话，玩家的人物卡会在他没察觉的时候从"市财政局"
        // 变成"省财政厅"——像是存档串了别人的档。
        notes.push(
          `组织研究决定：提任「${promotion.to}」，`
          + `任「${promotion.position}」`
          + (promotion.unitChanged ? `，调${promotion.unit}` : '')
          + `，月薪调整为 ${promotion.salary} 元。`
        )
      }
    }
  } else if (verdict.verdict === PROMOTION_VERDICT.TENURE_PENDING) {
    // 四项都够了，只是椅子没坐热。**必须和"资历尚浅"分开说**：
    // 这两句对玩家的含义完全不同——前者是"再攒攒"，后者是"你已经够了，等着"。
    // 用同一句兜底，一个四项全达标的人会以为是自己属性不够，继续去堆已经溢出的能力。
    notes.push(
      `任现职 ${(tenureQuarters / 4).toFixed(1)} 年，未满 ${MIN_TENURE_YEARS} 年，`
      + `本次不列入提任考虑。`
    )
  } else if (
    verdict.verdict === PROMOTION_VERDICT.RISK_SUSPENDED
    || verdict.verdict === PROMOTION_VERDICT.RISK_INTERVIEW
  ) {
    // 一票否决要明确告知玩家，否则玩家不知道卡在哪
    notes.push(verdict.reason)
  }

  // ── 6. 提任与到龄结算完再判一次结局（登顶、到龄退休在这一步才为真）──
  const postEnding = checkGameOver(state)
  if (postEnding) {
    const result = finishGame(state, postEnding)
    return { ...result, notes, promotion, verdict }
  }

  // ── 7. 廉政风险自然衰减，放在最后。
  //      裁定用的是本季峰值风险，不存在"休整一季就把超标风险洗白"。
  rest('risk', -TUNING.riskDecay)

  // ── 7.5 那通电话你没有听，可打过电话的人已经把话带到了 ──
  //      风声里选了"不走"的人在这里兑现后果：下个季度直接立案审查。
  //      这一条**不看差额、也不看风险**，它不依赖任何数值——电话打来的那一刻
  //      账上就有 300 万以上，"有人问起你了，问得很细"说的就是这件事。
  //
  //      为什么排在申报**前面**，而且这一季干脆不走申报：申报那一套
  //      （差额分档、养鱼期、约谈）成立的前提是"组织上还不知道你贪了多少"。
  //      这里组织上已经知道了，再走一遍分档，等于对着一个已经被盯上的人
  //      宣布"未达立案标准"——那句通报会当场露馅。
  //
  //      置位不清账：fleeWarned 早就置过了（OnceFlag 在接电话那一刻就写死），
  //      所以这条线不会因为选了"不走"而重新开一次口子。
  const refusedFlee = Boolean(state.gameStatus.fleeRefused)
  if (refusedFlee) {
    state.gameStatus.fleeRefused = false
    if (!hasGraft(state)) {
      // 兜的是旧存档与改档：账上一分赃款都没有，决定书送不到他手上
      // （同第 8 步与第 8.5 步那两条，理由见那两处）。
      notes.push('审查调查组调走了你经手的全部账目和批件，一笔问题也没查出来。')
      return finishGame(state, buildEnding('dismissed', state), notes)
    }
    state.gameStatus.investigationPending = true
    notes.push(
      '你没有走，也什么都没说。第二天上午，审查调查组的人直接到了办公室——'
      + '这一次不是函询，也不是谈话，是立案审查调查。'
    )
  }

  // ── 8. 财产申报（每 5 个季度一次）──
  //      排在结局判定之后：本季已经结束的话，再挂一起立案审查没有意义，
  //      玩家也看不到——那时候弹的是结局海报。
  //
  //      季度序号用 (年-1)×4 + 季 折算成绝对序号再取模，而不是拿 Q 号取模：
  //      拿 Q 号取模会让每年 Q1 都是"申报季"，跟"每 5 个季度"完全是两回事。
  //      absQuarter 在上面第 1 步就算好了，这里直接复用。
  if (!refusedFlee && absQuarter % DECLARE_EVERY_QUARTERS === 0) {
    const decl = runDeclaration(state)

    // ── 养鱼期：头两年只谈不查 ──
    // 差额已经过线的，在头 DECLARE_GRACE_QUARTERS 个季度里降格成约谈：
    // 记风险、找你谈话，但不下决定书。玩家收到的信号是"组织上还没收网"——
    // 这正是要给的错觉，他以为自己还有时间。
    //
    // 降的是**档位**，不是差额：通报里的钱数照实印。
    // 把差额也改小等于对玩家撒谎，而他手里有工资单，算得出来。
    const inGrace = absQuarter <= DECLARE_GRACE_QUARTERS
    const capped = inGrace && (decl.tier === DECLARE_TIER.CASE || decl.tier === DECLARE_TIER.SEVERE)
    const tier = capped ? DECLARE_TIER.TALK : decl.tier

    const exposedNote = decl.exposed.length
      ? `其中 ${decl.exposed.length} 处代持被翻了出来，代持不是万无一失。`
      : ''
    // 通报要把**两个增量**都印出来：差额是"财产涨的"减"收入涨的"，
    // 只说其中一个，玩家没法自己把这个数算平，第一反应是界面算错了。
    notes.push(
      `又到了个人有关事项报告的时候。你填了家产 ¥${formatMoney(decl.cash)}、`
      + `名下资产 ¥${formatMoney(decl.declared)}，`
      + `按退赃后起算的合法收入 ¥${formatMoney(decl.legal)}。${exposedNote}`
    )
    // 提示**不进 notes**：notes 会被 GameMain 统一按 info 弹一遍，
    // 提示又得按等级换颜色，塞进去就会弹两条（一灰一黄）。
    // 单独挂一个字段出去，由调用方决定用什么颜色弹。
    //
    // 从**实际档位**取提示，不从差额取：养鱼期降了档，
    // 提示还写着"材料已移交纪检监察机关"就是一句假话，
    // 而玩家会照着这句假话去决策（以为完了，其实没有）。
    const hint = hintForTier(tier)
    if (hint) {
      declaration = {
        gap: decl.gap,
        tier,
        level: hint.level,
        text: hint.text,
        over: tier === DECLARE_TIER.CASE || tier === DECLARE_TIER.SEVERE
      }
    }

    if (tier === DECLARE_TIER.TALK) {
      // ── 约谈：不立案，但记账 ──
      // 这一档存在的意义是给贪腐流一段"还活着但要付代价"的空间。
      // 风险 +8 是代价，而且它落在下一次提任裁定上：约谈过的这一季，
      // riskMax 卡住提任的概率明显上升。玩家会自己算出"60 万比 40 万贵"。
      rest('risk', DECLARE_TALK_RISK)
      notes.push(
        `差额 ¥${formatMoney(decl.gap)} 元，未达立案标准，`
        + '但已被列入谈话函询范围。组织上找你谈了一次话。'
      )
    } else if (decl.tier === DECLARE_TIER.CASE || decl.tier === DECLARE_TIER.SEVERE) {
      // ── 决定书发不下去：账上一分赃款都没有 ──
      //      差额越线但 illicitWealth 为 0，说明这个差额不是收钱堆出来的
      //      （代持手续费之类）。决定书是冲着钱来的，送到他手上只会写成
      //      "查明收受财物共计 ¥0 元"，还配三个他根本没资格选的狡辩。
      //      通报里那句"材料已被移交纪检监察机关"同样是句假话，
      //      而玩家会照着这句假话去决策——所以连通报都不发，当场了结。
      if (!hasGraft(state)) {
        return finishGame(state, buildEnding('dismissed', state), notes)
      }
      // 只挂待办，不在这里弹窗：事件弹窗由 GameMain 在「推进工作」时统一开，
      // 这里直接弹会和季末那堆通知打架。
      state.gameStatus.investigationPending = true
      const line = DECLARE_CASE_LINE[decl.tier]
      // 通报里要点破**这是第几次**，因为退赃机会的有无全看这个：
      // 头一次进来的人得知道自己还退得了；第二次进来的人更得知道这次退不了了——
      // 否则他会在决定书上找那个不存在的选项，以为界面出了错。
      const retreatLine = state.gameStatus.usedRetreat
        ? '认罪退赃的机会已经用过了，这一次没有退路。'
        : '你还有一次认罪退赃的机会。'
      notes.push(
        `差额 ¥${formatMoney(decl.gap)} 元，${line}，材料已被移交纪检监察机关。${retreatLine}`
      )
    }
  }

  // ── 8.5 函询上对抗或沉默的直接后果：下季度立案 ──
  //      这是**另一条**立案入口：申报那条看差额（钱多不多），这条看态度
  //      （材料交没交）。两条同时成立时结论一致，只是备注多一条——
  //      investigationPending 本来就只置位一次，不会重复弹决定书。
  //
  //      为什么不当天立案：函询答复到立案之间隔着一道审批程序，
  //      玩家的体感是"我拖着没交，过了一阵子他们来了"。
  //      当场弹决定书则像是选项自带的动画，而不是他自己招来的后果——
  //      而这正是这条支线唯一要传达的东西。
  if (state.gameStatus.inquiryEscalated) {
    state.gameStatus.inquiryEscalated = false
    // ── 对抗函询的是个一分钱没贪的人 ──
    //      函询本身与"贪没贪"无关（要的是说明材料），所以这条支线
    //      一个清廉玩家也走得进来：他在通知书上选了"打招呼问口径"，
    //      下季度就进立案程序。实测 10 局"只要风险不要钱"的机器人，
    //      5 局是这么走到决定书那一屏的，判词里的金额是 ¥0。
    //      态度是要付代价的，但代价不是那份送不到他手上的决定书——
    //      查完了没查出问题，按免职闲赋了结（同 checkGameOver 里那一条）。
    if (!hasGraft(state)) {
      notes.push(
        '函询的说明你没有交上去。审查调查组调走了你经手的全部账目和批件，'
        + '一笔问题也没查出来。'
      )
      return finishGame(state, buildEnding('dismissed', state), notes)
    }
    state.gameStatus.investigationPending = true
    notes.push(
      '函询的说明你没有交上去。组织上等了一个季度，没有等到。'
      + '审查调查组的人已经在你办公室门口了。'
    )
  }

  // ── 9. 一次性标记清零 ──
  //      否决只在本次裁定有效，用完即弃；危机公关每季度只弹一次，
  //      新季度重新按 risk 是否仍超线决定要不要再弹。
  state.gameStatus.promotionVeto = false
  state.gameStatus.crisisHandled = false
  // crisisHandledCount / crisisFavorCount **不在这里清**，它们是整条职业生涯的
  // 累计值。顺手在这里补一句清零，等于每季度把平事的价钱打回第一次——
  // 递增就白做了。这里只清"本季度弹过没有"，触发条件本身也没动。
  // 走动关系的季度计数。**必须每季度清零**，否则有案底的人走一次之后
  // 就再也不能走动了——那不是"每季度限一次"，是"一辈子限一次"。
  state.gameStatus.balanceThisQuarter = 0

  // 事件里挂下的通报（调离之类）到季末才进「近期通报」面板。
  // 事件当场弹的是即时消息，面板要的是"这一季发生过什么"，
  // 所以攒到季末一起列——**清空必须在 push 之后**，
  // 漏了这一步这条通报会在每个季度重复出现，一直挂到游戏结束。
  if (state.gameStatus.pendingNotice) {
    notes.unshift(state.gameStatus.pendingNotice)
    state.gameStatus.pendingNotice = ''
  }

  return { quarter: state.player.quarter, notes, promotion, verdict, gameOver: null, declaration }
}

/**
 * 走动关系：花 1 点行动力、一笔家产去"走动走动"。
 *
 * 这是一条**不依赖事件池**的固定动作，存在的理由是风险化解不能全靠运气——
 * 事件池里降风险的事件就那么几条，抽不到就只能干看着风险往上堆。
 * 有了它，玩家每季度至少有一次主动压风险的机会，代价是少处理一件事。
 *
 * 降 5~10 是随机区间，不是固定值：固定值会让它变成一道算术题
 * （够 AP 就点，点满为止），随机则让"这季度点不点"稍微值得想一下。
 *
 * ── 价格随职级走，且认案底 ──────────────────────────────────
 * 家产门槛不是定数：它按职级档递增，收过钱的再翻五倍，
 * 取值一律问 assets.js 的 balanceMoneyCostOf()（见那张表的说明）。
 * 引擎这里**只负责问价**，不自己算倍率——价钱写两处迟早对不上。
 *
 * ── 有案底的人每季度只能走一次，且降幅降到三分之一 ──────────
 * 涨价和限次都只是外围。实测：倍数从 1 提到 5、再加每季 1 次的上限，
 * 60 局里贪腐流仍走成 964 次、落马率只有 11.7%——**一个账上趴着几百万的人，
 * "贵"和"限几次"都不是他的约束**。
 * 决定结局的是单次降幅：降 5~10 点，恰好是立案线追不上的速度。
 * 所以最后这一刀落在降幅上（1~3 点），见 money.js 的 recordRiskReliefMin。
 * 上限只卡有案底的人，理由见 BALANCE_RECORD_QUARTERLY_CAP 那段。
 *
 * @returns {{ok: boolean, message: string, changes: Array}}
 */
export function balanceRelations(state) {
  if (state.gameStatus.gameOver) return { ok: false, message: '本局已结束。', changes: [] }

  const cost = BALANCE.apCost
  if (state.player.ap < cost) {
    return { ok: false, message: `行动力不足，走动关系要花 ${cost} 点。`, changes: [] }
  }

  // ── 家底门槛：与 applyOption 同一套规矩，先验资再扣 ──
  // 判断必须放在改动任何状态之前。界面上按钮已经置灰了，这里是第二道：
  // 置灰归界面，扣不扣得起归引擎——界面漏了不该让状态烂掉（行动力白扣、
  // 风险白降，钱却一分没花）。
  const hasRecord = Boolean(state.player.hasIllicitRecord)
  // 家产要传进去：有案底的加价拿它封顶（见 assets.js 的 RECORD_MARKUP_WALLET_CAP）。
  // 不传的话，刚退完赃、账上只剩十来万的人会被一堵 25 万的墙挡在外面——
  // 而退赃的全部意义就是让他还能重新做人。
  const moneyCost = balanceMoneyCostOf(state.player.level, hasRecord, moneyOf(state))
  if (moneyOf(state) < moneyCost) {
    return {
      ok: false,
      message: `家底还差 ¥${formatMoney(moneyCost - moneyOf(state))}，走动不起了。`,
      changes: []
    }
  }

  // ── 次数门槛：有案底的人每季度只能走一次 ──
  // 与家底门槛同一个位置、同一个道理——**动状态之前先判**。
  // 涨价栏不住他（实测 ×2 时 296 次里只拦下 1 次），能拦住"每季度刷满"
  // 的只有次数，见 assets.js 的 BALANCE_RECORD_QUARTERLY_CAP。
  const walkedThisQuarter = Number(state.gameStatus.balanceThisQuarter) || 0
  if (hasRecord && walkedThisQuarter >= BALANCE_RECORD_QUARTERLY_CAP) {
    return {
      ok: false,
      message: '身上带着事，这个季度不便再走动了。',
      changes: []
    }
  }

  state.player.ap -= cost
  state.gameStatus.balanceThisQuarter = walkedThisQuarter + 1

  // 降幅按案底分档：收过钱的人，同一趟走动压不住多少事（见 money.js 那段说明）。
  // 这是这道绞索唯一咬得住的地方——涨价和限次实测都拦不住贪腐流，
  // 因为决定结局的是"每季度能压下去多少风险"，不是"走一趟多贵、能走几趟"。
  const reliefMin = hasRecord ? BALANCE.recordRiskReliefMin : BALANCE.riskReliefMin
  const reliefMax = hasRecord ? BALANCE.recordRiskReliefMax : BALANCE.riskReliefMax
  const popGain = hasRecord ? BALANCE.recordPopularityGain : BALANCE.popularityGain

  const span = reliefMax - reliefMin + 1
  const relief = reliefMin + Math.floor(Math.random() * span)

  const changes = []
  applyEffects(state, { risk: -relief, popularity: popGain }, changes)
  // 走 spendMoney 而不是 moneyChange，是为了让这笔支出也生成一条明细
  // （界面的播报与飘字认的是明细，特判会多出一条只对钱生效的分支），
  // 更是为了把它记进累计支出——**这一步才是这道设计真正咬人的地方**。
  // 早先只扣钱不记账，走动关系就成了一条洗钱通道：花掉的每一分钱都
  // 从差额的分子上消失，而差额就是纪委手里的那本账。实测带案底的人
  // 每局走掉 ¥400 万差额，落马率被从 50% 压到 10%。
  spendMoney(state, moneyCost, changes)

  // 判词跟着降幅走。两句话的差别就是这道设计的全部：
  // 干净的人一顿饭能把事按下去，带案底的人只能换回一句"再看看"。
  const outcome = hasRecord
    ? '饭桌上把话递过去了，对方笑着点头。你心里清楚，这点交情，压不住多大的事。'
    : '人情走到位了，风险暂时按下去了。'

  return {
    ok: true,
    changes,
    apLeft: state.player.ap,
    message: `${outcome}因走动关系，支出 ¥${formatMoney(moneyCost)}。`
  }
}

/** 判断某项资源的变化方向是否有害，供界面着色 */
export function isHarmful(key, delta) {
  if (key === 'risk') return delta > 0 // 风险上升才有害
  // 家产和其余资源同向：变少就是坏事。留在这个判断里而不是让界面特判，
  // 是因为 EventModal 的效果签与 GameMain 的飘字都靠它上色。
  return delta < 0
}
