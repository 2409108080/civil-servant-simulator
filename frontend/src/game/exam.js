/**
 * 考公成绩落到档案上的那一小步。
 *
 * 单独成文件而不是塞进 Exam.vue，是因为它改的是**游戏档案**，
 * 与界面无关：换一个界面（或将来做「重考」功能）也该走同一个函数。
 *
 * 单位类型是硬约束：后端分档只可能给出 model.UNIT_TYPES 里的四个值之一，
 * 但前端不能替后端担保，这里挡一道，出现意料之外的值就整条不落库，
 * 免得把脏 unitType 写进存档，让后续每一次 /api/event 都 422。
 */

import { UNIT_TYPES, RESOURCE_LIMITS } from '@/constants/gameConfig'
import { SETTLE_BONUS } from '@/constants/money'

/** 把数值夹进资源区间 */
function clampResource(key, value) {
  const range = RESOURCE_LIMITS[key]
  if (!range) return null
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.min(range[1], Math.max(range[0], Math.round(num)))
}

/**
 * 把录用结果写进游戏状态（就地修改）。
 *
 * @param {Object} state  组件 $data（含 player / resources）
 * @param {Object} result /api/exam/evaluate 返回的 result
 * @returns {{ok: boolean, message: string, applied: Object}}
 */
export function applyExamResult(state, result) {
  if (!result || typeof result !== 'object') {
    return { ok: false, message: '成绩单为空，无法报到。', applied: {} }
  }

  const unitType = result.unitType
  if (!UNIT_TYPES.includes(unitType)) {
    return {
      ok: false,
      message: `后端返回的单位类型「${unitType}」不在合法范围内，已拒绝写入档案。`,
      applied: {}
    }
  }

  // 职级不动：考公只决定去哪个单位、任什么职务，级别仍从乡科级副职起步
  state.player.unitType = unitType
  state.player.unit = result.unit || state.player.unit
  state.player.position = result.position || state.player.position
  // 成绩单的 score 后端不取整（理由见 services/exam.py），
  // 而契约里 player.examScore 是**整数**（models.py 的 PlayerInfo.exam_score: int），
  // 类型不符会让整个请求被 Pydantic 判 422，不是四舍五入的问题。
  //
  // 这里取整只影响档案里这个记录用的数字。**去哪个单位是后端按原始分卡
  // 80/60/40 三条红线定的**，结果早就定好随成绩单一起下发了，
  // 不经过这里，所以不会被这次取整改变。
  //
  // （每题 20 分之后分数只会是 10 的倍数，本来就取不到小数——
  //  这道取整留着是为了"分数带小数"这件事哪天回来时仍然是安全的。）
  state.player.examScore = Math.round(Number(result.score) || 0)

  const applied = {}
  const bonus = result.attributeBonus || {}
  Object.keys(bonus).forEach((key) => {
    if (!(key in state.resources)) return
    const safe = clampResource(key, Number(state.resources[key]) + Number(bonus[key]))
    if (safe === null) return
    applied[key] = safe - state.resources[key]
    state.resources[key] = safe
  })

  // 入职安家费。按去的单位发，核心部门给得最多——那些地方人情往来最密，
  // 一个刚报到的年轻人手里没钱，前期几乎没法处理任何需要打点的事。
  //
  // 用 += 而不是 =：重考或读档后重放这个函数时，不该把已经攒下的家产抹掉。
  // 查不到对应金额（理论上不可能，unitType 上面刚校验过）就发 0，不猜。
  const settle = Number(SETTLE_BONUS[unitType]) || 0
  state.player.money = (Number(state.player.money) || 0) + settle
  // 安家费也算**合法收入**。财产申报算的是"你说不清来路的钱"，
  // 少记这一笔，一个刚报到的年轻人第一次申报就会凭空多出几万块的差额——
  // 那是算错了账，不是反腐。
  state.player.legalIncome = (Number(state.player.legalIncome) || 0) + settle

  return { ok: true, message: '', applied, settle }
}
