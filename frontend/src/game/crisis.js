/**
 * 危机公关。
 *
 * ── 为什么不做成事件库里的一条 ────────────────────────────────
 * 事件池是按"单位 + 职级 + 题材"抽的，抽到什么全看运气。而危机公关是
 * **必须出现**的：玩家风险越线了，不给他化解的机会，所谓"给玩家操作空间"
 * 就只是句空话。所以它不是"池子里的一条料"，是有触发条件的机制，
 * 由 GameMain 在「推进工作」时判在抽取之前。
 *
 * 触发条件看着简单（risk > riskMax），实际有两个坑：
 *   1. 硬扛有一半概率风险原地不动，那样条件仍然成立，下次点「推进工作」
 *      会立刻再弹一次。所以结算过一次就打 crisisHandled 标记，
 *      本季度不再弹（新季度由 advanceQuarter 清掉）。
 *   2. riskMax 是**随职级变的**（县处级 25，厅局级 20）。写死一个阈值
 *      就会出现"厅局级玩家风险 22 已经越线却弹不出来"。
 *
 * 产出的对象是标准 GameEvent（多带本地标签），直接交给 EventModal 渲染，
 * 复用那套"弹窗关不掉、必须做选择"的交互。
 */

import { requirementOf } from '@/constants/promotion'
import { CRISIS, formatMoney } from '@/constants/money'

export const CRISIS_EVENT_ID = 'evt_crisis_public_relations'

/**
 * 平事成本与效果的递增刻度。
 *
 * 三个函数都是**纯的**：只吃一个"用过几次"，不碰 state。
 * 这样它们能单独测（见下面的自检），而 buildCrisisEvent 只负责把结果摆进选项。
 *
 * 计数从 0 起：0 表示"还没用过"，取到的就是改动前的老值。
 * 写代码时按"第几次"（1 起）想，落进数组时按"用过几次"（0 起）算，
 * 这两者差一位，是最容易错的地方——所以函数签名一律是 count（已用次数）。
 */

/** 第 count+1 次「花钱平事」的价钱（元） */
export function crisisMoneyCostOf(count) {
  let cost = CRISIS.moneyCost
  for (let i = 0; i < count; i += 1) {
    // 向上取整到"万"。不取整会得到 168750 这种数，
    // 玩家在选项上读到的价钱就成了七个数字，而这一栏的信息量只有"贵到什么程度"。
    cost = Math.min(
      CRISIS.moneyCostCap,
      Math.ceil((cost * CRISIS.moneyCostRatio) / 10000) * 10000
    )
  }
  return cost
}

/** 第 count+1 次「花钱平事」能压下多少风险（**正数**，用的时候取负） */
export function crisisMoneyReliefOf(count) {
  return Math.max(
    CRISIS.moneyReliefFloor,
    CRISIS.moneyRelief - CRISIS.moneyReliefStep * count
  )
}

/** 第 count+1 次「动用向上管理人脉」的门槛（点） */
export function crisisMgmtGateOf(count) {
  return CRISIS.mgmtCost * Math.pow(CRISIS.mgmtGateRatio, count)
}

/** 从存档里读两个计数，缺省当 0（旧存档没有这两个字段） */
function countsOf(state = {}) {
  const status = state.gameStatus || {}
  return {
    spend: Math.max(0, Number(status.crisisHandledCount) || 0),
    favor: Math.max(0, Number(status.crisisFavorCount) || 0)
  }
}

/**
 * 取该职级的风险上限。取不到（职级不在阶梯里）返回 null。
 *
 * 省部级正职是阶梯顶点的占位行，riskMax 写的是 0——直接拿它当阈值，
 * 玩家一到顶就永远处在"越线"状态。所以 0 视为"没有上限"，不触发危机。
 */
export function riskMaxOf(level) {
  const req = requirementOf(level)
  if (!req || !req.riskMax) return null
  return req.riskMax
}

/** 本回合该不该弹危机公关 */
export function needsCrisis(state = {}) {
  const status = state.gameStatus || {}
  if (status.gameOver || status.crisisHandled) return false

  const max = riskMaxOf((state.player || {}).level)
  if (max === null) return false

  return (Number((state.resources || {}).risk) || 0) > max
}

/**
 * 组装危机公关事件。
 *
 * 三个选项各自的"代价"用的是不同字段，因为它们的性质本来就不同：
 *   costMoney  真金白银，引擎会在结算时扣掉
 *   requires   只是门槛（够不够格点），不负责扣——扣由 effects 里写
 *   gamble     结果随机，静态的 effects 表达不了
 *   veto       提任否决，是一枚延后到季末才生效的标记
 * 硬把它们塞进同一个 effects 字段，等于让"描述"和"结算"两件事互相猜。
 */
export function buildCrisisEvent(state = {}) {
  const risk = Number((state.resources || {}).risk) || 0
  const max = riskMaxOf((state.player || {}).level)

  // 两个计数各管各的：钱花得多了不涨价到人脉头上，人情用得多了也不涨价到钱头上。
  // 它们本来就是两条不同的路——一条花家产，一条花人情，
  // 合成一个计数的话，"我一直花钱平事"会莫名其妙把老领导的电话也打不通。
  const { spend, favor } = countsOf(state)
  const moneyCost = crisisMoneyCostOf(spend)
  const moneyRelief = crisisMoneyReliefOf(spend)
  const mgmtGate = crisisMgmtGateOf(favor)
  const mgmtNow = Number((state.resources || {}).mgmt) || 0

  return {
    id: CRISIS_EVENT_ID,
    title: '廉政风险预警',
    npcName: '分管领导',
    unitType: '通用',
    bands: [],
    theme: 'risk',
    // 事件库里的措辞一律是"有人在查你"，这里不一样：这条是组织上先找你谈话，
    // 语气得是"给你机会"，否则三个选项看起来都像是畏罪。
    description:
      `你的廉政风险已升至 ${risk}%，越过本级别的上限 ${max}%。`
      + '分管领导把你叫到办公室，门关上，先给你倒了杯水：「有些反映，'
      + '组织上先跟你通个气。你自己心里有数，趁着还没定论，该怎么办就怎么办。」'
      + '杯子放在你面前，他没再说第二句。',
    options: [
      {
        id: 'opt_a',
        text: '花钱平事：该退的退，该补的补，把窟窿堵上',
        costAp: 0,
        costMoney: moneyCost,
        effects: { risk: -moneyRelief },
        // 第几次只在用过之后才说。第一次的提示语保持改动前的原文——
        // 那时候玩家还不知道这条路会涨价，先跟他讲"下次更贵"，
        // 等于在他还没做过选择的时候就替他后悔。
        note: `需 ¥${formatMoney(moneyCost)}，家底不够则点不动`
          + (spend > 0 ? `（第 ${spend + 1} 次，这笔钱一次比一次难凑，压下去的风险也一次比一次少）` : '')
      },
      {
        id: 'opt_b',
        text: '动用向上管理人脉，请老领导帮忙说句话',
        costAp: 0,
        // 门槛涨，消耗不涨：每次找他还是花那 10 点人情，
        // 涨的是"他还愿不愿意接这个电话"。所以 requires 用 mgmtGate，
        // effects 里的 mgmt 仍扣 CRISIS.mgmtCost。
        requires: { mgmt: mgmtGate },
        effects: { risk: -CRISIS.mgmtRelief, mgmt: -CRISIS.mgmtCost, authority: -3 },
        // 门槛与消耗必须分开写。原先是一句"需向上管理 40 点，人情用一次薄一次"，
        // 40 是**门槛**、真正扣的只有 10 点（CRISIS.mgmtCost）——玩家按字面读成
        // "要花 40 点"，点下去只掉了 10 点，观感就是系统少扣了。
        // 现在两笔账并排摆着，"人情用一次薄一次"归到门槛那一头（薄的是他还接不接
        // 这个电话，不是这次要花多少），够不够得着则看后面的当前值。
        note: '人情用一次薄一次。'
          + `门槛：向上管理 ≥ ${mgmtGate} 点`
          + (favor > 0 ? `（已经找过 ${favor} 次，这个门槛下不去了）` : '')
          + `　消耗：向上管理 ${CRISIS.mgmtCost} 点`
          // 够不着时这里不报当前值：下面那行锁定提示已经写了"不足 X 点，当前 Y 点"，
          // 同一对数字连着出现两遍，读起来像界面出了错。
          + (mgmtNow >= mgmtGate ? `　当前 ${mgmtNow} 点` : ''),
        // 锁定时追加的一句结论。数字由界面按当下资源算（它会随资源变），
        // 这里只说"这条路到此为止"——那是这条选项自己的语义，界面算不出来。
        lockHint: '人脉这条路已经走不通了。'
      },
      {
        id: 'opt_c',
        text: '硬扛：什么都不做，看他们能查出什么',
        costAp: 0,
        effects: {},
        gamble: {
          odds: CRISIS.toughOdds,
          hit: { risk: CRISIS.toughRiskGain },
          hitText: `反映的问题被坐实了一部分，廉政风险再涨 ${CRISIS.toughRiskGain} 点。`,
          missText: '这次反映没查出实据，风险暂时压在原地。'
        },
        veto: true,
        note: `五成风险 +${CRISIS.toughRiskGain}，五成不变；本次提任必定告吹`
      }
    ]
  }
}
