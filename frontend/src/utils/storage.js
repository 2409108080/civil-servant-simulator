/**
 * 存档读写（localStorage）
 *
 * 存储结构：
 * {
 *   "game_version": "2.6.0",
 *   "saved_at": "2026-09-17T12:00:00.000Z",
 *   "data": {
 *     "player": {...},
 *     "resources": {...},          // 八项资源
 *     "gameStatus": {              // showEventModal 不入档
 *       "currentEvent": null, "gameOver": false, "gameOverReason": "",
 *       "gameOverEnding": "", "eventCooldown": {}
 *     }
 *   }
 * }
 *
 * 设计要点：
 * 1. 落盘的字段走白名单，不直接 JSON.stringify(this.$data)，
 *    避免把界面态、只读字典一起写进存档，造成存档膨胀与版本污染。
 * 2. 读盘时先合并到初始档案模板上，老存档缺的新字段自动补齐默认值，
 *    同时保证 Vue2 的响应式键在 data() 阶段就已声明。
 * 3. 存档损坏、版本**不兼容**时绝不清空玩家存档，只上报状态，由界面决定是否重开。
 *    什么算不兼容：只有主版本不同才算（见下面 majorOf 的说明）。
 *    次版本之间互相读，靠上面第 2 条那套补齐流程兼容。
 * 4. showEventModal 属纯界面态，不入档；待办事件改由 hasPendingEvent() 亮红点。
 *
 * 自动存档时机（由游戏逻辑调用 saveGame，本文件不主动触发）：
 *   事件结算后 / 季度推进后 / 晋升裁定后
 */

import {
  GAME_VERSION,
  SAVE_KEY,
  RESOURCE_LIMITS,
  createInitialState
} from '@/constants/gameConfig'
import { isPositionConsistent, organFor, positionFor } from '@/constants/positions'

// 读档结果状态码
export const LOAD_STATUS = {
  NEW: 'new',                           // 无存档，已按新人报到初始化
  LOADED: 'loaded',                     // 读档成功
  VERSION_MISMATCH: 'version_mismatch', // 存档版本与本版本不符，需提示重开
  CORRUPTED: 'corrupted'                // 存档无法解析
}

const isPlainObject = (val) =>
  Object.prototype.toString.call(val) === '[object Object]'

/**
 * 版本比较：**只看主版本**。
 *
 * 次版本（1.1.0 这种）不动玩家存档。理由不是"应该没问题"，是这套读写流程
 * 本来就按这个设计：落盘是逐字段白名单（少一个字段不会写坏结构），
 * 读档走 deepMerge 补默认值 + clampResources 收越界值 + repairPosition 修派生字段。
 * 于是"改了数值、加了事件、动了文案"的存档读进来是安全的——
 * 缺的字段补上，越界的值收敛，只是从读档那一刻起按新规则往下走。
 *
 * 主版本不同才清档：那代表契约本身不兼容，硬读会把玩家带进一个规则错位的局里，
 * 而规则错位的局比让他重开更糟——他不会知道自己玩的是哪一版规则。
 *
 * 这条规矩是发行（1.0.0）之后才立的。开发期每动一次数值都清档，
 * 那时清档是免费的（世上只有测试档）；发出去之后它就有价了——
 * 代价是某个玩家正在跑的那一局。带 in-fiction 提示的重开确认，
 * 抵不过"我打了三十年你把我抹了"。
 */
const majorOf = (version) => String(version || '').split('.')[0]

/** 深合并：把 source 覆盖到 target 上；数组与基本类型直接覆盖 */
export function deepMerge(target, source) {
  if (!isPlainObject(source)) return target
  Object.keys(source).forEach((key) => {
    const val = source[key]
    if (val === undefined) return
    if (isPlainObject(val) && isPlainObject(target[key])) {
      deepMerge(target[key], val)
    } else {
      target[key] = val
    }
  })
  return target
}

/** 数值收敛：越界截断、取整。非数字返回 null 表示"无法取值" */
export function clamp(value, min, max) {
  const num = Number(value)
  if (value === null || value === '' || !Number.isFinite(num)) return null
  return Math.min(max, Math.max(min, Math.round(num)))
}

/**
 * 把七项资源收敛回合法区间，防止改档或旧版本数据越界。
 * 脏值（非数字）不做惩罚性归零，回落到 defaults 中的值（即初始档案默认值）。
 * @param {Object} state    待收敛的状态
 * @param {Object} defaults 默认值来源，通常为 createInitialState().resources
 */
export function clampResources(state, defaults) {
  const fallback = defaults || createInitialState().resources
  Object.keys(RESOURCE_LIMITS).forEach((key) => {
    if (!(key in state.resources)) return
    const [min, max] = RESOURCE_LIMITS[key]
    const safe = clamp(state.resources[key], min, max)
    state.resources[key] = safe !== null ? safe : fallback[key]
  })
  return state
}

/**
 * 修正存档里的职务错位。
 *
 * 为什么值得在**读档时**做，而不是"发现错位就判存档作废"：
 * 职务是派生值——由单位类型 + 单位名 + 职级算出来的，本身没有任何独立信息。
 * 玩家正在跑的这一局里，职务是旧规则（职级→职务）写死的，比如
 * 「市档案局」+「乡科级正职」+「镇长」。这种组合在现实里不成立，
 * 但**存档的其余部分完全有效**：职级、资源、季度、事件历史都是真的。
 * 为了一个派生字段逼玩家重开一局，代价和收益完全不成比例。
 *
 * 所以直接按新规则重算覆盖，静默修正。改动只落在 position 与 unit 上，
 * 玩家的实际进度一点不动。
 *
 * 单位为同样要修，因为它是**同一个派生值的一半**：老存档里升到厅局级以上的人
 * 带着"市档案局 + 省档案馆馆长"这种组合，只修职务的话，人物卡上写着馆长、
 * 单位还是档案局——正是这次要根治的那个笑话。它同样不含任何独立信息
 * （单位的名字由流派 + 职级决定，见 positions.js 的 ORGANS）。
 *
 * 顺序：先修单位，再用**修好的单位**去算职务。反过来算的话，
 * 处级那几档的职务模板会把旧单位名拼进去（`市档案局业务科科长`），
 * 刚修好的单位立刻又被绕过去。
 *
 * @returns {string} 被修正前后的描述，空串表示本来就对
 */
export function repairPosition(state) {
  const player = state.player
  if (!player) return ''
  const notes = []

  // ① 单位。只在该级确有配置（organFor 非空）且与现状不符时才动
  const organ = organFor(player.unitType, player.level)
  if (organ && organ !== player.unit) {
    notes.push(`单位已按新规则修正：${player.unit || '（空）'} → ${organ}`)
    player.unit = organ
  }

  // ② 职务。用上面已经修好的单位
  const { unit, unitType, level, position } = player
  if (!isPositionConsistent(unit, unitType, level, position)) {
    const expected = positionFor(unit, unitType, level)
    // 阶梯顶点没有对应职务，保持原样
    if (expected) {
      notes.push(`职务已按新规则修正：${position || '（空）'} → ${expected}`)
      player.position = expected
    }
  }

  return notes.join('；')
}

/**
 * 组装落盘载荷（白名单）。
 * 注意 gameStatus 是逐字段挑的，不是整体塞进去：
 * showEventModal 属于纯界面态，入档会导致刷新页面后弹窗重放、属性被重复扣减。
 */
export function buildSavePayload(state) {
  return {
    game_version: GAME_VERSION,
    saved_at: new Date().toISOString(),
    data: {
      player: state.player,
      resources: state.resources,
      gameStatus: {
        currentEvent: state.gameStatus.currentEvent,
        gameOver: state.gameStatus.gameOver,
        gameOverReason: state.gameStatus.gameOverReason,
        gameOverEnding: state.gameStatus.gameOverEnding,
        // 事件冷却（id → 冷却结束的绝对季度序号）。丢掉它，玩家刷一下页面
        // 冷却就全清零，刚看过的那件事立刻能被抽回来——避重机制等于没有。
        eventCooldown: state.gameStatus.eventCooldown,
        // tenureStartAbs 丢掉，读档后年限会回落到默认值 1，
        // 也就是"从第 1 年第 1 季就在任现职"——等于把最低任职年限整个绕过去，
        // 而且玩家只要刷新一下就能提任。这是白名单里最不能漏的一个。
        tenureStartAbs: state.gameStatus.tenureStartAbs,
        // 这两个是**真实的惩罚与冷却**，不是界面态：promotionVeto 一旦丢掉，
        // 玩家在危机里选了「硬扛」，刷新一下就能把这季的否决洗掉；
        // crisisHandled 丢掉则会让同一季度反复弹危机公关。
        promotionVeto: state.gameStatus.promotionVeto,
        crisisHandled: state.gameStatus.crisisHandled,
        // 这两个是平事成本的**计价依据**，跟着 crisisHandled 一起入档。
        // 丢掉的话，价钱、降压幅度、找人脉的门槛会一起跌回第一次的值：
        // 玩家花掉的钱不会退，但"已经用过几次"被抹平，于是刷一下页面
        // 就能按头一回的价码再平一次事。这跟 balanceThisQuarter 是同一类
        // ——"历史上发生过的事"必须活得比页面久。
        crisisHandledCount: state.gameStatus.crisisHandledCount,
        crisisFavorCount: state.gameStatus.crisisFavorCount,
        // balanceThisQuarter 丢掉，有案底的人可以走一次、刷一下、再走一次——
        // "每季度限一次"直接被刷新键抹平。它和 crisisHandled 是一对：
        // 都记"本季度这件事做过没有"，只是它多一层只对有案底的人生效。
        balanceThisQuarter: state.gameStatus.balanceThisQuarter,
        // auditHoldUntil 是**真实的惩罚**，与上面那几个同类：审查未通过后
        // 一年半内不受理提任。丢掉它，玩家审查没过、刷一下页面就能接着提任——
        // 这道关是专门用来压贪腐流登顶率的，一刷新就绕过去等于没做。
        auditHoldUntil: state.gameStatus.auditHoldUntil,
        // 这两个比上面两个还硬：forcedEnding 丢掉，玩家在决定书上狡辩失败、
        // 看见判词了，刷新一下就能接着玩，整个终局模块等于不存在；
        // investigationPending 丢掉，则决定书永远弹不出来（或被反复弹）。
        forcedEnding: state.gameStatus.forcedEnding,
        investigationPending: state.gameStatus.investigationPending,
        // usedRetreat 丢掉最要命：玩家在决定书上认罪退赃、钱和风险都被清零之后
        // 刷新一下，"这辈子只能退一次赃"就重置了——他可以靠反复刷新无限洗白，
        // 贪腐流整个终局模块形同虚设。
        usedRetreat: state.gameStatus.usedRetreat,
        // 差额公式的合法收入起算点。丢了它，减数从"退赃之后的收入"变成
        // 一辈子的工资总和，差额被整个盖住——退过赃的人一读档就重新安全，
        // 靠反复刷新就能把第二次立案洗掉。这是"退赃限一次"的命门。
        retreatLegalBaseline: state.gameStatus.retreatLegalBaseline,
        // 累计支出是差额恒等式的一端，丢了差额会被系统性低估，
        // 玩家刷新一下就少算一辈子的家用。与 retreatLegalBaseline 同理。
        expenseTotal: state.gameStatus.expenseTotal,
        // 这两个是函询那条线的账。hasInquiryNotice 丢了，一份已经发过的
        // 函询通知书会重新回到抽取池里（它是靠这个标记位退池的，见
        // eventPool.js 的 onceDone）；inquiryEscalated 丢了，在函询上选了
        // 对抗或沉默的人刷新一下，下季度的立案就撤销了——他自己招来的
        // 后果被刷新键抹平，这条支线唯一要传达的东西就没了。
        hasInquiryNotice: state.gameStatus.hasInquiryNotice,
        inquiryEscalated: state.gameStatus.inquiryEscalated,
        // 风声预警那两个（见 game/flee.js）。fleeWarned 丢了，接过电话的人
        // 刷一下页面就能再接到一次——那通电话一辈子只该响一次，它一头连着红通、
        // 一头连着立案，等于拿刷新键重掷终局；fleeRefused 丢了更直接：
        // 在电话里选了"不走"、知道下个季度要立案，刷新一下这件事就没了。
        // 两个都与 hasInquiryNotice / inquiryEscalated 同类。
        fleeWarned: state.gameStatus.fleeWarned,
        fleeRefused: state.gameStatus.fleeRefused,

        // pendingNotice 丢掉，调离那纸通报就永远不会出现在「近期通报」里，
        // 玩家只看到单位名悄悄变了，以为是 bug
        pendingNotice: state.gameStatus.pendingNotice,
        // verdictExcuse 丢掉，从存档重建结局海报时判词会退回默认的"冰箱"那句，
        // 也就是把刚修掉的那个穿帮重新放回来
        verdictExcuse: state.gameStatus.verdictExcuse
      }
    }
  }
}

/**
 * 是否有待办事件。界面据此显示红点提示，而非强制弹窗。
 * @returns {boolean}
 */
export function hasPendingEvent(state) {
  return Boolean(state.gameStatus && state.gameStatus.currentEvent)
}

/**
 * 读档并写入 state（就地修改）。
 * @param {Object} state 组件 data() 返回的响应式对象
 * @returns {{status: string, message: string, savedVersion?: string, savedAt?: string}}
 */
export function loadGame(state) {
  let raw = null
  try {
    raw = window.localStorage.getItem(SAVE_KEY)
  } catch (err) {
    console.error('[存档] 读取失败，浏览器可能禁用了本地存储', err)
    return { status: LOAD_STATUS.NEW, message: '本地存储不可用，本局进度无法保存。' }
  }

  // 无存档：保持初始档案，并立刻写一份，避免玩家开局后刷新丢失
  if (!raw) {
    saveGame(state)
    return { status: LOAD_STATUS.NEW, message: '未检测到存档，已按新录用人员报到。' }
  }

  let saved = null
  try {
    saved = JSON.parse(raw)
  } catch (err) {
    console.error('[存档] 解析失败', err)
    return { status: LOAD_STATUS.CORRUPTED, message: '存档已损坏，无法继续。' }
  }

  // 版本校验：主版本不同才拦。不动玩家原存档，
  // 交由界面弹窗确认后调用 resetGame()
  if (!saved || majorOf(saved.game_version) !== majorOf(GAME_VERSION)) {
    return {
      status: LOAD_STATUS.VERSION_MISMATCH,
      savedVersion: (saved && saved.game_version) || '未知',
      savedAt: (saved && saved.saved_at) || '',
      // 走到这里说明主版本变了，也就是**规则不兼容**——
      // 文案不能写成"旧版本存档"了事，那会让玩家以为是同一个游戏的旧档。
      message: `本局存档为旧版本（${(saved && saved.game_version) || '未知'}），`
        + `当前版本为 ${GAME_VERSION}。两个版本的人事档案格式不兼容，需重新开始。`
    }
  }

  // 合并到初始模板上：老存档缺失的字段自动补默认值。
  // defaults 单独留一份，供脏值回落使用（合并后模板已被覆盖）。
  const defaults = createInitialState()
  const base = createInitialState()
  deepMerge(base, saved.data || {})
  clampResources(base, defaults.resources)

  // 弹窗强制收起：即使 currentEvent 存在也不自动弹出，
  // 由界面读 hasPendingEvent() 亮红点，玩家主动点开，避免刷新重放事件。
  base.gameStatus.showEventModal = false

  // 职务按当前规则重算一遍。老存档里可能留着旧规则写死的职务
  // （市档案局的「镇长」），这是派生值，静默改正即可，不必惊动玩家。
  const positionFix = repairPosition(base)

  Object.keys(base).forEach((key) => {
    state[key] = base[key]
  })

  if (positionFix) {
    // 修正过就得落盘，否则下次读档还要再修一遍
    saveGame(state)
  }

  return {
    status: LOAD_STATUS.LOADED,
    savedAt: saved.saved_at || '',
    hasPendingEvent: hasPendingEvent(base),
    message: '存档已读取。'
  }
}

/**
 * 存档。每次写入都带上 game_version。
 * @returns {boolean} 是否写入成功
 */
export function saveGame(state) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(buildSavePayload(state)))
    return true
  } catch (err) {
    console.error('[存档] 写入失败', err)
    return false
  }
}

/** 清除本地存档（不含确认交互，确认框由界面负责） */
export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY)
    return true
  } catch (err) {
    console.error('[存档] 清除失败', err)
    return false
  }
}

/**
 * 重开：清档 + 就地重置为初始档案。
 * 就地赋值可保留 Vue2 响应式，无需 $forceUpdate。
 */
export function resetGame(state) {
  clearSave()
  const initial = createInitialState()
  Object.keys(initial).forEach((key) => {
    state[key] = initial[key]
  })
  saveGame(state)
  return { status: LOAD_STATUS.NEW, message: '已重新开始。' }
}
