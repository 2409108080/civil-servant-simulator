/**
 * 风声预警：跑路的唯一入口。
 *
 * ── 2.9.0 之前它是工作台上的一个按钮 ─────────────────────────
 * 旧版是"赃款够 500 万、风险够 60 就解锁「卷款跑路」"。那个设计的问题不在数值上，
 * 在**它把跑路做成了一条可以提前规划的退路**：按钮一亮，玩家就会围着它攒钱、
 * 卡着风险线走，跑路从"走投无路时有人递来一张船票"变成了通关流程里的一步。
 * 现在这条路只由一通电话开启，玩家能决定的只有接完电话之后走不走。
 *
 * ── 为什么门槛从 500 万 / 60 降到 300 万 / 40 ────────────────
 * 那条旧门槛是配合按钮设计的：按钮要经得起反复看见，所以得够高。
 * 电话不一样，它一辈子只响一次，出现得越晚越像彩蛋而不是情节。
 * 300 万正是**厅级立案线**——组织上开始认真看你账本的那个数，
 * 风险 40 则对应"已经有人在你背后议论"。两者凑齐，这通电话才有人敢打。
 *
 * ── 两条出路都是终局 ────────────────────────────────────────
 *   · 走：成功率随赃款递增（0.2 起，每多 100 万加 20 个点，封顶 0.8），
 *     铺路先烧掉三成赃款。成功出去是红通，失败在登机口被请下来。
 *   · 不走：装作没听见。下个季度直接立案审查，不再走财产申报——
 *     那头的人替你争来的这点时间，你没有用。
 *
 * 一旦接过这通电话，标记位就把这条线永久关掉（见 eventPool 的 onceFlag），
 * 无论当时选了什么。命运不会给你第二次通风报信的机会。
 */

import { formatMoney } from '@/constants/money'

export const FLEE_EVENT_ID = 'evt_flee_warning'

/** 触发风声所需的累计非法所得（元）：厅级立案线，300 万 */
export const FLEE_ILLICIT_MIN = 3000000
/** 触发风声所需的廉政风险 */
export const FLEE_RISK_MIN = 40
/** 跑路的基础成功率。有钱能使鬼推磨，但鬼也只推得动这么多 */
export const FLEE_ODDS = 0.2
/** 赃款每多 100 万，成功率加多少个点 */
export const FLEE_ODDS_PER_MILLION = 0.2
/** 成功率上限 */
export const FLEE_ODDS_MAX = 0.8
/** 铺路成本占赃款的比例 */
export const FLEE_COST_RATIO = 0.3

/**
 * 跑路的成功率。
 *
 * 赃款越多，路子越硬：0.2 起，每多 100 万加 20 个点，封顶 0.8。
 * 它**不给任何人保底**——哪怕贪到千万，也还留着两成走不掉的余地，
 * 否则这条线走到最后就是一道"钱够了必赢"的算术题。
 *
 * @param {number} illicitWealth 累计非法所得（元）
 */
export function fleeOddsOf(illicitWealth) {
  const over = Math.max(0, (Number(illicitWealth) || 0) - FLEE_ILLICIT_MIN)
  const odds = FLEE_ODDS + (over / 1000000) * FLEE_ODDS_PER_MILLION
  return Math.min(FLEE_ODDS_MAX, odds)
}

/**
 * 铺路成本：赃款的三成。
 *
 * 返回**两笔账**，因为这两笔在极端情况下会对不上：
 *   want  名义成本（赃款的三成）—— 说给玩家听的是这个数；
 *   paid  实际掏得出来的 —— 家产不够时只能掏这些。
 * 引擎按 paid 扣钱、按 paid 冲减赃款账，两边必须是同一个数，
 * 否则"花了多少"与"账上少了多少"会对不上（见 engine.js 的记账传统）。
 *
 * 成本按赃款算而不是按家产算，是因为铺路收的是**这一单的钱**：
 * 中间人不管你现金还剩多少，他要的是他估的那个数。
 *
 * @param {number} illicitWealth 累计非法所得（元）
 * @param {number} cash          手头的家产（元）
 * @returns {{want: number, paid: number}}
 */
export function fleeCostOf(illicitWealth, cash) {
  const want = Math.round((Number(illicitWealth) || 0) * FLEE_COST_RATIO)
  const paid = Math.max(0, Math.min(want, Number(cash) || 0))
  return { want, paid }
}

/**
 * 现在该不该响这通电话。
 *
 * 三条缺一不可：账上有 300 万、风险到了 40、而且**这辈子还没响过**。
 * `fleeWarned` 是事件结算时由引擎置起的一次性标记（onceFlag，见 engine.js），
 * 与函询通知书同一条路子——那种"一辈子只发生一次"的事，不该指望冷却机制兜住。
 */
export function needsFleeWarning(state = {}) {
  const status = state.gameStatus || {}
  if (status.gameOver || status.fleeWarned) return false
  const illicit = Number((state.player || {}).illicitWealth) || 0
  if (illicit < FLEE_ILLICIT_MIN) return false
  return (Number((state.resources || {}).risk) || 0) >= FLEE_RISK_MIN
}

/**
 * 组装风声预警事件。
 *
 * 成功率与铺路成本都在**这里**算好写死：事件对象本身就是按当前状态现攒的
 * （与 investigation.js 的三个狡辩选项同理），没有必要让引擎再去认一个
 * "动态概率"的新字段——静态的 gamble 已经够用，多一个机制就多一处会忘的同步。
 *
 * 走/不走两个选项都不耗行动力：这通电话是凌晨两点打来的，不占你上班的工夫。
 */
export function buildFleeWarningEvent(state = {}) {
  const player = state.player || {}
  const illicit = Number(player.illicitWealth) || 0
  const cash = Number(player.money) || 0
  const odds = fleeOddsOf(illicit)
  const cost = fleeCostOf(illicit, cash)

  // 掏不出名义成本时要说清楚，否则玩家会拿"赃款三成"去对账，
  // 怎么算都对不上（多出来的那部分他以为是系统吞了）。
  const costText = cost.paid < cost.want
    ? `铺路成本 ¥${formatMoney(cost.paid)}（赃款三成本是 ¥${formatMoney(cost.want)}，手头只拿得出这些）`
    : `铺路成本 ¥${formatMoney(cost.paid)}（赃款的三成，不论成不成都不退）`

  return {
    id: FLEE_EVENT_ID,
    title: '一个很久没打来的电话',
    npcName: '老同学',
    unitType: '通用',
    bands: [],
    theme: 'risk',
    // 一辈子只响一次。标记位在引擎结算时置起（见 applyOption 里的 onceFlag），
    // 不是在这里置——事件对象会被反复重建，写在构造函数里等于每次都重置。
    onceFlag: 'fleeWarned',
    description:
      '凌晨两点，一个很久没打来的号码。你接了。'
      + '那头是你多年没联系的老同学，声音压得很低：'
      + '「有人问起你了，问得很细。别说是我打的。你自己看着办。」',
    options: [
      {
        id: 'opt_go',
        text: '走。今晚就走。',
        costAp: 0,
        effects: {},
        // 铺路成本先付，成败都付——引擎按这个标记扣钱、并同步冲减赃款账
        // （见 engine.js 里那段说明）。放在 gamble 之前执行，是因为它不属于"结果"。
        fleeBurn: true,
        gamble: {
          odds,
          hit: {},
          hitText: '车过口岸的时候你没有回头。三天后，你在一间看得见海的房子里醒来。',
          // 成功也是终局：人已经出去了，这一局到此为止
          hitEnding: 'rednotice',
          miss: {},
          missText: '边检在登机口把你请了下来。行李箱还没来得及托运。',
          missEnding: 'caught'
        },
        note: `成功率 ${Math.round(odds * 100)}%`
          + `（赃款每多 100 万加 20 个点，封顶 ${Math.round(FLEE_ODDS_MAX * 100)}%）`
          + `；${costText}`
      },
      {
        id: 'opt_stay',
        text: '不走。装作没听见。',
        costAp: 0,
        effects: {},
        // 只置位，后果在下一个季度的季末结算里兑现（见 engine.js 的 7.5 步）：
        // 当场立案会让"下个季度"这四个字落空，与函询那条线是同一个道理。
        fleeRefusal: true,
        note: '下个季度直接立案审查，不再走财产申报。'
      }
    ]
  }
}
