/**
 * 资产、非法所得与财产申报。
 *
 * ── 三条线要分清 ─────────────────────────────────────────────
 *   money          现金，随时能花。收了钱就是钱，不分来路。
 *   illicitWealth  累计非法所得，记的是**纪委手里的账**，不是你现在有多少钱。
 *                  收下 800 万又全花光了，money 归零，这一笔照样在账上。
 *   assets         已经换成车房的那部分钱。**它不进 illicitWealth**——
 *                  买车买房本身不违法，违法的是"你的收入解释不了这些钱"。
 *
 * 三条线的交叉点就是财产申报：
 *   `家产 + 名下资产 - (累计合法收入 - 退赃起算点) = 说不清的部分`
 * 这个差额才是把三者串起来的那根绳。
 *
 * ── 为什么要减"退赃之后"的收入，而不是全部收入 ──────────────
 * 减全部收入的话，分母随工龄一路涨，干到四十来岁它就大到能盖住任何一笔钱——
 * 贪腐随时间越来越安全，退过赃的人更是永远算不出差额（实测 554 次申报里
 * 只有 12 次算出 100 万以上）。减去"退赃起算点"之后，交出去的旧账不再
 * 替他打掩护，新收的每一笔都重新算数。三种写法的完整取舍见
 * constants/assets.js 那段——那里还记着另外两种错法各自的实测代价。
 */

import {
  ASSET_HOLDERS,
  ASSET_KINDS,
  PROXY_EXPOSE_ODDS,
  assetCostOf,
  assetQuarterlyRiskOf,
  assetSpecOf,
  declareLinesOf
} from '@/constants/assets'

/** 读一个数字字段，取不到或非法就当 0。读档/老数据都可能缺字段 */
function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function moneyOf(state) {
  return num(state && state.player && state.player.money)
}

export function illicitWealthOf(state) {
  return num(state && state.player && state.player.illicitWealth)
}

export function legalIncomeOf(state) {
  return num(state && state.player && state.player.legalIncome)
}

/**
 * 累计生活支出。**差额公式里必须有它**，理由见 runDeclaration 里那段——
 * 少了它，一个干得久的干部光是"花掉的钱"就能把赃款对冲干净。
 * 退赃时归零：那一天之前的开销记在旧账上，与之后重新开始的一段无关。
 */
export function expenseTotalOf(state) {
  return num(state && state.gameStatus && state.gameStatus.expenseTotal)
}

/**
 * 合法收入的**起算点**：上一次退赃时的累计合法收入（没退过赃就是 0）。
 *
 * 差额 = 现有财产 − （累计合法收入 − 起算点）。起算点之前挣的工资不算数，
 * 因为那时候的家产已经在退赃时被整体上交了——再拿它去抵扣，
 * 等于让玩家用一笔**已经交出去的钱**给自己打掩护。
 *
 * 由引擎在退赃当场改写（见 engine.js 的 surrender）。**必须入档**：
 * 丢了它，起算点回到 0，减数变成一辈子的工资总和，差额被整个盖住，
 * 玩家刷新一下就能把"退赃之后重新被查"这条路洗掉。
 */
export function retreatBaselineOf(state) {
  const gs = (state && state.gameStatus) || {}
  return num(gs.retreatLegalBaseline)
}

/**
 * 名下资产数组。**一定返回数组**——老存档里没有这一项，
 * 返回 undefined 会让后面每一次 .filter 都炸在同一个地方。
 */
export function assetsOf(state) {
  const raw = state && state.player && state.player.assets
  return Array.isArray(raw) ? raw : []
}

/**
 * 买一件资产。**就地改档案**，返回明细供界面播报。
 *
 * 钱不够时返回 ok:false，但**不改动任何状态**——调用方（引擎）已经在
 * 扣钱之前验过资了，这里是第二道，防止别的入口绕过验资把状态写坏。
 */
export function buyAsset(state, buy) {
  const kind = buy && buy.kind
  const holder = (buy && buy.holder) || 'self'

  if (ASSET_KINDS.indexOf(kind) < 0) {
    return { ok: false, message: `资产类别「${kind}」不在目录内，本次置办作废。` }
  }
  if (ASSET_HOLDERS.indexOf(holder) < 0) {
    return { ok: false, message: `代持方式「${holder}」不合法，本次置办作废。` }
  }

  const spec = assetSpecOf(kind)
  const cost = assetCostOf(kind, holder)
  if (moneyOf(state) < cost) {
    return { ok: false, message: `家底不够，置办这件资产需要 ¥${cost}。` }
  }

  state.player.money = moneyOf(state) - cost
  if (!Array.isArray(state.player.assets)) state.player.assets = []

  const asset = {
    // id 只要在局内唯一即可，用来做列表 key 与后续增删的锚点
    id: `${kind}_${state.player.assets.length + 1}_${Date.now() % 100000}`,
    kind,
    name: spec.name,
    price: cost,
    holder,
    quarterlyRisk: assetQuarterlyRiskOf(kind, holder),
    acquiredQuarter: state.player.quarter || ''
  }
  state.player.assets.push(asset)

  return { ok: true, asset, cost, message: `置办了${spec.name}。` }
}

/** 全部资产的季度廉政风险合计，逐季累加 */
export function quarterlyAssetRisk(state) {
  return assetsOf(state).reduce((sum, a) => sum + num(a.quarterlyRisk), 0)
}

/** 名下资产的购入价合计（含代持手续费） */
export function totalAssetValue(state) {
  return assetsOf(state).reduce((sum, a) => sum + num(a.price), 0)
}

/**
 * 算这次财产申报的差额。
 *
 * @returns {{
 *   declared: number,   本人名下 + 已被翻出的代持，计入申报的资产额
 *   exposed: Array,     本次申报被翻出来的代持资产
 *   counted: number,    本次计入申报的财产总额（现金 + declared）
 *   cash: number,       家产
 *   legal: number,      须被抵扣的合法收入（累计收入 − 退赃起算点）
 *   spent: number,      累计生活支出（加回来，见下方说明）
 *   gap: number,        说不清的部分（不会为负）
 *   over: boolean,      是否越过移交纪委的红线
 * }}
 */
/**
 * 组织上**已经看得见**的财产：家产 + 本人名下的资产。
 *
 * 代持的那部分不在里面——藏起来了就是藏起来了，没被翻出来之前不进这个数。
 * 所以它是个**确定值**：同一份存档问几次都是同一个答案。
 * 这一点是给 checkGameOver 用的：结局判定会在多处被调用
 * （结算后、进下一季前），掷骰子的话同一个人会一会儿过关一会儿不过关。
 */
export function visiblePropertyOf(state) {
  const declared = assetsOf(state).reduce((sum, asset) => {
    if (asset.holder === 'proxy') return sum
    return sum + num(asset.price)
  }, 0)
  return moneyOf(state) + declared
}

/**
 * 差额公式，**唯一的实现**：`gap = max(0, 计入的财产 + 累计支出 − 退赃之后的合法收入)`。
 *
 * 申报（runDeclaration）与到顶时的结论（engine 的 checkGameOver）问的是同一个数，
 * 各算各的迟早会对不上——而对不上的表现不是报错，是同一个人在两处
 * 被算出两个差额，玩家只会觉得其中一处是错的。
 *
 * @param {Object} state
 * @param {number} counted 本次计入的财产总额（家产 + 已计入的资产）
 * @returns {{legal:number, spent:number, gap:number}}
 */
export function declarationGapOf(state, counted) {
  const legal = Math.max(0, legalIncomeOf(state) - retreatBaselineOf(state))
  const spent = expenseTotalOf(state)
  return { legal, spent, gap: Math.max(0, (Number(counted) || 0) + spent - legal) }
}

export function runDeclaration(state, random = Math.random) {
  const exposed = []
  let declared = 0

  assetsOf(state).forEach((asset) => {
    if (asset.holder !== 'proxy') {
      // 本人名下的车房藏不住，当场进总数
      declared += num(asset.price)
      return
    }
    // 代持的赌一把。掷骰函数从参数进，便于测试时固定结果
    if (random() < PROXY_EXPOSE_ODDS) {
      exposed.push(asset)
      declared += num(asset.price)
    }
  })

  const cash = moneyOf(state)
  const counted = cash + declared
  // 减的是"**退赃之后**的合法收入"，不是一辈子的累计收入。
  // 两个极端都错，中间这条才对：
  //   · 减一辈子累计收入 → 干到四十来岁，分母大到能盖住任何一笔钱，
  //     贪腐随时间越来越安全，退赃之后更是永远算不出差额；
  //   · 只减最近几期收入 → 被减数是**存量**、减数是**流量**，
  //     清官攒了二十年的工资解释不通，实测落马率 65%；
  //   · 两边都改成增量 → 细水长流的小额贪腐每一期都从零起算，
  //     永远攒不到线，实测落马率掉到 10%。
  // 现在这条把"能不能累积"和"会不会误伤"一起解决了：
  //   清官的家产 = 合法收入 − 支出，差额是**负的**，夹在 0 之后恒为 0；
  //   贪腐的家产 = 合法收入 − 支出 + 赃款，差额就是赃款，**逐期累积**。
  //
  // **支出必须加回来**，否则它会替赃款打掩护：家产 = 工资 − 支出 + 赃款，
  // 不减支出的话差额 = 赃款 − 一辈子家用，一个科级干部三十年花掉近百万，
  // 赃款得先把这个坑填满才越得了线——实测落马率因此掉到 10%。
  // 加回来之后这个式子就是恒等式：差额 = 赃款。
  // 清官的"赃款"是 0，差额是 0；贪官的家产里多出多少，差额就是多少。
  // 三项都在 declarationGapOf 里，这里只把"本次计入了多少"交给它。
  const { legal, spent, gap } = declarationGapOf(state, counted)
  const tier = declarationTierOf(gap, state.player.level)

  return {
    declared,
    exposed,
    counted,
    cash,
    spent,
    legal,
    gap,
    tier,
    // 立案与否只看 tier，不再单列一个布尔。
    // 留着 over 会和 tier 变成同一件事的两种说法，迟早有一处忘了同步。
    over: tier === DECLARE_TIER.CASE || tier === DECLARE_TIER.SEVERE
  }
}

/**
 * 申报差额的处置档位。
 *
 * ── 门槛一律含等号 ──────────────────────────────────────────
 * 原先写的是严格大于，本意是"超过 50 万才查"，但它制造了一个
 * 玩家一定会找到的漏洞：中标之后那笔种子事件正好是 50 万，
 * 于是"第一次伸手"永远卡在线上、永远不查，而线的另一边就是零成本。
 * 实测下来一个见钱就收的玩家 100% 会伸第二次手——不是他胆子大，
 * 是第一次伸手在数学上没有任何后果。含等号之后那句话才成立：
 * **伸手和越线是同一件事**。
 */
export const DECLARE_TIER = {
  NONE: 'none',     // 没到线，正常申报
  TALK: 'talk',     // 约谈：没立案，但组织上找你谈一次话，风险记账
  CASE: 'case',     // 立案：决定书下来，认罪退赃还能保住公职
  SEVERE: 'severe'  // 直接立案：退赃那条路已经没有了
}

/**
 * 差额 → 档位。三档的边界按**职级**从 constants/assets.js 取，这里不写死数字。
 *
 * 为什么要带 level：金额本身是分职级的（科级一笔 10 万，厅级一笔 300 万），
 * 门槛不分档就会出现"科级收 10 万被立案、厅级收 300 万倒没事"。
 * level 缺省时按最低档兜底——宁可查得早，也不要因为读不到职级就永远安全。
 */
export function declarationTierOf(gap, level) {
  const amount = Number(gap) || 0
  const lines = declareLinesOf(level)
  if (amount >= lines.severe) return DECLARE_TIER.SEVERE
  if (amount >= lines.caseLine) return DECLARE_TIER.CASE
  if (amount >= lines.talk) return DECLARE_TIER.TALK
  return DECLARE_TIER.NONE
}

/**
 * 档位 → 提示文案。
 *
 * ── 为什么提示改成从 tier 派生，而不是自己再比一遍数字 ────────
 * 早先这里是一张独立的阈值表，靠注释提醒"黄档的边界必须与 over 同一个比较"。
 * 那是靠人记住的约定，而违反它的后果特别难查：提示说没事、材料其实已经移交了，
 * 玩家会觉得系统在骗他。现在提示**由档位直接映射**，两者不可能不一致——
 * 想让黄色对应别的状态，改都改不出来。
 */
// 提示只说**差额落在哪一档**，不说还有没有退赃机会——
// 那张牌由 gameStatus.usedRetreat 决定，跟差额无关（见 gameConfig 里那段说明），
// 而提示是差额的纯函数，读不到那个标记。硬要在这里写"退赃还来得及"，
// 在退赃已经用掉的人身上就是句假话，而玩家会照着这句假话去做决策。
// 有没有退路，由季末通报单独交代（见 engine.js 立案那一段的 retreatLine）。
const TIER_HINTS = {
  [DECLARE_TIER.SEVERE]: {
    level: 'danger',
    text: '差额已达直接立案标准，请准备说明全部资金来源。'
  },
  [DECLARE_TIER.CASE]: {
    level: 'warning',
    text: '差额已达立案标准，材料已移交纪检监察机关。'
  },
  [DECLARE_TIER.TALK]: {
    level: 'info',
    text: '差额已进入约谈范围，组织上会找你谈一次话。'
  }
}

/** 档位 → 提示。没到最低那档返回 null，也就是正常申报、不提示 */
export function hintForTier(tier) {
  return TIER_HINTS[tier] || null
}

/**
 * 差额 → 提示。
 *
 * 引擎走的是 hintForTier(实际档位) 那条路，不是这一个：养鱼期会把
 * 立案档降到约谈档（见 engine.js 申报那一段），那时候差额没变、档位变了，
 * 提示必须跟着档位走。用这个"从差额直接算"的版本，玩家会看到一句
 * 与实际处置不符的"材料已移交"——他下次就会学乖，不再信提示。
 * 保留它只是为了给不关心养鱼期的调用方一个一步到位的入口。
 */
export function declarationHint(gap, level) {
  return hintForTier(declarationTierOf(gap, level))
}
