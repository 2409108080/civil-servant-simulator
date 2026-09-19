/**
 * 全局提示的统一出口。
 *
 * ── 为什么要有这个文件 ────────────────────────────────────────
 * 原先 18 个提示点各写各的时长：2.6s / 3s / 5s / 6s / 8s 五种刻度，
 * 其中 4 处写的是 `duration: 0`——在 Element 里那不是"很快消失"，
 * 而是**永不消失**。它们又恰好都挂在结局判定和调离上，于是：
 *
 *   落马 → 通知挂在 body 上永不消失（被 z-index:3000 的结算画面盖住，看不见）
 *        → 点重新开始 → 结算画面撤掉 → 那条落马通报还挂在屏幕上
 *
 * 也就是"带着上一局的判决书开局"。resetGame 换的是组件的 $data，
 * 而通知挂在 body 上、不在组件树里，怎么换都碰不到它。
 *
 * 修法不是把那 4 处 `duration: 0` 改掉就完了——只要时长还散在 18 个调用点上，
 * 第 19 个提示迟早会再写出一个 0。把时长、条数上限、清理时机三件事
 * 收到这一个文件里，调用点只负责说"报什么"。
 */

/** 在屏上限。超了就先关最早的那条——第 3 条起玩家的注意力已经不在上面了 */
const MAX_VISIBLE = 2

/** 统一停留时长。4 秒够读完一行通报，又不至于赖着不走 */
const DURATION = 4000

/**
 * 当前还在屏上的实例。
 * 模块级而不是组件 data：Element 把通知挂到 body 下，不受组件树管辖，
 * 组件状态既管不到它们的生死，也留不住它们的引用。
 */
let live = []

function closeInstance(instance) {
  if (instance && typeof instance.close === 'function') instance.close()
}

/** 挤掉超额的，从最早的一条开始 */
function trim() {
  while (live.length > MAX_VISIBLE) closeInstance(live.shift())
}

/**
 * 弹一个提示并登记在册。
 *
 * 关掉时要从 live 里划掉自己，否则数组只增不减：
 * 上限判断会开始关一些**早就关掉**的实例，真正在屏的那几条反倒关不掉。
 * onClose 是 Element 关闭时回调的口子；调用方自己传的那个也要照顾到，包一层。
 */
function open(channel, vm, options) {
  const opts = Object.assign({}, options)
  const userOnClose = opts.onClose

  // 调用方可以覆盖时长（长文案才需要），但不给就一律 4 秒——
  // 不给就 4 秒，是这条兜底把 4 处 `duration: 0` 挡在门外
  if (opts.duration == null) opts.duration = DURATION
  // 所有提示都留关闭按钮。$message 默认是不带的，得显式开
  opts.showClose = true

  let handle = null
  opts.onClose = () => {
    const i = live.indexOf(handle)
    if (i >= 0) live.splice(i, 1)
    if (typeof userOnClose === 'function') userOnClose()
  }

  handle = channel.call(vm, opts)
  if (handle) live.push(handle)
  trim()
  return handle
}

/** 右上角的通报。《季度通报》《个人有关事项报告》这类成篇的走它 */
export function notice(vm, options) {
  return open(vm.$notify, vm, options)
}

/** 屏幕顶部一闪而过的一句话反馈。「已存档。」这类走它 */
export function toast(vm, options) {
  return open(vm.$message, vm, options)
}

/**
 * 清空所有还在屏上的提示。
 *
 * **重开一局必须调用**：通知的寿命比组件长，不清就会跨局残留。
 * 由 mixin 的 resetGame 兜底调用，调用方不必自己记着。
 */
export function dismissAll() {
  live.forEach(closeInstance)
  live = []
}

/** 测试用：看当前在册几条 */
export function liveCount() {
  return live.length
}
