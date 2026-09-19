<template>
  <div class="resource-bar">
    <div v-for="item in orderedResources" :key="item.key" class="resource-item">
      <div class="resource-head">
        <span class="resource-label">{{ item.label }}</span>
        <span class="resource-value">
          {{ item.value }}<em v-if="item.isPercent">%</em><small>/{{ item.max }}</small>
        </span>
      </div>
      <div class="resource-track">
        <!-- 用 background 而不是 backgroundColor：政绩那条是渐变，
             只有 background 这个简写同时接得住色值和 linear-gradient()。
             （var() 用在简写里一样有效——带 var() 的声明会走"待替换值"
             这条路，浏览器不做提前解析，跟长写的行为一致。） -->
        <div
          class="resource-fill"
          :style="{ width: item.percent + '%', background: item.color }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script>
import { RESOURCE_LIMITS, RESOURCE_LABELS } from '@/constants/gameConfig'

/**
 * 资源条。
 *
 * 布局说明：精力与健康并排放在最上面，这是**纯渲染层**的排序（见 RENDER_ORDER），
 * 不改动 gameConfig.js 里 resources 的键序——键序属于前后端共享的数据契约，
 * 为展示需求去动它会引入契约漂移的风险。
 */

// 展示顺序：精力/健康置顶，其余按"个人状态 → 组织评价 → 风险"排列
const RENDER_ORDER = [
  'energy',
  'health',
  'ability',
  'authority',
  'mgmt',
  'popularity',
  'kpi',
  'risk'
]

/*
 * 配色总原则：**色相管身份，长度管状态。**
 *
 * 这里换过一次方案，取舍值得写下来，否则下一个人很容易"优化"回去：
 *
 * 旧方案是四档状态色——八条都按 充裕／一般／吃紧／报警 上色，理论上一眼
 * 能看出"哪项不够用"。实际是失败的：中局八条资源的取值大多落在 30～60
 * 那一档，而那一档的颜色是墨色（--ink，接近黑褐）。于是八条条子**全长成
 * 了一个样子**——玩家既分不出哪条是哪条，也读不出任何状态。
 * 四档里最常用的中间档，恰好把另外三档全盖住了。
 *
 * 现在：色相区分身份（八个色相见 theme.css 的 --res-* 令牌），
 * 长度表达状态（条越长越充裕）——这条信息本来就有，不必让颜色再说一遍。
 *
 * 色值定义在 theme.css 而不是这里：跟其余令牌一个来源，
 * 试色时只改一处，不用在 JS 字符串里翻。
 */
const RESOURCE_COLORS = {
  energy: 'var(--res-energy)',
  health: 'var(--res-health)',
  ability: 'var(--res-ability)',
  authority: 'var(--res-authority)',
  mgmt: 'var(--res-mgmt)',
  popularity: 'var(--res-popularity)',
  // 政绩是唯一一条渐变。它的上限是 150（其余都是 100），跨度最长，
  // 渐变能让"条走到哪儿了"比单色更容易读；蓝→紫正好是首尾两条资源的色相，
  // 视觉上跟整排是连着的。
  kpi: 'linear-gradient(90deg, var(--res-energy), var(--res-ability))'
}

// 兜底：将来加资源忘了配色的表现是"一条墨色"，不是"一条透明看不见"
const FALLBACK_COLOR = 'var(--ink-sub)'

/*
 * 廉政风险是唯一保留状态色的：它要回答的是"现在危不危险"，
 * 而危险程度读不出来自它在八条里的相对位置（它跟别人方向还是反的——
 * 别人越高越好，它越低越好）。照搬色相方案会变成"越危险越像政绩"。
 *
 * 阈值按**资源原值**判定，不按进度条百分比。
 * 50 与 80 这两条线跟后端提示词里那两条强制题材线对齐
 * （risk > 50 出纪委题材），玩家看到的颜色和 AI 换题材是同一个信号。
 */
function riskColor(value) {
  if (value >= 80) return 'var(--gov-red)' // 濒临留置
  if (value >= 50) return 'var(--gov-amber)' // 已被注意
  if (value >= 20) return 'var(--ink)' // 有反映
  return 'var(--gov-olive)' // 清白
}

export default {
  name: 'ResourceBar',

  props: {
    resources: {
      type: Object,
      required: true
    }
  },

  computed: {
    orderedResources() {
      const resources = this.resources || {}
      return RENDER_ORDER.filter((key) => key in RESOURCE_LIMITS).map((key) => {
        const [min, max] = RESOURCE_LIMITS[key]
        const value = Number(resources[key]) || 0
        const span = max - min || 1
        const percent = Math.max(0, Math.min(100, ((value - min) / span) * 100))
        return {
          key,
          label: RESOURCE_LABELS[key] || key,
          value,
          max,
          percent,
          isPercent: key === 'risk',
          // 注意传的是 value（原值）而不是 percent
          color: key === 'risk'
            ? riskColor(value)
            : (RESOURCE_COLORS[key] || FALLBACK_COLOR)
        }
      })
    }
  }
}
</script>

<style scoped>
.resource-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px 20px;
}

.resource-item {
  min-width: 0;
}

.resource-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 5px;
}

.resource-label {
  font-size: 13px;
  color: var(--ink-sub);
}

.resource-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.resource-value em {
  font-style: normal;
  font-size: 11px;
  margin-left: 1px;
}

.resource-value small {
  font-size: 11px;
  font-weight: 400;
  color: var(--ink-faint);
  margin-left: 1px;
}

.resource-track {
  height: 6px;
  border-radius: 0;
  /* 暖色槽底。#ebeef5 那种冷灰压在纸卡片上会显脏 */
  background-color: rgba(120, 90, 60, 0.13);
  overflow: hidden;
}

.resource-fill {
  height: 100%;
  border-radius: 0;
  transition: width 0.45s ease, background-color 0.45s ease;
}

/* ───────────────────────── 窄屏（手机） ─────────────────────────
   四列改两列。桌面端四列是因为卡片宽，两列在手机上每格只剩 60 多像素，
   「工作能力」四个字就得折成两行——所以**不是简单地把列数减半就完事**，
   还得保证一行里"标签 + 数值"永远排得下：

   · .resource-value 不参与压缩（flex:none + nowrap），数值是这一格的重点，
     被折行或截断最难读；
   · .resource-label 允许收缩到省略号，标签短，截一点还能认出来。

   两者都 nowrap，所以这一行**只会变瘦，不会换行**——
   换行会让相邻两格的基线错开，八条资源看上去就不齐了。 */
@media (max-width: 768px) {
  .resource-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px 14px;
  }

  .resource-head {
    flex-wrap: nowrap;
    gap: 6px;
  }

  .resource-label {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .resource-value {
    flex: none;
    white-space: nowrap;
  }
}
</style>
