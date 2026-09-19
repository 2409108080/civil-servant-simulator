/**
 * 降低事件库里的风险堆积。
 *
 * ── 为什么要做这件事 ─────────────────────────────────────────
 * 玩家实测反馈"一票否决卡得太死"。查下来根因不在阈值，在**池子的构成**：
 * 107 条生成事件里，正向风险出现 172 次、负向只有 28 次，且正向的量级更大
 * （+18、+16 常见，-8、-10 已是最大）。风险只涨不落，一旦越线就再也回不来。
 * 1.4.0 放宽了 riskMax、加了危机公关与「平衡关系」，那是**给出口**；
 * 这个脚本调的是**入口**——把堆积的速度降下来。两件事都得做，只做一半没用。
 *
 * ── 为什么是脚本而不是手改 ───────────────────────────────────
 * localEvents.generated.js 是 scripts/gen_events.py 的地盘，手改下次生成就没了。
 * 所以这里做成一个**可重放的确定性变换**：跑一次和跑十次结果相同，
 * 重新生成事件库之后再跑一遍即可。它同时也是这次调整的说明书。
 *
 * 同样的系数**必须同步回 gen_events.py**（那里的常量叫 RISK_DAMP），
 * 否则下次生成又冒出一批原始值，而且不会报错——只会悄悄把难度打回去。
 *
 * ── 幂等 ──────────────────────────────────────────────────
 * 这个变换**不是幂等的**：`max(3, round(v × 0.6))` 里 5→3、4→3、3→3，
 * 跑第二遍会把 5 又压成 3，难度再掉一档，而且一声不吭。
 * 所以写回时会在文件头插一行标记，再跑就直接拒绝。
 * 重新生成事件库会连同头部注释一起覆盖掉，标记随之消失——这正是想要的：
 * 新料必须重新降一次。
 *
 * 用法：
 *   node scripts/damp_risk.mjs            # 预演，只报数，不写文件
 *   node scripts/damp_risk.mjs --write    # 真写
 *   node scripts/damp_risk.mjs --force    # 无视标记强行再降（几乎不该用）
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TARGET = join(HERE, '..', 'frontend', 'src', 'mock', 'localEvents.generated.js')
const WRITE = process.argv.includes('--write')
const FORCE = process.argv.includes('--force')

/**
 * 已降过的标记。必须与下面写回时插进文件头的那行**逐字一致**，
 * 否则挡不住第二次运行——而这个脚本最大的风险恰恰就是"跑了第二遍"。
 */
const MARKER = ' * @risk-damped: v1（正向风险已按 ×0.6 下调，勿重复运行 damp_risk.mjs）'

/** 正向风险的缩放系数。见文件头：+15 → +9，+8 → +5，与玩家的诉求一致 */
const RISK_DAMP = 0.6
/** 缩放后的下限。降到 1、2 就等于没有风险，事件也就没有取舍了 */
const RISK_FLOOR = 3
/** 免费选项的自我惩罚线。与 localEvents.js 的 RISK_SELF_PUNISH 一致 */
const RISK_SELF_PUNISH = 8
/** 参与"白嫖"判定的四项晋升门槛。与 constants/promotion.js 的 PROMOTION_GATES 一致 */
const PROMOTION_GATES = ['ability', 'mgmt', 'popularity', 'kpi']

const raw = readFileSync(TARGET, 'utf8')

if (raw.includes(MARKER) && !FORCE) {
  console.log('事件库已降过一次风险（文件头有 @risk-damped 标记），本次不做任何改动。')
  console.log('若确实要再降一档，加 --force；但先想清楚是不是真的想再降。')
  process.exit(0)
}

/**
 * **文本级改写，不是解析再序列化。**
 *
 * 那份文件是 JS 对象字面量（键不带引号），JSON.parse 根本读不了；
 * 就算硬转成 JSON.stringify 再写回去，那 140KB 的每一个键都会从
 * `id:` 变成 `"id":`——一个只为改 172 个数字的脚本，diff 却是整个文件，
 * 以后没人 review 得动，git blame 也全废。
 *
 * 所以只做定点替换：按 `costAp … effects { … }` 切出每个选项，
 * 只在 effects 花括号内动 `risk:` 的数字，其余一个字符都不碰。
 * effects 内部不会再嵌套对象，`[^}]*` 足够。
 */
const OPTION_RE = /costAp:\s*(\d+),?\s*effects:\s*\{([^}]*)\}/g

/** 正向风险缩放后的取值。免费且净加门槛的选项另有下限，见下 */
function damp(value, mustSelfPunish) {
  const scaled = Math.round(value * RISK_DAMP)
  const floor = mustSelfPunish ? RISK_SELF_PUNISH : RISK_FLOOR
  return Math.max(floor, scaled)
}

const changed = []
const before = new Map()
const after = new Map()

const rewritten = raw.replace(OPTION_RE, (whole, costApText, effectsText) => {
  const riskMatch = /risk:\s*(-?\d+)/.exec(effectsText)
  if (!riskMatch) return whole

  const risk = Number(riskMatch[1])
  if (risk <= 0) return whole

  // 免费选项若净加晋升门槛，就必须自己惩罚自己（否则可以无限点击刷分，
  // 见 localEvents.js 的 validatePool）。缩放不能把它压到线下，
  // 否则这个脚本会把一批合法事件改造成刷分漏洞。
  const gain = PROMOTION_GATES.reduce((sum, key) => {
    const m = new RegExp(`${key}:\\s*(-?\\d+)`).exec(effectsText)
    return sum + Math.max(0, m ? Number(m[1]) : 0)
  }, 0)
  const mustSelfPunish = Number(costApText) === 0 && gain > 0

  const next = damp(risk, mustSelfPunish)
  if (next === risk) return whole

  before.set(risk, (before.get(risk) || 0) + 1)
  after.set(next, (after.get(next) || 0) + 1)
  changed.push(`risk ${risk} → ${next}${mustSelfPunish ? '（免费刷分项，保底 8）' : ''}`)

  return whole.replace(/risk:\s*-?\d+/, `risk: ${next}`)
})

const sum = (m) => [...m.entries()].sort((a, b) => b[0] - a[0]).map(([k, v]) => `${k}×${v}`).join('  ')
console.log(`共 ${changed.length} 处正向风险被下调`)
console.log(`  调整前：${sum(before)}`)
console.log(`  调整后：${sum(after)}`)
changed.slice(0, 6).forEach((line) => console.log(`  · ${line}`))
if (changed.length > 6) console.log(`  · …其余 ${changed.length - 6} 处`)

if (!WRITE) {
  console.log('\n预演模式，未写文件。确认无误后加 --write 重跑。')
} else {
  // 标记插在头部注释块**内部**（闭合的 */ 之前），不是插在它后面——
  // 插在后面会多出一个孤零零的 */，整个文件的注释结构就散了。
  // 头部是 gen_events.py 写的，重新生成即覆盖，标记自动失效，不用另做失效逻辑。
  const at = rewritten.indexOf('export default ')
  if (at === -1) throw new Error('没找到 "export default "，不敢插标记，文件未改动')
  const closing = rewritten.lastIndexOf('*/', at)
  if (closing === -1) throw new Error('头部没有注释块收尾，不敢插标记，文件未改动')

  const next = `${rewritten.slice(0, closing)}${MARKER}\n ${rewritten.slice(closing)}`

  writeFileSync(TARGET, next, 'utf8')
  console.log(`\n已写回 ${TARGET}，并留下 @risk-damped 标记（再跑本脚本会被挡下）`)
}
