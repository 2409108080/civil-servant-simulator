/**
 * 遴选 / 借调：换一条仕途流派。
 *
 * ── 解决的是什么问题 ─────────────────────────────────────────
 * 考公分数把玩家分进四个单位类型，而单位类型又决定了事件池抽哪一档料。
 * 于是低分进边缘部门的人，整局都在处理"清水衙门"的事，几乎没有翻身路径——
 * 这不是难度，是**流派固化**：开局考砸一次，后面几十个季度都在还债。
 *
 * 遴选就是那条出口：**用能力与向上管理去换一条新跑道**。
 * 代价是行动力（一季只有 3 点），成功率也是浮动的，所以它不是白送的。
 *
 * ── 为什么成功率是算出来的，不是写死的 ────────────────────────
 * 写死一个 50% 的话，"报名遴选"就变成掷硬币，玩家的能力值毫无意义。
 * 现在它是 `基础 + 工作能力×系数 + 向上管理×系数`，封顶 85%。
 * 按 TRANSFER_TUNING 的系数实算（事件里可以逐条覆盖 base，下面是默认档）：
 *   · 能力 40／向上管理 30 → 57%
 *   · 能力 55／向上管理 45 → 75%
 *   · 能力 65／向上管理 60 → 触顶 85%
 * 也就是说"好好干活"本身就是通往别处的路。封顶留 15% 的失败，
 * 是因为现实里遴选确实有运气的成分，全中就不像话了。
 * 下限 15% 同理：再差的人也不该完全没机会，否则这个事件对他就是纯浪费。
 *
 * 门槛（事件上的 minGates，如 ability ≥ 45）与成功率是**两道作用不同的关**：
 * 门槛管"组织上会不会想到你"，成功率管"想到你了你考不考得上"。
 * 卡在门槛这一关时选项根本不出现，所以玩家不会看到"成功率 57% 但报不了名"
 * 这种自相矛盾的界面。
 *
 * 失败**不额外惩罚**——报名本身就花了行动力，再扣资源等于双重处罚，
 * 而且会让玩家学会"永远不要点这个选项"，那这条出路就白设计了。
 */

import { positionFor } from '@/constants/positions'
import { UNIT_TYPES } from '@/constants/gameConfig'

/** 成功率的上下限与默认系数。事件里可以按单位逐条覆盖 */
export const TRANSFER_TUNING = {
  minOdds: 0.15,
  maxOdds: 0.85,
  base: 0.15,
  perAbility: 0.006,
  perMgmt: 0.006
}

/** 取 transfer 上的一项配置，缺省或非数字则回落到全局默认 */
function pick(transfer, key, fallback) {
  const raw = Number(transfer[key])
  return Number.isFinite(raw) ? raw : fallback
}

/**
 * 算出这次遴选的成功率。
 *
 * 事件可以逐条覆盖任何一项，包括上下限：`minOdds` / `maxOdds` 也在可覆盖之列。
 * 这条口子是为了**纯掷骰**的选项留的——比如「组织上偏偏看中你」那种意外之喜，
 * 系数全写 0、base 写 0.1，本来就是 10%，可默认下限 15% 会把它悄悄抬上去。
 * 上下限是给"算出来的值"兜底的，不该反过来改写作者明写的意图。
 *
 * @param {Object} resources 八项资源
 * @param {Object} transfer  选项上的 transfer 字段
 * @returns {number} 0~1
 */
export function transferOdds(resources = {}, transfer = {}) {
  const odds = pick(transfer, 'base', TRANSFER_TUNING.base)
    + (Number(resources.ability) || 0) * pick(transfer, 'perAbility', TRANSFER_TUNING.perAbility)
    + (Number(resources.mgmt) || 0) * pick(transfer, 'perMgmt', TRANSFER_TUNING.perMgmt)

  const max = pick(transfer, 'maxOdds', TRANSFER_TUNING.maxOdds)
  const min = pick(transfer, 'minOdds', TRANSFER_TUNING.minOdds)
  return Math.min(max, Math.max(min, odds))
}

/**
 * 这次调动的成功率是不是"挣来的"——即是否与工作能力／向上管理有关。
 *
 * 界面靠它决定那句括注怎么写。系数全 0 的纯掷骰选项，若还写着
 * 「由工作能力与向上管理决定」，就是在骗玩家：他会以为自己能力不够，
 * 跑去刷能力值，而那个数字根本不会动。
 */
export function oddsAreEarned(transfer = {}) {
  return pick(transfer, 'perAbility', TRANSFER_TUNING.perAbility) !== 0
    || pick(transfer, 'perMgmt', TRANSFER_TUNING.perMgmt) !== 0
}

/**
 * 判定并执行调动。**就地改档案**，返回明细供界面播报。
 *
 * 单位类型是硬校验：它同时决定事件池抽哪一档料（见 game/eventPool.js），
 * 写进一个池子里没有的值，后果不是报错，而是这个玩家从此只能抽到兜底事件，
 * 而且不报错。宁可当场拒绝。
 *
 * @returns {{ok: boolean, odds: number, note: string, from?: Object, to?: Object}}
 */
export function resolveTransfer(state, transfer) {
  if (!transfer || !UNIT_TYPES.includes(transfer.unitType)) {
    return {
      ok: false,
      odds: 0,
      note: `调动目标「${transfer && transfer.unitType}」不是合法单位类型，本次调动作废。`
    }
  }

  const odds = transferOdds(state.resources, transfer)

  if (Math.random() >= odds) {
    return { ok: false, odds, note: transfer.failText || '这次没能去成，原单位的工作还得接着干。' }
  }

  const from = { unit: state.player.unit, unitType: state.player.unitType }

  state.player.unitType = transfer.unitType
  state.player.unit = transfer.unit || state.player.unit

  // 职务跟着新单位重算。这一步不能省：调过去还挂着原单位的职务
  // （市档案局业务科科长调进市委办），就正是我们要根治的那种错位。
  const position = positionFor(state.player.unit, state.player.unitType, state.player.level)
  if (position) state.player.position = position

  return {
    ok: true,
    odds,
    from,
    to: { unit: state.player.unit, unitType: state.player.unitType, position: state.player.position },
    note: transfer.okText || `调动成功，你被安排到了${state.player.unit}。`
  }
}
