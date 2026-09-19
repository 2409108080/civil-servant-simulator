<template>
  <el-card class="gov-card promotion-panel" shadow="never">
    <div slot="header" class="panel-header">
      <span>提任研判</span>
      <el-tag v-if="nextLevel" size="mini" type="warning">拟任 {{ nextLevel }}</el-tag>
      <el-tag v-else size="mini" type="success">已至顶点</el-tag>
    </div>

    <template v-if="nextLevel">
      <!-- 一票否决：风险超标时置顶告警，玩家一眼看到卡在哪 -->
      <el-alert
        v-if="riskBlocked"
        :title="verdict.reason"
        :type="riskAlertType"
        :closable="false"
        show-icon
        class="risk-alert"
      />

      <!-- 名望分的说明。放在门槛**之前**，因为它是读下面那四个数的前提：
           门槛数字是"资源值 + 名望分"，而资源条上显示的是原始值。
           不解释的话，玩家会看到资源条写着工作能力 72、这里写着 78，
           第一反应是界面算错了。 -->
      <p v-if="authorityBonus > 0" class="authority-note">
        威信 {{ resources.authority }} 折作名望分：以下四项门槛各 +{{ authorityBonus }}（数字已计入）
      </p>

      <!-- 年限不够的说明。**必须排在四条门槛前面**：
           这一档的特点是四条全绿、结论却是"暂不提任"，
           先看到结论再看到四条绿条，比反过来少一次困惑。 -->
      <p v-if="tenurePending" class="tenure-note">{{ tenureNote }}</p>

      <!-- 四项资历门槛 -->
      <div class="gate-list">
        <div v-for="gate in gates" :key="gate.key" class="gate">
          <div class="gate-head">
            <span class="gate-label">{{ gate.label }}</span>
            <span class="gate-num" :class="{ 'is-short': !gate.passed }">
              {{ gate.effective }}<small>/{{ gate.required }}</small>
            </span>
          </div>
          <div class="gate-track">
            <div
              class="gate-fill"
              :class="{ 'is-passed': gate.passed }"
              :style="{ width: gate.percent + '%' }"
            ></div>
            <i class="gate-mark" :style="{ left: gate.markPercent + '%' }"></i>
          </div>
        </div>
      </div>

      <!-- 廉政风险单独一栏，因为它是一票否决项 -->
      <div class="risk-row">
        <div class="gate-head">
          <span class="gate-label">廉政风险 <em>上限 {{ requirement.riskMax }}%</em></span>
          <span class="gate-num" :class="{ 'is-short': riskBlocked }">
            {{ resources.risk }}<small>%</small>
          </span>
        </div>
        <div class="gate-track">
          <div
            class="gate-fill"
            :class="{ 'is-passed': !riskBlocked, 'is-danger': riskBlocked }"
            :style="{ width: riskPercent + '%' }"
          ></div>
          <i class="gate-mark" :style="{ left: requirement.riskMax + '%' }"></i>
        </div>
      </div>

      <!-- 廉政审查：只有身上带着事的人才会看到这一行。
           它必须在四条门槛**都绿了**的时候出现，因为那正是这道关唯一咬人的时刻——
           全绿、结论却是"可上会研究"，而实际季末还要掷一次骰子，
           不说破的话，玩家只会觉得是系统随机吞了他的晋升。
           这里显示的是**通过率**，不是判定结果：面板不掷骰子（见 promotion.js）。 -->
      <p v-if="auditHeld" class="audit-note">
        {{ auditFailNote }}
      </p>
      <p v-else-if="auditPending" class="audit-note">
        身上带着事：提任前先过一道廉政审查，按现在的材料约有
        <strong>{{ auditPercent }}%</strong> 的把握；未通过则材料挂起，一年半内不列入提任考虑。
      </p>

      <div class="verdict" :class="'is-' + verdict.verdict">{{ verdict.reason }}</div>
    </template>

    <div v-else class="verdict is-terminal">{{ verdict.reason }}</div>
  </el-card>
</template>

<script>
import { RESOURCE_LABELS } from '@/constants/gameConfig'
import {
  AUDIT_FAIL_NOTE,
  MIN_TENURE_QUARTERS,
  PROMOTION_GATES,
  PROMOTION_VERDICT,
  auditPassOddsOf,
  evaluatePromotion,
  formatTenure,
  requirementOf
} from '@/constants/promotion'

export default {
  name: 'PromotionPanel',

  props: {
    resources: { type: Object, required: true },
    level: { type: String, required: true },
    /**
     * 任现职已满几个季度。不给就是"未知"，此时不判年限——
     * 面板仍然能正常渲染四项门槛，行为与加年限之前一致。
     */
    tenureQuarters: { type: Number, default: null },
    /**
     * 有没有案底、账上有多少说不清的钱。两个都给默认值，
     * 是为了让面板在没有这两项数据时照常工作——它们只影响那行提示，
     * 不影响任何一项门槛的判定。
     */
    hasIllicitRecord: { type: Boolean, default: false },
    illicitWealth: { type: Number, default: 0 },
    /**
     * 廉政审查还要挂起几个季度。0 表示没在挂起期。
     *
     * 这个值必须由外面传进来，**面板自己算不出来**：挂起期存在 gameStatus
     * 里，而面板只拿得到 resources / level / 这两个廉政字段。
     */
    auditHoldLeft: { type: Number, default: 0 }
  },

  computed: {
    /** 正在挂起期：这时候连骰子都没掷，四项再绿也不受理 */
    auditHeld() {
      return this.auditHoldLeft > 0
    },

    auditFailNote() {
      return AUDIT_FAIL_NOTE
    },

    /**
     * 该不该显示廉政审查那行提示。
     *
     * 条件是"有案底 + 四项与年限全达标"：前面几条还没过的时候提审查是噪音，
     * 玩家连门槛都没够，先告诉他还有一道更难的关，只会让他觉得这局没救了。
     */
    auditPending() {
      return this.hasIllicitRecord
        && this.verdict.verdict === PROMOTION_VERDICT.PROMOTABLE
    },

    auditPercent() {
      return Math.round(auditPassOddsOf(this.illicitWealth) * 100)
    },

    verdict() {
      return evaluatePromotion(this.resources, this.level, this.tenureQuarters)
    },

    nextLevel() {
      return this.verdict.nextLevel
    },

    /** 威信折算出的名望分。0 时整条说明不显示——没有加成还挂一行字是噪音 */
    authorityBonus() {
      return this.verdict.authorityBonus || 0
    },

    requirement() {
      return requirementOf(this.level) || { ability: 0, mgmt: 0, popularity: 0, kpi: 0, riskMax: 100 }
    },

    riskBlocked() {
      return this.verdict.verdict === PROMOTION_VERDICT.RISK_SUSPENDED
        || this.verdict.verdict === PROMOTION_VERDICT.RISK_INTERVIEW
    },

    /**
     * 四项已达标、只差任职年限。
     *
     * 单独拎出来是因为它**读起来跟"资历不够"是反的**：
     * 面板上四条进度条会全是绿的（都达标了），底下却写着"再考察考察"。
     * 不把原因说破，玩家看到的就是"全绿却不给升"——他会以为面板坏了。
     * 所以这一档必须有一行专门的话，而且要指出**还差多久**。
     */
    tenurePending() {
      return this.verdict.verdict === PROMOTION_VERDICT.TENURE_PENDING
    },

    tenureNote() {
      const short = this.verdict.tenureShort || 0
      // 三个数都过 formatTenure。以前是 /4 加 toFixed(1)，会写出"还差 1.0 年"
      // 这种念不出来的数；年限门槛也直接取季度常量，不另留一个"年"版本
      return `任现职 ${formatTenure(this.tenureQuarters)}，满 ${formatTenure(MIN_TENURE_QUARTERS)}才列入提任考虑`
        + `（还差 ${formatTenure(short)}）。`
    },

    riskAlertType() {
      return this.verdict.verdict === PROMOTION_VERDICT.RISK_INTERVIEW ? 'error' : 'warning'
    },

    riskPercent() {
      return Math.max(0, Math.min(100, Number(this.resources.risk) || 0))
    },

    gates() {
      const req = this.requirement
      const bonus = this.authorityBonus
      return PROMOTION_GATES.map((key) => {
        const required = req[key]
        const current = Number(this.resources[key]) || 0
        // 判定用 effective（含名望分），跟 promote/evaluatePromotion 那边同一个口径。
        // 若这里用 current 判、那边用 effective 判，就会出现某个关卡"条是灰的、
        // 组织上却说条件成熟"——这种前后不一致比数字偏高更让人不信任界面。
        const effective = current + bonus
        const passed = effective >= required
        // 进度条按"有效值 / 门槛值"画，门槛刻度线标在满格处
        const percent = required > 0 ? Math.min(100, (effective / required) * 100) : 100
        return {
          key,
          label: RESOURCE_LABELS[key] || key,
          effective,
          required,
          passed,
          percent,
          markPercent: required > 0 ? 100 : 0
        }
      })
    }
  }
}
</script>

<style scoped>
.promotion-panel >>> .el-card__header {
  padding: 12px 16px;
}

.promotion-panel >>> .el-card__body {
  padding: 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.risk-alert {
  margin-bottom: 14px;
}

.gate-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.risk-row {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed var(--line-warm);
}

.gate-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
}

.gate-label {
  font-size: 12px;
  color: var(--ink-sub);
}

.gate-label em {
  font-style: normal;
  color: var(--ink-faint);
}

/* 达标墨绿、未达标赭石。未达标**不用红**——
   够不着提任条件是常态，不是警报，红色要留给真正的告警（廉政风险）。 */
.gate-num {
  font-size: 13px;
  font-weight: 600;
  color: var(--gov-olive-text);
  font-variant-numeric: tabular-nums;
}

.gate-num.is-short {
  color: var(--gov-amber-text);
}

.gate-num small {
  font-size: 11px;
  font-weight: 400;
  color: var(--ink-faint);
}

/* 名望分说明。做得比门槛小一号、用最弱的墨色：
   它是**注解**，不是又一条门槛。做成正文大小会跟下面的四项抢注意力，
   而这行字存在的意义恰恰是"别去看它，去看下面那四个数"。 */
.authority-note {
  margin: 0 0 12px;
  padding: 5px 9px;
  border-left: 2px solid var(--gov-amber);
  background-color: rgba(192, 138, 43, 0.08);
  font-size: 12px;
  line-height: 1.6;
  color: var(--gov-amber-text);
}

/* 年限说明。用赭石而不是红：年限不是警报，是"等着"。
   红要留给廉政风险——同一个面板上两种红，玩家分不出哪个更急。 */
.tenure-note {
  margin: 0 0 12px;
  padding: 5px 9px;
  border-left: 2px solid var(--gov-amber);
  background-color: rgba(192, 138, 43, 0.08);
  font-size: 12px;
  line-height: 1.6;
  color: var(--gov-amber-text);
}

/* 廉政审查提示。与年限提示同一套样式、换一个色：
   两者是同一类东西——"你都够了，但还有一道别的关"，
   在面板上长得一样，玩家才会用同样的方式去读它。 */
.audit-note {
  margin: 12px 0 0;
  padding: 5px 9px;
  border-left: 2px solid var(--gov-danger, #c0392b);
  background-color: rgba(192, 57, 43, 0.07);
  font-size: 12px;
  line-height: 1.6;
  color: var(--gov-danger-text, #a03024);
}

.gate-track {
  position: relative;
  height: 5px;
  border-radius: 0;
  background-color: rgba(120, 90, 60, 0.13);
  overflow: visible;
}

.gate-fill {
  height: 100%;
  border-radius: 0;
  background-color: var(--gov-amber);
  transition: width 0.45s ease, background-color 0.45s ease;
}

.gate-fill.is-passed {
  background-color: var(--gov-olive);
}

.gate-fill.is-danger {
  background-color: var(--gov-red);
}

/* 门槛刻度线，标出"要够到这里才算达标" */
.gate-mark {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 9px;
  border-radius: 0;
  background-color: var(--ink-sub);
}

.verdict {
  margin-top: 14px;
  padding: 9px 11px;
  border-radius: 0;
  font-size: 12px;
  line-height: 1.6;
  background-color: var(--paper-edge);
  color: var(--ink-sub);
}

.verdict.is-promotable {
  background-color: rgba(107, 142, 90, 0.13);
  color: var(--gov-olive-text);
}

.verdict.is-pending,
.verdict.is-tenure_pending {
  background-color: rgba(192, 138, 43, 0.13);
  color: var(--gov-amber-text);
}

.verdict.is-risk_suspended,
.verdict.is-risk_interview {
  background-color: rgba(192, 57, 43, 0.09);
  color: var(--gov-red);
}

.verdict.is-terminal {
  background-color: rgba(107, 142, 90, 0.13);
  color: var(--gov-olive-text);
}
</style>
