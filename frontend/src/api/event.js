/**
 * 事件接口层（**运行时已不再调用**）
 *
 * 事件已全面改为本地抽取（见 game/eventPool.js + mock/localEvents.js），
 * 玩家点「推进工作」走的是同步函数，不发请求、没有等待。
 *
 * 本文件保留三样东西，都不是摆设：
 *   stripLocalMeta()   —— 上报前剥掉本地标签。**这是契约的收口处**，见下方说明。
 *   buildPlayerStatus()—— PlayerStatus 的唯一序列化入口。将来补料要接回 AI，
 *                         得从这里走，重写一遍容易漏字段。
 *   generateEvent()    —— 旧的一次请求出一个事件。后端端点也还留着（不调用不花钱），
 *                         两边一起保留，补料时能直接复用。
 *
 * 已经删掉的是**预取/缓存那一整套**（themeSignature / prefetchEvent /
 * takeCachedEvent / clearEventCache，约 115 行）：它的存在理由是「把等 AI 的
 * 十几秒藏进玩家读题的时间」，等待没有了，那套东西只剩下出错的可能——
 * 预取发生在玩家读上一件事的时候，用的是那一刻的状态，题材一旦变了
 * （风险越过 50）存货就跟当前对不上。
 */

import { GAME_VERSION } from '@/constants/gameConfig'
import { PROMOTION_REQUIREMENTS } from '@/constants/promotion'

/**
 * 超时必须**明显宽于后端**（事件后端 40 秒，见 backend/.env）。
 * 同一处故障谁先到点，决定了玩家看到什么：后端先到点会降级成预置事件，
 * 游戏照常走；本层先到点只会中断请求、报一个网络错误。
 * 后端最坏是"超时 × 重试次数"（DEEPSEEK_MAX_RETRIES=1，即 2 次），
 * 所以这里要盖住 2×40 秒，不能只盖住单次。
 */
const REQUEST_TIMEOUT = 90000

/** GameEvent 契约的字段。与 backend/models.py 逐字对齐，多一个都会 422 */
const EVENT_KEYS = ['id', 'title', 'description', 'options']
const OPTION_KEYS = ['id', 'text', 'costAp', 'effects']

/**
 * 剥掉本地标签，只留契约字段。
 *
 * 为什么必须有这一步：本地事件多带了 npcName / unitType / bands / theme 四个字段，
 * 而 backend/models.py 的 _Base 是 `extra="forbid"`——多一个字段，**整个上报请求
 * 会被 Pydantic 判 422 打回来**，而且报的是 PlayerStatus 校验失败，
 * 从错误信息里根本看不出是"事件上多了个标签"。
 *
 * 于是标签留在事件对象上（本地读代码最方便），在上报的出口处一次性剥干净。
 * 出口收口比在入口处到处补字段可靠：将来再加标签，这里不用改。
 */
export function stripLocalMeta(event) {
  if (!event || typeof event !== 'object') return null

  const out = {}
  EVENT_KEYS.forEach((key) => {
    if (event[key] !== undefined) out[key] = event[key]
  })
  out.options = (event.options || []).map((opt) => {
    const slim = {}
    OPTION_KEYS.forEach((key) => {
      if (opt[key] !== undefined) slim[key] = opt[key]
    })
    return slim
  })
  return out
}

/** 组装上报给后端的完整 PlayerStatus（与 backend/models.py 的 PlayerStatus 对齐） */
export function buildPlayerStatus(state) {
  return {
    gameVersion: GAME_VERSION,
    player: { ...state.player },
    resources: { ...state.resources },
    gameStatus: {
      // 必须过 stripLocalMeta：事件对象上的本地标签后端不认识
      currentEvent: stripLocalMeta(state.gameStatus.currentEvent),
      showEventModal: !!state.gameStatus.showEventModal,
      gameOver: !!state.gameStatus.gameOver,
      gameOverReason: state.gameStatus.gameOverReason || '',
      gameOverEnding: state.gameStatus.gameOverEnding || '',
      // 冷却中的事件（id → 冷却结束的绝对季度序号）。提示词据此避重。
      eventCooldown: { ...(state.gameStatus.eventCooldown || {}) }
    },
    promotionRequirements: PROMOTION_REQUIREMENTS
  }
}

/**
 * 轻量契约校验。后端已经校验过一遍，这里再查是为了防止
 * 后端版本不一致、或代理返回了意料之外的东西时把脏数据灌进状态。
 */
export function isUsableEvent(event) {
  if (!event || typeof event !== 'object') return false
  if (!event.id || !event.title || !event.description) return false
  if (!Array.isArray(event.options) || event.options.length === 0) return false

  return event.options.every(
    (opt) =>
      opt &&
      opt.id &&
      opt.text &&
      Number.isFinite(Number(opt.costAp)) &&
      opt.effects &&
      typeof opt.effects === 'object'
  )
}

/**
 * 请求后端生成事件。保留但已无人调用——本地池抽干了也只会重复，不会降级到这里。
 * @returns {{event: Object, source: string, reason: string}}
 */
export async function requestEvent(status) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch('/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status),
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`接口返回 ${response.status}`)
    const payload = await response.json()
    return {
      event: payload && payload.event,
      source: (payload && payload.meta && payload.meta.source) || 'ai',
      reason: (payload && payload.meta && payload.meta.reason) || ''
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 生成事件（旧出口，已无人调用）。
 *
 * 刻意**不再**回退到本地事件池：本地池现在是主路径，由 eventPool.drawEvent() 负责；
 * 从这里再兜一次会让"AI 挂了"的表现变成"事件重复了"，比报错更难查。
 *
 * @returns {{event: Object|null, source: string, reason: string}}
 */
export async function generateEvent(state) {
  try {
    const result = await requestEvent(buildPlayerStatus(state))
    if (isUsableEvent(result.event)) {
      return { event: result.event, source: result.source, reason: result.reason }
    }
    return { event: null, source: 'ai', reason: '后端返回的事件不符合契约' }
  } catch (err) {
    return { event: null, source: 'ai', reason: (err && err.message) || '接口不可用' }
  }
}
