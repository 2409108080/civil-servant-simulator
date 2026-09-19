<template>
  <el-card class="gov-card player-card" shadow="never">
    <div class="name-row">
      <span class="name">{{ player.name || '（未署名）' }}</span>
      <el-tag size="small" type="info">{{ player.age }} 岁</el-tag>
    </div>

    <div class="rank-row">
      <el-tag size="small" effect="dark">{{ player.level }}</el-tag>
      <span class="position">{{ player.position }}</span>
    </div>

    <div class="unit">
      <span class="unit-name">{{ player.unit }}</span>
      <el-tag v-if="player.unitType" size="mini" type="info">{{ player.unitType }}</el-tag>
    </div>

    <el-divider content-position="left">任期</el-divider>

    <div class="stat-grid">
      <div class="stat">
        <span class="stat-label">当前季度</span>
        <span class="stat-value">{{ player.quarter }}</span>
      </div>
      <div class="stat">
        <span class="stat-label">月薪</span>
        <span class="stat-value">{{ player.salary }} 元</span>
      </div>
    </div>

    <!-- 家产。单独一行而不是塞进上面的两列网格：它跟"当前季度/月薪"不是一类东西，
         那两格是档案上的记述，这一行是**随时会变**的活钱，玩家得盯着它。
         变动时闪一下（进账绿、出账红），否则工资到账、花钱平事这些数字变化
         都悄没声息地发生，玩家不会注意到钱在动。 -->
    <div class="money-row">
      <span class="money-label">家产</span>
      <span class="money-value" :class="moneyFlash">
        <span class="money-unit">¥</span>{{ moneyText }}
      </span>
    </div>

    <!-- 名下资产。与家产分两行而不是挤在一行里：
         钱是抽象的，车房是**看得见的**——而在财产申报这件事上，
         "看得见"才是要命的那部分。挂在本人名下的会当场进申报总数，
         代持的只能赌每年那一次不被翻出来，所以两者必须一眼分得开。 -->
    <div class="asset-row">
      <span class="asset-label">名下资产</span>
      <span class="asset-tags">
        <el-tag
          v-for="asset in assetTags"
          :key="asset.id"
          size="mini"
          :type="asset.proxy ? 'info' : 'warning'"
          class="asset-tag"
        >
          {{ asset.label }}
        </el-tag>
        <span v-if="!assetTags.length" class="asset-empty">无</span>
      </span>
    </div>

    <!-- 行动力：一季多事循环的核心资源，做成圆点更直观 -->
    <div class="ap-row">
      <span class="ap-label">行动力</span>
      <span class="ap-dots">
        <i
          v-for="n in apSlots"
          :key="n"
          class="ap-dot"
          :class="{ 'is-on': n <= player.ap }"
        ></i>
      </span>
      <span class="ap-num">{{ player.ap }}/{{ apSlots }}</span>
    </div>
  </el-card>
</template>

<script>
import { AP_PER_QUARTER } from '@/constants/gameConfig'
import { formatMoney } from '@/constants/money'
import { assetLabelOf } from '@/constants/assets'
import { assetsOf } from '@/game/wealth'

/** 闪烁持续时长。太短看不见，太长会和下一次变动叠在一起（工资到账紧接着花钱） */
const FLASH_MS = 1400

export default {
  name: 'PlayerCard',

  props: {
    player: {
      type: Object,
      required: true
    }
  },

  data() {
    return {
      // 圆点槽位按每季度的行动力上限画，玩家吃药/事件临时加 AP 也够用
      apSlots: Math.max(AP_PER_QUARTER, 5),
      moneyFlash: '',
      flashTimer: null
    }
  },

  computed: {
    moneyText() {
      return formatMoney(this.player.money)
    },

    /**
     * 资产标签。代持的单独标一个字——
     * 只靠颜色区分是不够的（两个 el-tag 的底色差别很淡，
     * 而且色觉障碍的玩家根本分不出来），得有一处文字写明。
     */
    assetTags() {
      return assetsOf({ player: this.player }).map((asset) => ({
        id: asset.id,
        label: assetLabelOf(asset) + (asset.holder === 'proxy' ? '·代持' : ''),
        proxy: asset.holder === 'proxy'
      }))
    }
  },

  watch: {
    /**
     * 家产一变就闪。
     *
     * 用 watch 而不是在每次结算处手动触发：钱的来源会越来越多
     * （工资、安家费、事件、危机公关），每加一处都要记得"顺手把动画调起来"，
     * 迟早会漏。盯着数字本身变没变，是唯一不会漏的做法。
     */
    'player.money'(next, prev) {
      const now = Number(next) || 0
      const before = Number(prev) || 0
      if (now === before) return

      this.moneyFlash = now > before ? 'is-up' : 'is-down'
      clearTimeout(this.flashTimer)
      this.flashTimer = setTimeout(() => {
        this.moneyFlash = ''
      }, FLASH_MS)
    }
  },

  beforeDestroy() {
    // 定时器不清会在组件销毁后回调，对着已销毁的实例写 data（Vue2 会警告）
    clearTimeout(this.flashTimer)
  }
}
</script>

<style scoped>
.player-card >>> .el-card__body {
  padding: 16px 18px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.name {
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
}

.rank-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.position {
  font-size: 14px;
  color: var(--ink-sub);
}

.unit {
  display: flex;
  align-items: center;
  gap: 6px;
}

.unit-name {
  font-size: 13px;
  color: var(--ink-sub);
}

.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat-label {
  font-size: 12px;
  color: var(--ink-sub);
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.money-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 12px;
  padding: 8px 10px;
  border: 1px solid var(--line-warm);
  border-radius: 0;
  background-color: var(--paper-edge);
}

.money-label {
  font-size: 13px;
  color: var(--ink-sub);
}

.money-value {
  font-size: 17px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.money-unit {
  margin-right: 2px;
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-faint);
}

/* 进账绿、出账红。用动画而不是只换一次颜色：颜色换完就停在那儿，
   玩家低头看别处再回头，分不出这是"刚进了一笔"还是"本来就这样"。 */
.money-value.is-up {
  animation: money-up 0.45s ease-out 3;
}

.money-value.is-down {
  animation: money-down 0.45s ease-out 3;
}

@keyframes money-up {
  0%,
  100% {
    color: var(--ink);
  }
  40% {
    color: var(--gov-olive-text);
    transform: scale(1.06);
  }
}

@keyframes money-down {
  0%,
  100% {
    color: var(--ink);
  }
  40% {
    color: var(--gov-red);
    transform: scale(0.96);
  }
}

/* 资产行。不做成家产那样的框，是因为它常常是空的——
   一个空框会一直占着地方，看起来像少填了什么。无资产时就一行淡字。 */
.asset-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
}

.asset-label {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 20px;
  color: var(--ink-sub);
}

.asset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.asset-tag {
  /* el-tag 默认的左右内边距在中文短标签上偏宽，收一点，两枚标签才排得下 */
  padding: 0 5px;
}

.asset-empty {
  font-size: 12px;
  line-height: 20px;
  color: var(--ink-faint);
}

.ap-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line-warm);
}

.ap-label {
  font-size: 13px;
  color: var(--ink-sub);
}

.ap-dots {
  display: flex;
  gap: 5px;
  flex: 1;
}

.ap-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: var(--line-warm);
  transition: background-color 0.25s ease, transform 0.25s ease;
}

/* 行动力点亮用体制红，而不是资源条那套状态色。
   它不是"数值高低的资源"，是"今天还能不能干活"的开关，
   而且紧挨着红色的主按钮，同色才连成一句话。 */
.ap-dot.is-on {
  background-color: var(--gov-red);
  transform: scale(1.08);
}

.ap-num {
  font-size: 12px;
  color: var(--ink-sub);
  font-variant-numeric: tabular-nums;
}
</style>
