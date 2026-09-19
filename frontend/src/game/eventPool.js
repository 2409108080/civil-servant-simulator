/**
 * 本地事件抽取。
 *
 * 设计目标是**毫秒级、绝不失败**：
 *   点「推进工作」→ 同步过滤 → 随机取一 → 返回。没有网络、没有 await、
 *   没有预取缓存、没有超时降级链——那套东西是为了掩盖「要等 AI 十几秒」而存在的，
 *   等待消失了，它们就只剩下出错的可能。
 *
 * 抽取是一串**逐级放宽的条件**（见 buildChain）。这是本文件的核心：
 * 绝不返回 null，因为调用方是弹窗，返回 null 就等于玩家点了按钮没反应。
 * 最坏的情况宁可是「给了个不太贴合的事件」，也不能是「什么都不给」。
 *
 * 纯函数，不碰 state。调用方拿返回值自己去改状态。
 */

import {
  BANDS,
  BAND_OF_LEVEL,
  COMMON,
  LOCAL_EVENTS,
  THEMES,
  validatePool
} from '@/mock/localEvents'
import { assetCostOf, assetSpecOf, illicitCapOf } from '@/constants/assets'
import { assetsOf } from './wealth'
import { absQuarterOf } from './engine'

/**
 * 强制题材的两条阈值。
 *
 * **必须与 backend/prompts.py 的 build_forced_theme 保持一致**（那是同一套规则
 * 的旧实现）。两边不一致的后果不是报错，而是「同一份状态，前端抽的题材和后端
 * 生成的不一样」——真去对比时会以为是模型发挥不稳定，很难想到是阈值抄错了。
 *
 * 注意 risk 用的是 > 而不是 >=：老实现就是 >，且 ResourceBar 里的颜色分档
 * （>= 50 变赭石）是另一回事，那个只管配色。
 */
export const RISK_ALERT = 50
export const HEALTH_ALERT = 30

/** 按当前资源判定本回合的题材。risk 优先于 health，与老实现同序 */
export function forcedTheme(resources = {}) {
  if (Number(resources.risk) > RISK_ALERT) return THEMES.RISK
  if (Number(resources.health) < HEALTH_ALERT) return THEMES.HEALTH
  return THEMES.DAILY
}

/** 档位之间的距离。不在 BANDS 里的（老事件返回 null）算无穷远，永远不命中 */
function bandDistance(a, b) {
  const ia = BANDS.indexOf(a)
  const ib = BANDS.indexOf(b)
  if (ia === -1 || ib === -1) return Infinity
  return Math.abs(ia - ib)
}

/**
 * 事件是否够得上某个职级档。没有 bands 的是 ./events.js 里的老事件，一律不算命中。
 *
 * `slack` 是允许差几档。**必须给放宽的那几档设个上限**，理由是实测出来的：
 * 原先「单位（放宽职级）」那一档完全没有职级条件，只要本单位的料抽干了就接管，
 * 于是一整局跑下来 **47% 的抽取是错档的**，其中大半是 `evt_bureau_s_*`
 * （省部级）和 `evt_bureau_t_*`（厅级）——一个乡科级副职，在反复处理
 * 省部级层面的公文。这正是"档案局的镇长"那个毛病，只是规模大得多。
 *
 * 差一档是"稍显违和"（科级干部上面就是处级，够得着），差三档是荒谬。
 */
function inBand(evt, band, slack = 0) {
  if (!band) return false
  if (!Array.isArray(evt.bands) || !evt.bands.length) return false
  return evt.bands.some((b) => bandDistance(b, band) <= slack)
}

/**
 * 逐级放宽的匹配链，取第一个有命中的。
 *
 * 顺序即优先级，从最贴合到最兜底：
 *   1. 强制题材 + 本职级档   ← 只有 risk/health 会被强制，且它压过单位类型
 *   2. 强制题材，放宽职级     （一个县处级的干部撞上乡镇级别的纪委事件，总好过没有）
 *   3. 本单位／通用 + 本职级
 *   4. 本单位／通用 + 相邻职级
 *   5. 职级（放宽单位）        ← 唯一会抽到别的单位事件的一档
 *   6. 兜底：任意日常、全池（连老 mock 事件一起兜住）
 *
 * 为什么单位排在职级前面：单位决定「这是谁的活儿」，安错了是串味（市委办去拆迁），
 * 职级只决定「事情多大」，差一档顶多是稍显违和。
 *
 * 但"稍显违和"只对**相邻**一档成立，所以从第 4 档起职级一律带 slack。
 * 判据「有货」和「有能抽的」也是两回事：只有当窄档里**还有不在冷却期的**才停在这里，
 * 否则就是同一档里那几件事原地循环播放。
 */
function buildChain(theme, unitType, band) {
  const chain = []
  const daily = (label, extra) => chain.push({ label, match: (e) => e.theme === THEMES.DAILY && extra(e) })
  // 「本单位的事」和「不限单位的事」**同档**。这一条是实测逼出来的：
  // 两者分档时，本单位永远赢（本单位的料整局都抽不完），于是每一条本单位的贪腐事件
  // 都成了该单位的**固定首次金额**——常规局委必是 20 万、基层乡镇必是 30 万、
  // 核心部门必是 60 万，300 局无一例外。梯度里那六档只剩下三档在跑，
  // 而且每个玩家第一次伸手拿多少，开局就定了，跟他怎么玩没关系。
  // 合档之后两者一起进候选池随机取，首次金额才重新变成运气。
  // 串味照样防着：**别的单位**的事件仍然只出现在「职级（放宽单位）」那一档。
  const ownOrCommon = (e) => e.unitType === unitType || e.unitType === COMMON

  if (theme !== THEMES.DAILY) {
    chain.push({ label: `${theme}+职级`, match: (e) => e.theme === theme && inBand(e, band) })
    chain.push({ label: `${theme}（放宽职级）`, match: (e) => e.theme === theme })
  }

  // 单位/职级这几档**不卡题材**，理由是一条实测出来的死档：
  // `daily()` 要求 `e.theme === 'daily'`，于是"题材不是 daily、单位又是具体单位"
  // 的事件，只能靠题材被强制（risk > 50）或者整条链抽干后的「全池兜底」才出得来。
  // 全池兜底实际到不了（池子 136 条，前面几档永远有新鲜的），
  // 结果就是**三条手工种子的贪腐事件 200 局里被抽到 0 次**：
  //   加急的件（20 万，常规局委）／惠农资金的过路费（30 万，基层乡镇）
  //   ／领导的一句家常（60 万，核心部门）
  // 它们偏偏是"第一次就爆"和梯度中间那两档——玩家永远碰不上，
  // 于是收钱机会只剩通用池里那三条，梯度形同虚设。
  //
  // 为什么修链子而不是把这三条的题材改成 daily：题材写 risk 是对的
  // （风险>50 时它们该浮上来），真正错的是"用题材去卡单位档"。
  // 单位档管的是"这是谁的活儿"，题材档管的是"现在该出什么气氛"，
  // 两件事混在一个 match 里，才有这个洞。生成料没暴露它，
  // 只是因为脚本产出的非 daily 事件单位全是「通用」——碰巧绕开了。
  chain.push({ label: '本单位/通用+职级', match: (e) => ownOrCommon(e) && inBand(e, band) })
  chain.push({ label: '本单位/通用+相邻职级', match: (e) => ownOrCommon(e) && inBand(e, band, 1) })
  // 「职级（放宽单位）」是**唯一**会抽到别的单位事件的档，所以它排在本单位之后。
  // 它抽来的是别的单位的事，那才是真的串味（市委办去处理乡镇拆迁）；
  // 通用事件按定义不提具体单位，不会串，所以和本单位同档。
  // 这一档仍然要卡职级：300 万的地块、800 万的干股都是通用事件，
  // 不限职级的话乡科级副职照样收得到，数额梯度就没了。
  chain.push({ label: '职级（放宽单位）', match: (e) => inBand(e, band) })
  daily('任意日常', () => true)
  chain.push({ label: '全池兜底', match: () => true })

  return chain
}

/** 当前行动力下，这个事件是否至少有一个选项点得动 */
function affordable(evt, ap) {
  return (evt.options || []).some((o) => (Number(o.costAp) || 0) <= ap)
}

/**
 * 事件级门槛。`minGates` 形如 `{ ability: 45 }`，一项不达标整条事件就抽不到。
 *
 * 与选项上的 `requires` 不是一回事：`requires` 是"这件事你能做，但本钱不够"，
 * 所以要把选项摆出来、置灰、让玩家知道自己差多少；`minGates` 是"这件事
 * 压根轮不到你"——能力 20 的新人，组织上不会来借调，摆出来只会误导。
 *
 * **必须在抽取前过滤，不能只把选项置灰**：留着它占一个名额，
 * 会让同档位里别的、本该出现的事件被挤掉。
 */
function gatesMet(evt, state) {
  const need = evt.minGates
  if (!need) return true
  const player = state.player || {}
  const resources = state.resources || {}
  return Object.keys(need).every((key) => {
    // money / illicit 要单独认，理由同 engine.unmetRequirement：它们住在 player 下，
    // 不在那八项资源里，统一按 resources[key] 取会永远取到 undefined、
    // 判成 0，于是"家底够 200 万才轮得到你""贪过 50 万才轮得到这一笔"
    // 这两个门槛**永远不成立**——事件不是被拦下，而是永远抽不到，且不报错。
    const have = key === 'money'
      ? Number(player.money) || 0
      : key === 'illicit'
        ? Number(player.illicitWealth) || 0
        : Number(resources[key]) || 0
    return have >= (Number(need[key]) || 0)
  })
}

/**
 * 置办资产类事件的两道闸：**同一件东西买过就不再卖，买不起就不出现**。
 *
 * ── 为什么由 buyAsset 反推，而不是在事件上另挂一个标记 ──────────
 * 「这条事件是卖车的」这件事，事件里已经写了（`options[].buyAsset.kind`）。
 * 另写一个 `sellsKind: 'car'` 就是同一个事实存两份，改一处漏一处，
 * 而漏掉的表现不是报错，是**同一台车又问了他一遍**——真出这种事的时候，
 * 没人会先怀疑"抽取层没跟上"。
 * 由 buyAsset 反推还有一个好处：以后新加的资产事件自动带上这两道闸，
 * 不必记得去补标记（同类事件里漏一条，玩家是看不出来的）。
 *
 * ── 闸一：已经有的不再卖 ────────────────────────────────────
 * 车和房都是"买一次就够"的东西，第二辆不添体面，只添每季度的风险。
 * 代持与否一律算数：`kind` 相同就是同一件东西——本人名下和挂亲戚名下，
 * 对玩家而言都是"我买过车了"，他是不会觉得"这回还能再买一辆"的。
 *
 * ── 闸二：买不起的不出现 ────────────────────────────────────
 * 门槛按**本人名下**的价钱算（车 50 万、房 200 万，见目录）。
 * 够不着本人价就整条不抽：摆出来是两个点不动的选项加一个"算了"，
 * 那不叫选择，那叫拿玩家寻开心。
 * 够得着本人价、够不着代持价（多两成手续费）时事件照出，
 * 代持那条由界面置灰——EventModal 的 moneyCostOf 会给代持算上手续费，
 * 这是现成的，不必在这里再判一次。
 *
 * 它和 minGates 是同一类东西——都是"这件事压根轮不到你"，所以走同一道过滤，
 * 也同样**必须在抽取前**滤掉、且整条链抽干后的兜底那一档不能把它捞回来。
 */
function assetGateMet(evt, state) {
  const kinds = []
  ;(evt.options || []).forEach((opt) => {
    const kind = opt.buyAsset && opt.buyAsset.kind
    // 目录里没有的类别不在这里拦，交给 mock/localEvents 的池子自检去报
    if (kind && assetSpecOf(kind) && kinds.indexOf(kind) < 0) kinds.push(kind)
  })
  if (!kinds.length) return true

  const owned = new Set()
  assetsOf(state).forEach((asset) => {
    if (asset && asset.kind) owned.add(asset.kind)
  })

  const money = Number((state.player || {}).money) || 0
  // 取**最便宜**的那个本人价，而不是最贵的：一条事件若同时摆着车和房，
  // 买得起车就该让他看见，房那条由界面置灰——与上面"代持置灰"同一个道理。
  return kinds.some((kind) => !owned.has(kind) && money >= assetCostOf(kind, 'self'))
}

/**
 * 一次性事件：标记位一旦置起，这条事件**永远**不再进池。
 *
 * 与冷却期管的是两件事，**不能互相替代**：
 *   · 冷却期说的是"这一局别老是同一件事"——过一年可以再来，本来也是常事
 *     （年年都有饭局、年年都有检查）；
 *   · onceFlag 说的是"这件事在剧情上只发生一次"——一份已经交上去的函询说明
 *     不会因为过了一年就重新寄来一份，纪委的函询通知书也不是季度通报。
 *
 * 这类事件在标签上写 `onceFlag: '字段名'`，标记位由引擎在结算时置起
 * （见 engine.js 的 applyOption），入档（见 utils/storage.js），
 * 所以刷新页面也带不走它。
 */
function onceDone(evt, state) {
  if (!evt.onceFlag) return false
  return Boolean((state.gameStatus || {})[evt.onceFlag])
}

/**
 * 冷却期内的 id 集合。
 *
 * eventCooldown 的键是事件 id，值是**冷却结束的绝对季度序号**（见 engine.js
 * 的 applyOption 写入、absQuarterOf 算序号）。判定是 `结束 > 现在`，
 * 也就是事件在第 N 季被处理、第 N+4 季才重新进池——中间隔满 4 个季度。
 *
 * 存结束序号而不是"还剩几季"，理由见 absQuarterOf 的说明：
 * 剩余值每季都要记得减一，漏减一次这条事件就永远回不来了，而且不报错。
 */
function coolingAt(state, absQuarter) {
  const cd = (state.gameStatus && state.gameStatus.eventCooldown) || {}
  const out = new Set()
  Object.keys(cd).forEach((id) => {
    if ((Number(cd[id]) || 0) > absQuarter) out.add(id)
  })
  return out
}

/**
 * 抽一个事件。**同步返回，不抛异常，永不返回 null**（池子非空时）。
 *
 * @param {Object} state 含 player / resources / gameStatus
 * @param {Array}  pool  事件池。留出这个口子是为了能测——冷却与逐级放宽的语义
 *                       要靠「同一档里有好几条」才验得出来，而真实池子在
 *                       生成前后差别极大，拿它当测试夹具等于测不了。
 *                       调用方永远不传。
 * @returns {Object} 裸 GameEvent（含本地标签），可直接交给 EventModal
 */
export function drawEvent(state = {}, pool = LOCAL_EVENTS) {
  const player = state.player || {}
  const status = state.gameStatus || {}

  // 行动力取不到数就当"无限"，宁可给一个贵的事件让界面去置灰，
  // 也不要因为一个 NaN 就把整池都判成"点不动"
  const rawAp = Number(player.ap)
  const ap = Number.isFinite(rawAp) ? rawAp : Infinity

  const absQuarter = absQuarterOf(state)
  const cooling = coolingAt(state, absQuarter)
  // 手头这件还没结算（玩家可能刷新后从红点进来）。没结算就不进冷却，
  // 于是它仍然"可抽"——不排除的话，连点两次「推进工作」会抽到同一件事。
  const pending = status.currentEvent && status.currentEvent.id
  if (pending) cooling.add(pending)

  const theme = forcedTheme(state.resources)
  const chain = buildChain(theme, player.unitType, BAND_OF_LEVEL[player.level] || null)

  // 门槛过滤放在建链之前，`gated` 就是这一回合真正可用的池子。
  // 后面兜底那一步也必须用它——用原始 pool 的话，"行动力不够"的兜底
  // 会把刚被门槛挡掉的事件又捞回来，门槛等于白设。
  // assetGateMet 与 gatesMet 同类（"轮不到你"），所以并排放在这里。
  const gated = pool.filter(
    (e) => gatesMet(e, state) && assetGateMet(e, state)
      && !onceDone(e, state) && !cooling.has(e.id)
  )

  // 从窄到宽，找**第一个还有可用事件的档**。
  //
  // 判据是「这一档里还有没有能抽的」，不是「这一档里有没有货」——两者差很远：
  // 一个科级干部在核心部门只有五条料，按后者，这五条一进冷却就会在**同一档内**
  // 打转（只能反复抽刚出冷却的那一条），玩家看到的就是同样五件事循环播放。
  // 先放宽到更大的一档，把别处的料用上，比在窄档里原地打转要好得多。
  let hit = null
  let candidates = []
  for (const link of chain) {
    const inTier = gated.filter(link.match)
    if (inTier.length) {
      hit = link
      candidates = inTier
      break
    }
  }

  if (!hit) {
    // 整条链能抽的都在冷却期里：这一档料太少，4 个季度比池子转一圈还长。
    // 这时候只放宽**冷却**这一条，门槛与 onceFlag 仍然作数——先出冷却的先来，
    // 而不是把刚抽过的那条立刻再吐出来。
    const usable = pool.filter(
      (e) => gatesMet(e, state) && assetGateMet(e, state) && !onceDone(e, state)
    )
    const seen = new Set()
    chain.forEach((link) => {
      usable.forEach((e) => {
        if (!seen.has(e.id) && link.match(e)) {
          seen.add(e.id)
          candidates.push(e)
        }
      })
    })
    if (!candidates.length) return null // 只有池子为空、或全被 onceFlag 退池时才会走到这里
    const cd = status.eventCooldown || {}
    const soonest = Math.min(...candidates.map((e) => Number(cd[e.id]) || 0))
    candidates = candidates.filter((e) => (Number(cd[e.id]) || 0) === soonest)
  }

  if (process.env.NODE_ENV !== 'production' && hit && hit.label !== '单位+职级') {
    // 降档是正常的（池子还没铺满），但值得留个痕：短时间内大量降档说明
    // 某个单位/职级的料不够，该补的是脚本的 TASKS 配额，不是抽取逻辑
    console.debug(`[事件池] 按「${hit.label}」抽取（题材 ${theme}／${player.unitType}／${player.level}）`)
  }

  let chosen = candidates[Math.floor(Math.random() * candidates.length)]

  // 兜底：保证玩家点得动。池子自检已经拦过一道（见 validatePool），
  // 这里是第二道——因为死局的表现是"弹窗关不掉"，玩家只能刷新，代价太大。
  if (!affordable(chosen, ap)) {
    const ok = gated.filter((e) => affordable(e, ap))
    if (ok.length) {
      chosen = ok[Math.floor(Math.random() * ok.length)]
      console.warn('[事件池] 抽到的事件在当前行动力下无选项可选，已改用可支付的事件')
    }
  }

  return capIllicit(chosen, player.level)
}

/**
 * 按职级给单笔贪腐金额封顶（见 constants/assets.js 的 ILLICIT_CAP_BY_BAND）。
 *
 * ── 为什么兜在抽取出口，而不是改事件里的数字 ──────────────────
 * 事件带着 bands，正常情况下科级抽不到厅级那几条。但抽取链有"放宽职级"
 * 的兜底档（见 buildChain），料薄的单位走到那一档时，一个乡科级副职是
 * **抽得到** 800 万地块干股那条的。抽到就是一步登天：一局里落马年龄
 * 被这种偶发的大额事件拽到 28 出头，整条"越陷越深"的曲线塌掉。
 *
 * 上限写在事件里等于把两件事焊死——"这事本身值多少"和"他现在配不配碰见"。
 * 前者是写作，后者是节奏，改一处就得回头改十条事件。
 *
 * 封顶只动 gainIllicit 一个字段，不动文案：金额在 EventModal 里是按
 * option.gainIllicit 现算现渲染的（见 EventModal.vue 的 effectChips），
 * 所以选项上显示的数与结算进账的数永远一致，不会出现"写着 800 万、到账 10 万"。
 */
function capIllicit(event, level) {
  if (!event || !Array.isArray(event.options)) return event
  const cap = illicitCapOf(level)
  let touched = false
  const options = event.options.map((opt) => {
    const amount = Number(opt.gainIllicit) || 0
    if (amount <= cap) return opt
    touched = true
    return { ...opt, gainIllicit: cap }
  })
  return touched ? { ...event, options } : event
}

// 开发环境自检。生产构建里这段会被 NODE_ENV 判断整块摇掉。
if (process.env.NODE_ENV !== 'production') {
  const problems = validatePool()
  if (problems.length) {
    console.error(`[事件池] 自检未通过，共 ${problems.length} 条问题：\n${problems.join('\n')}`)
  }
}
