<template>
  <el-dialog
    :visible="visible"
    width="620px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
    custom-class="event-dialog"
    @update:visible="$emit('update:visible', $event)"
  >
    <!-- 标题改用 slot：要在同一行右侧挂一个"本地档案"签。
         用了 slot 之后 Element 就不再渲染它默认的 .el-dialog__title，
         标题的样式得自己接上（见 styles/element-override.css 里的 .event-title-text）。 -->
    <div slot="title" class="event-title-bar">
      <span class="event-title-text">{{ event ? event.title : '' }}</span>
      <span class="event-local-tag">本地档案</span>
    </div>

    <template v-if="event">
      <p v-if="event.npcName" class="event-npc">出场：{{ event.npcName }}</p>
      <p class="event-desc">{{ event.description }}</p>

      <div class="option-list">
        <button
          v-for="option in decoratedOptions"
          :key="option.id"
          class="option"
          :class="{ 'is-disabled': option.disabled }"
          :disabled="option.disabled"
          type="button"
          @click="choose(option)"
        >
          <div class="option-main">
            <span class="option-text">{{ option.text }}</span>
            <span class="option-cost" :class="{ 'is-free': option.costAp === 0 }">
              {{ option.costAp === 0 ? '不耗行动力' : `耗 ${option.costAp} 点行动力` }}
            </span>
          </div>
          <div v-if="option.effectChips.length" class="option-effects">
            <span
              v-for="eff in option.effectChips"
              :key="eff.key"
              class="effect"
              :class="eff.harmful ? 'is-bad' : 'is-good'"
            >
              {{ eff.label }} {{ eff.delta > 0 ? '+' : '' }}{{ eff.delta }}
            </span>
          </div>
          <div v-else class="option-effects">
            <span class="effect is-neutral">无直接影响</span>
          </div>
          <!-- 说明签。用来交代静态 effects 表达不了的东西：掷骰的概率、
               人情的代价。中性色——它是"说清楚"，不是"好"或"坏"。 -->
          <div v-if="option.note" class="option-effects">
            <span class="effect is-neutral">{{ option.note }}</span>
          </div>
          <div v-if="option.disabled" class="option-lock">{{ option.lockText }}</div>
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script>
import { RESOURCE_LABELS } from '@/constants/gameConfig'
import { assetQuarterlyRiskOf, assetSpecOf, assetCostOf } from '@/constants/assets'
import { isHarmful } from '@/game/engine'
import { oddsAreEarned, transferOdds } from '@/game/transfer'

/**
 * 结算时要原样交还给引擎的本地字段。
 *
 * 它们都不在契约（EVENT_KEYS / OPTION_KEYS）里，是"这个选项怎么结算"的说明：
 * 引擎不认识它们，就扣不了钱、掷不了骰、置不了否决位。**必须在这里显式转发**，
 * 因为下面 choose() 是手工拼的对象，不是把 option 整个抛出去——
 * 手工拼的好处是界面加工字段（effectChips / lockText）不会漏进引擎，
 * 代价就是每加一个本地字段都得记着往这张表里补一笔。
 */
// 本地标签：这些字段只在这里、和引擎之间流转，出口处会被 stripLocalMeta 剥掉。
// **加了新标记就必须加进这个列表**——choose() 是手工拼对象再 emit 的，
// 漏一个的表现不是报错，是那个选项点下去**静默失效**（如退款标记丢了，
// 玩家点了"退回去"什么也不会发生）。
const LOCAL_OPTION_KEYS = [
  'costMoney', 'gainMoney', 'requires', 'gamble', 'veto', 'transfer',
  'gainIllicit', 'buyAsset', 'surrender', 'inquiryDefiance',
  // 风声预警那两个（见 game/flee.js）。**白名单缺字段不报错**，
  // 只是那条选项什么也不做：漏掉 fleeBurn，"走"就成了一张不花铺路钱的免费票；
  // 漏掉 fleeRefusal，"不走"就真的只是不走，下个季度不会有立案。
  'fleeBurn', 'fleeRefusal'
]

export default {
  name: 'EventModal',

  props: {
    visible: { type: Boolean, default: false },
    event: { type: Object, default: null },
    ap: { type: Number, default: 0 },
    // 家产与资源要传进来，是为了把"钱不够/人脉不够"的选项**在点之前**就置灰。
    // 只在引擎里拦是不够的：点了没反应，玩家的第一反应是界面坏了。
    player: { type: Object, default: null },
    resources: { type: Object, default: null }
  },

  computed: {
    decoratedOptions() {
      const options = (this.event && this.event.options) || []
      return options.map((option) => {
        const costAp = Number(option.costAp) || 0
        const effectChips = Object.keys(option.effects || {}).map((key) => {
          const delta = Number(option.effects[key]) || 0
          return {
            key,
            label: RESOURCE_LABELS[key] || key,
            delta,
            harmful: isHarmful(key, delta)
          }
        })

        // 家产单独补一条签。钱不在那八项资源里（见 gameConfig.js），
        // 不进 effects，但玩家必须看得见这一下花掉多少、进账多少。
        //
        // 置办资产的价钱**从目录算**，事件里没写——两边各写一份迟早对不上，
        // 而且这种错不报错，只表现为"选项写着 50 万、实际扣了 60 万"。
        const costMoney = this.moneyCostOf(option)
        const gainMoney = Number(option.gainMoney) || 0
        if (costMoney > 0) {
          effectChips.push({ key: 'money', label: '家产', delta: -costMoney, harmful: true })
        }
        if (gainMoney > 0) {
          effectChips.push({ key: 'money', label: '家产', delta: gainMoney, harmful: false })
        }
        // 非法所得单列一条，且**标成有害**：它是进账，但进的是纪委的账。
        // 混在"家产 +80万"里绿色一闪而过，玩家会以为那是笔好事。
        const gainIllicit = Number(option.gainIllicit) || 0
        if (gainIllicit > 0) {
          effectChips.push({ key: 'illicitWealth', label: '非法所得', delta: gainIllicit, harmful: true })
        }

        // 置办资产额外挂一条说明：图标 + 代持写法 + 从此每季要还的账。
        // 季度风险才是最容易被忽略的部分——玩家只看见一次性花掉 50 万。
        let assetNote = ''
        if (option.buyAsset) {
          const spec = assetSpecOf(option.buyAsset.kind)
          if (spec) {
            const risk = assetQuarterlyRiskOf(option.buyAsset.kind, option.buyAsset.holder)
            const holder = option.buyAsset.holder === 'proxy' ? '亲友代持' : '本人名下'
            assetNote = `${spec.icon} ${spec.name}（${holder}）：每季末廉政风险 +${risk}`
          }
        }

        // 遴选/借调的选项把成功率**明写出来**。玩家不看到这个数就无从判断
        // "我够不够格报"，只能瞎点。
        // 显示的是当下算出来的值，不是写死的文案——能力涨了它会跟着涨，
        // 这正是"好好干活本身就是出路"要被看见的地方。
        //
        // 括注必须跟着成功率一起变：纯掷骰的选项（系数全 0）如果还写着
        // "由工作能力与向上管理决定"，玩家会以为是自己能力不够，
        // 跑去刷能力值——而那个数字根本不会动。
        let note = option.note || ''
        if (option.transfer) {
          const pct = Math.round(transferOdds(this.resources || {}, option.transfer) * 100)
          const why = oddsAreEarned(option.transfer)
            ? '由工作能力与向上管理决定'
            : '纯凭运气，与能力无关'
          note = `成功率约 ${pct}%（${why}）`
        }
        if (assetNote) {
          note = note ? `${note}　${assetNote}` : assetNote
        }

        return {
          ...option,
          costAp,
          effectChips,
          note,
          lockText: this.lockMessageOf(option, costAp),
          disabled: Boolean(this.shortfall(option, costAp))
        }
      })
    }
  },

  methods: {
    /**
     * 这个选项为什么点不动。够得着就返回空串。
     *
     * 返回文案而不是布尔值，是因为置灰的选项必须说清楚卡在哪一项：
     * 三个选项全灰、又只写着"行动力不足"，玩家会以为界面算错了。
     */
    /**
     * 这个选项要花多少钱。
     *
     * 两个来源相加：costMoney（直接花钱）与 buyAsset 的目录价（置办资产）。
     * 置办资产的价钱**只有目录一处**，事件里不写——这样"置灰的门槛"
     * 与"引擎真扣的钱"永远问的是同一个函数，不会出现一边 50 万一边 60 万。
     */
    moneyCostOf(option) {
      const buy = option && option.buyAsset
      const asset = buy ? assetCostOf(buy.kind, buy.holder) : 0
      return (Number(option && option.costMoney) || 0) + asset
    },

    shortfall(option, costAp) {
      if (this.ap < costAp) return '行动力不足'

      // 钱的来源是 costMoney 本身——它就是门槛，不再另立一个 requires.money，
      // 否则同一个数字要在事件里写两遍，改的时候必漏一处
      if (this.moneyCostOf(option) > this.amountOf('money')) return '家底不够'

      const need = option.requires || {}
      const keys = Object.keys(need)
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i]
        const want = Number(need[key]) || 0
        if (want <= 0) continue
        if (this.amountOf(key) < want) {
          if (key === 'money') return '家底不够'
          // 门槛要连数字一起说。requires 是**门槛**不是**消耗**
          // （扣多少写在 effects 里，两者可以不一样，见 crisis.js 的人脉那条），
          // 只写"向上管理不足"的话，玩家没法判断是自己差一点还是差一大截。
          const label = RESOURCE_LABELS[key] || key
          return `${label}不足 ${want} 点，当前 ${this.amountOf(key)} 点`
        }
      }
      return ''
    },

    /**
     * 锁定的提示语：能算的（差多少）在 shortfall 里，算不出来的结论由事件自己给
     * （option.lockHint，如"人脉这条路已经走不通了"）。
     *
     * lockHint 是**纯展示字段**，与 note 同类：它不进 LOCAL_OPTION_KEYS，
     * 也不要往那个列表里加——加了就等于告诉引擎去结算一句文案。
     */
    lockMessageOf(option, costAp) {
      const reason = this.shortfall(option, costAp)
      if (!reason) return ''
      const hint = option.lockHint || ''
      return hint ? `${reason}。${hint}` : reason
    },

    /** 取某项的当前值。money 住在 player 下，不在 resources 里 */
    amountOf(key) {
      if (key === 'money') return Number(this.player && this.player.money) || 0
      return Number((this.resources || {})[key]) || 0
    },

    choose(option) {
      if (option.disabled) return
      // 原样抛出契约里的 option，不含界面加工字段（effectChips / lockText）
      const payload = {
        id: option.id,
        text: option.text,
        costAp: option.costAp,
        effects: { ...(option.effects || {}) }
      }
      LOCAL_OPTION_KEYS.forEach((key) => {
        if (option[key] !== undefined) payload[key] = option[key]
      })
      this.$emit('choose', payload)
    }
  }
}
</script>

<style scoped>
/* 出场人物。压在正文上方一小行，把"谁在跟你说话"先交代掉，
   正文就可以直接进入处境，不用在句子里塞职务。 */
.event-npc {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: var(--ink-faint);
}

.event-desc {
  margin: 0 0 18px;
  font-size: 14px;
  line-height: 1.85;
  color: var(--ink-sub);
  text-align: justify;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 与考试页的选项同款：纸底 + 暖描边，hover 才变红。
   两处的选项是同一种交互，长得不一样玩家会以为规则也不一样。 */
.option {
  display: block;
  width: 100%;
  padding: 13px 15px;
  border: 1px solid var(--line-warm);
  border-radius: 0;
  background-color: var(--paper-card);
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.option:hover:not(.is-disabled) {
  border-color: var(--gov-red);
  background-color: rgba(192, 57, 43, 0.05);
}

.option.is-disabled {
  background-color: var(--paper-edge);
  cursor: not-allowed;
  opacity: 0.62;
}

/* 选项文字与"耗几点行动力"**上下排，不并排**。
   早先两者左右排、行动力贴右，而「行动力不足」那个签是绝对定位在右上角的——
   两个东西抢同一个角。桌面端靠间距侥幸没被看出来，实测是重叠的
   （两者右边缘差 1px、纵向范围相交）。
   现在文字独占一行，行动力跟在下面，lock 落在最底，三者各占一行，不再争位置。 */
.option-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.option-text {
  font-size: 14px;
  color: var(--ink);
  line-height: 1.6;
}

.option-cost {
  font-size: 12px;
  color: var(--gov-amber-text);
}

.option-cost.is-free {
  color: var(--ink-faint);
}

.option-effects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.effect {
  font-size: 12px;
  padding: 1px 7px;
  border-radius: 0;
  font-variant-numeric: tabular-nums;
}

.effect.is-good {
  background-color: rgba(107, 142, 90, 0.14);
  color: var(--gov-olive-text);
}

.effect.is-bad {
  background-color: rgba(192, 57, 43, 0.1);
  color: var(--gov-red);
}

.effect.is-neutral {
  background-color: var(--paper-edge);
  color: var(--ink-sub);
}

/* 回到文档流。原先绝对定位在右上角，与同样贴右的行动力小字重叠 */
.option-lock {
  margin-top: 6px;
  font-size: 11px;
  color: var(--ink-faint);
}

/* ───────────────────────── 窄屏（手机） ─────────────────────────
   断点 768px。桌面端一行不动。 */
@media (max-width: 768px) {
  /* 触控目标 44px 是底线：这个弹窗**关不掉**，选项又只有手指那么宽，
     点偏一下就是白点。内边距从 13px 提到 14px 起，配合 min-height。 */
  .option {
    min-height: 44px;
    padding: 14px 13px;
  }

  /* 文字与行动力改上下排、lock 回到文档流这三条已经提到基础样式里了
     （桌面端同样有重叠，不是窄屏专属），这里只剩字号与行高的微调。 */
  .option-text {
    font-size: 14px;
    line-height: 1.7;
  }

  .event-desc {
    font-size: 14px;
    line-height: 1.8;
  }

  .option-effects {
    gap: 5px;
    margin-top: 7px;
  }
}
</style>

<!--
  这里原先还有一个非 scoped 的 <style> 块，用来给 .event-dialog 那层皮肤上色
  （弹窗被 Element 挂到 body 下，scoped 的 >>> 够不着它，只能开全局块）。

  现在那层皮肤连同 el-dialog 的基类样式一起收进了 styles/element-override.css。
  留在组件里的话，Element 的样式就会有两个来源：改一个弹窗的底色，
  得先判断它是由组件自己还是由覆写层决定的。组件的样式块只管组件内部。
-->
