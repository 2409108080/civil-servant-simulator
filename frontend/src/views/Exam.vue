<template>
  <div class="exam-page gov-paper-bg">
    <!-- 发卷。题库固化在后端，这是毫秒级的一次往返，这一屏基本看不见。
         留着不是为了遮盖等待（等待已经没有了），而是后端没起时有个明确的落点，
         否则玩家看到的是一片白屏，不知道是自己点错了还是程序坏了。 -->
    <el-card v-if="phase === 'loading'" class="gov-card gov-card--primary center-card" shadow="never">
      <p class="center-text">正在发卷……</p>
    </el-card>

    <!-- 开考失败。本地题库在后端，读到不题库只有一种可能：后端没起来 -->
    <el-card v-else-if="phase === 'error'" class="gov-card gov-card--primary center-card" shadow="never">
      <p class="center-text error">{{ errorMessage }}</p>
      <p class="center-hint">
        试卷与题库都在后端，请确认后端已启动（<code>uvicorn main:app --reload</code>）后重试。
      </p>
      <el-button class="gov-btn" @click="loadPaper">重新开考</el-button>
    </el-card>

    <!-- 答题：一次一题 -->
    <el-card v-else-if="phase === 'exam'" class="gov-card gov-card--primary paper-card" shadow="never">
      <div class="paper-head">
        <span class="paper-title">录用考试</span>
        <span class="paper-count">{{ index + 1 }} / {{ questions.length }}</span>
      </div>

      <el-progress
        :percentage="progress"
        :show-text="false"
        :stroke-width="6"
        color="var(--gov-red)"
        class="paper-progress"
      />

      <div class="stem">
        <el-tag size="mini" type="info" class="stem-tag">{{ current.typeLabel }}</el-tag>
        <span class="stem-text">{{ current.stem }}</span>
      </div>

      <ul class="options">
        <li
          v-for="opt in current.options"
          :key="opt.id"
          class="option"
          :class="{ 'is-picked': picked === opt.id }"
          @click="onPick(opt)"
        >
          <span class="option-key">{{ optionKey(opt.id) }}</span>
          <span class="option-text">{{ opt.text }}</span>
        </li>
      </ul>

      <p class="paper-foot">点击选项即作答，不可回退修改。</p>
    </el-card>

    <!-- 阅卷中。判档查的是题库里写好的答案键，同样是毫秒级 -->
    <el-card v-else-if="phase === 'submitting'" class="gov-card gov-card--primary center-card" shadow="never">
      <p class="center-text">正在阅卷……</p>
    </el-card>

    <!-- 录用通知单 -->
    <div v-else-if="phase === 'result'" class="result-wrap">
      <!-- 整张纸就是一张公文。样式全部来自全局的 gov-card--primary：
           米黄纸底、无圆角、无阴影、体制红顶边——这里不重写任何一条，
           同一属性两处定义，改的时候必漏一处（见本页 style 顶部的说明）。 -->
      <el-card class="gov-card gov-card--primary notice-card" shadow="never">
          <h2 class="notice-title">干部录用通知</h2>

          <!-- 核心三行：中了没、分到哪、组织上怎么看。玩家第一眼要的就是这三样，
               所以它们占通知单的整个中段，其余一切（分项、评语、逐题）都收在下面。 -->
          <div class="notice-score">
            <span class="notice-score-label">综合成绩</span>
            <span class="notice-score-num">{{ scoreText }}</span>
            <span class="notice-score-unit">分</span>
            <span class="notice-score-max">满分 {{ result.maxScore }}</span>
          </div>

          <div class="notice-assign">
            <span class="unit-tag">{{ result.unitType }}</span>
            <span class="notice-unit">{{ result.unit }}</span>
            <span class="notice-position">拟任职务：{{ result.position }}</span>
          </div>

          <p class="notice-comment">{{ result.comment }}</p>

          <div class="notice-foot">
            <div v-if="bonusList.length" class="notice-bonus">
              <span class="bonus-title">初始加成</span>
              <el-tag
                v-for="b in bonusList"
                :key="b.key"
                size="mini"
                class="bonus-tag"
              >{{ b.label }} {{ signed(b.value) }}</el-tag>
            </div>
            <p class="notice-call">请于收到本通知后，前往 {{ result.unit }} 报到。</p>
            <el-button class="gov-btn" @click="onReport">去报到</el-button>
          </div>
        </el-card>

      <!-- ── 详细阅卷意见：默认收起 ──
           通知单本身要一屏放得下，所以分项得分、阅卷人评语、逐题回顾
           全部移到这后面。它们都没被删掉，只是默认不占玩家的第一眼。 -->
      <div class="detail-toggle">
        <el-button class="gov-btn gov-btn--ghost" @click="detailOpen = !detailOpen">
          {{ detailOpen
            ? '收起详细阅卷意见'
            : `查看详细阅卷意见（${result.review.length} 道题）` }}
        </el-button>
      </div>

      <div v-if="detailOpen" class="detail-wrap">
        <el-card class="gov-card result-card" shadow="never">
          <div slot="header" class="panel-header">
            分项得分
            <span class="panel-sub">
              基础 {{ result.baseScore }}<template v-if="result.bonus > 0">
                ＋伯乐加分 {{ result.bonus }}</template>
            </span>
          </div>
          <div v-for="item in result.breakdown" :key="item.typeLabel" class="break-row">
            <span class="break-label">{{ item.typeLabel }}</span>
            <el-progress
              :percentage="percentOf(item)"
              :show-text="false"
              :stroke-width="10"
              :color="breakColor"
              class="break-bar"
            />
            <span class="break-num">{{ item.earned }} / {{ item.fullScore }}</span>
          </div>
        </el-card>

        <el-card v-if="result.aiComment" class="gov-card result-card" shadow="never">
          <div slot="header" class="panel-header">阅卷人评语</div>
          <p class="ai-comment">{{ result.aiComment }}</p>
        </el-card>

        <el-card class="gov-card result-card" shadow="never">
          <div slot="header" class="panel-header">
            逐题回顾
            <span class="panel-sub">
              五道题全部列出，未得满分的已展开（{{ fullCount }} 题满分）
            </span>
          </div>
          <el-collapse v-model="opened">
            <el-collapse-item
              v-for="item in result.review"
              :key="item.questionId"
              :name="item.questionId"
            >
              <div slot="title" class="review-title">
                <el-tag size="mini" :type="gradeTone(item.grade)">{{ item.gradeLabel }}</el-tag>
                <span class="review-stem">第 {{ item.index }} 题 · {{ item.stem }}</span>
              </div>
              <div class="review-body">
                <p class="review-line">
                  <span class="review-key">你的选择</span>
                  <span :class="{ 'is-wrong': item.grade !== 'full' }">
                    {{ optionKeyOf(item.yourChoice) }}. {{ item.yourChoiceText }}
                  </span>
                </p>
                <p v-if="item.grade !== 'full'" class="review-line">
                  <span class="review-key">完美选项</span>
                  <span class="is-right">
                    {{ optionKeyOf(item.bestChoice) }}. {{ item.bestChoiceText }}
                  </span>
                </p>
                <p v-if="item.comment" class="review-comment">{{ item.comment }}</p>
                <p v-if="item.rationale" class="review-rationale">解析：{{ item.rationale }}</p>
              </div>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </div>
    </div>
  </div>
</template>

<script>
import gameState from '@/mixins/gameState'
import { fetchExamQuestions, submitExam } from '@/api/exam'
import { applyExamResult } from '@/game/exam'
import { RESOURCE_LABELS } from '@/constants/gameConfig'
import { formatMoney } from '@/constants/money'
import { toast } from '@/utils/notice'

// 题型中文名的展示兜底。正常情况用后端返回的 typeLabel，
// 这里只在后端漏字段时保证界面不出现 undefined。
const TYPE_LABELS = { logic: '行测逻辑', eq: '职场情商', field: '基层对策' }

export default {
  name: 'Exam',

  mixins: [gameState],

  data() {
    return {
      phase: 'loading', // loading | error | exam | submitting | result
      questions: [],
      answers: {},
      index: 0,
      picked: '',
      locked: false, // 防止连点跳题
      errorMessage: '',
      result: null,
      opened: [], // 逐题回顾里已展开的题号，默认展开放错的那几题
      // 详细阅卷意见（分项得分 / 阅卷人评语 / 逐题回顾）是否展开。
      // **默认 false**：通知单要一屏放得下，这些内容不能占玩家的第一眼。
      detailOpen: false
    }
  },

  computed: {
    current() {
      const q = this.questions[this.index] || {}
      return {
        ...q,
        typeLabel: TYPE_LABELS[q.type] || '试题'
      }
    },

    progress() {
      if (!this.questions.length) return 0
      return Math.round((this.index / this.questions.length) * 100)
    },

    /**
     * 成绩显示。后端不再取整，原始分带小数下发；
     * 整数就写整数、带小数才补一位（85 / 84.5），不写"85.0"这种多余的零。
     * 关键是**不在这里做任何舍入**——舍入会让 84.5 看上去像 85，
     * 而它去的确实是 60 分档的单位，显示和实际对不上就成了"骗人"。
     */
    scoreText() {
      // 先判 result 再判值：直接写 Number(this.result && this.result.score) 的话，
      // result 为 null 时 Number(null) 是 0，会稳稳当当地显示出"0 分"。
      if (!this.result) return '—'
      const value = Number(this.result.score)
      if (!Number.isFinite(value)) return '—'
      return Number.isInteger(value) ? String(value) : value.toFixed(1)
    },

    /** 得满分的题数，用于成绩单上的一句话小结 */
    fullCount() {
      const review = (this.result && this.result.review) || []
      return review.filter((item) => item.grade === 'full').length
    },

    /** 初始加成的展示列表 */
    bonusList() {
      const bonus = (this.result && this.result.attributeBonus) || {}
      return Object.keys(bonus).map((key) => ({
        key,
        label: RESOURCE_LABELS[key] || key,
        value: bonus[key]
      }))
    }
  },

  created() {
    this.loadPaper()
  },

  methods: {
    async loadPaper() {
      this.phase = 'loading'
      this.errorMessage = ''
      try {
        const { questions } = await fetchExamQuestions(this.player.name)
        if (!questions.length) {
          throw new Error('后端未返回任何题目')
        }
        this.questions = questions
        this.answers = {}
        this.index = 0
        this.picked = ''
        // 重考一次要把上一次展开的阅卷意见收回，否则新成绩单出来时
        // 详细面板是开着的，"默认收起"就只对第一次考试生效了
        this.detailOpen = false
        this.phase = 'exam'
      } catch (err) {
        this.errorMessage = `开考失败：${(err && err.message) || '未知错误'}`
        this.phase = 'error'
      }
    },

    optionKey(id) {
      return this.optionKeyOf(id)
    },

    /** opt_a -> A */
    optionKeyOf(id) {
      const idx = ['opt_a', 'opt_b', 'opt_c', 'opt_d'].indexOf(id)
      return idx >= 0 ? String.fromCharCode(65 + idx) : '?'
    },

    onPick(option) {
      if (this.locked) return
      this.locked = true
      this.picked = option.id
      this.answers[this.current.id] = option.id

      // 让选中态闪一下再翻页，否则玩家会怀疑自己点没点中。
      // locked 同时挡住连点——连点两下会直接跳过一题。
      setTimeout(() => {
        this.picked = ''
        this.locked = false
        if (this.index + 1 < this.questions.length) {
          this.index += 1
        } else {
          this.onSubmit()
        }
      }, 160)
    },

    async onSubmit() {
      this.phase = 'submitting'
      try {
        const { result } = await submitExam(this.questions, this.answers, this.player.name)
        if (!result) {
          throw new Error('后端未返回成绩单')
        }
        this.result = result
        // 默认展开没拿满分的题——玩家最想看的就是这几题为什么扣分
        this.opened = (result.review || [])
          .filter((item) => item.grade !== 'full')
          .map((item) => item.questionId)
        this.phase = 'result'
      } catch (err) {
        this.errorMessage = `阅卷失败：${(err && err.message) || '未知错误'}`
        this.phase = 'error'
      }
    },

    /** 去报到：把录用结果写进档案，再跳主界面 */
    onReport() {
      const { ok, message, applied, settle } = applyExamResult(this.$data, this.result)
      if (!ok) {
        toast(this, { type: 'error', message })
        return
      }

      this.saveGame()

      const gains = Object.keys(applied)
        .map((key) => `${RESOURCE_LABELS[key] || key} ${this.signed(applied[key])}`)
        .join('　')
      // 安家费要说出来。不说的话，玩家进主界面看到"家产 ¥50,000"会以为
      // 是默认值，后面花钱平事时也就没有"这是报到那天拿到的"这层感受。
      const settleTip = settle > 0 ? `　入职安家费 ¥${formatMoney(settle)}` : ''
      toast(this, {
        type: 'success',
        message: gains
          ? `已报到：${this.result.unit}　${gains}${settleTip}`
          : `已报到：${this.result.unit}${settleTip}`
      })
      this.$router.push('/dashboard')
    },

    /** 加成带符号显示。边缘部门的「廉政风险 -10」不能渲染成「+-10」 */
    signed(value) {
      const num = Number(value) || 0
      return num >= 0 ? `+${num}` : `${num}`
    },

    percentOf(item) {
      if (!item.fullScore) return 0
      return Math.round((item.earned / item.fullScore) * 100)
    },

    /**
     * 分项得分条的颜色。
     *
     * 这里刻意不用统一的体制红：三条都是红的，玩家一眼看不出哪项拖了后腿，
     * 等于把颜色浪费了。改成按得分率分三档，且全部取低饱和暖色，
     * 不与纸底打架。数字本来就在右边写着，颜色只是帮玩家扫一眼。
     *
     * 返回的是 CSS 变量而不是色值：el-progress 是把返回值直接赋给
     * style.backgroundColor 的（见 element-ui/packages/progress/src/progress.vue:110），
     * 不做任何解析，所以变量能正常生效。色值只在 theme.css 里定义一次。
     */
    breakColor(percentage) {
      if (percentage >= 80) return 'var(--gov-olive)' // 墨绿
      if (percentage >= 50) return 'var(--gov-amber)' // 赭石
      return 'var(--gov-red)' // 体制红
    },

    gradeTone(grade) {
      if (grade === 'full') return 'success'
      if (grade === 'half') return 'warning'
      return 'danger'
    }
  }
}
</script>

<style scoped>
/* 色值来自 styles/theme.css，组件形态来自 styles/element-override.css。
   这里只管本页的排版，外加**本页专属**的几处微调（成绩单里的分隔线与
   折叠面板比全局基类更淡一些）。凡是全局覆写层已经定过的（标签配色、
   进度条槽底），这里不再重复——同一个属性两处定义，改的时候必漏一处。 */

.exam-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 18px 48px;
  box-sizing: border-box;
}

.center-card {
  width: 460px;
  text-align: center;
}

.center-card >>> .el-card__body {
  padding: 40px 32px;
}

.center-text {
  margin: 0 0 6px;
  font-size: 15px;
  color: var(--ink-title);
}

/* 报错也用体制红：公文里"此件不予受理"就是红字，比另起一个错误色更贴 */
.center-text.error {
  color: var(--gov-red);
}

.center-hint {
  margin: 0 0 20px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-sub);
}

.center-hint code {
  padding: 1px 5px;
  background-color: var(--paper);
  border: 1px solid var(--line-warm);
  border-radius: 0;
  font-size: 12px;
  color: var(--ink-title);
}

.paper-card {
  width: 620px;
}

.paper-card >>> .el-card__body {
  padding: 24px 28px 20px;
}

.paper-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.paper-title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--gov-red);
}

.paper-count {
  font-size: 13px;
  color: var(--ink-sub);
  font-variant-numeric: tabular-nums;
}

/* 进度条的槽底（暖灰）与高度（8px）由 element-override.css 统一给，
   本页只管外边距——同一个值两处写，将来改一处就会对不上。 */
.paper-progress {
  margin: 12px 0 22px;
}

.stem {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 20px;
}

.stem-tag {
  flex: none;
  margin-top: 2px;
}

.stem-text {
  font-size: 15px;
  line-height: 1.9;
  color: var(--ink);
}

.options {
  margin: 0;
  padding: 0;
  list-style: none;
}

.option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 15px;
  margin-bottom: 10px;
  border: 1px solid var(--line-warm);
  border-radius: 0;
  background-color: var(--paper-card);
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease;
}

.option:hover {
  border-color: var(--gov-red);
  background-color: rgba(192, 57, 43, 0.04);
}

.option.is-picked {
  border-color: var(--gov-red);
  background-color: rgba(192, 57, 43, 0.08);
}

.option-key {
  flex: none;
  width: 22px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  border-radius: 50%;
  background-color: var(--paper);
  border: 1px solid var(--line-warm);
  font-size: 12px;
  color: var(--ink-sub);
}

.option.is-picked .option-key {
  background-color: var(--gov-red);
  border-color: var(--gov-red);
  color: var(--on-red);
}

.option-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink);
}

.paper-foot {
  margin: 16px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--ink-faint);
}

/* ───────────────────────── 录用通知单 ─────────────────────────
   这张卡是"公文"，不是"成绩单"：字号靠公文的比例（标题大、正文小、
   落款居中），不用色块和图标去强调什么。视觉规则（纸色、红框、无圆角、
   无阴影、宋体）全部来自全局层，这里只排位置。 */

.result-wrap {
  width: 680px;
}

/* 卡片本身。尺寸按"手机上不滚动"倒着算：
   标题 + 分数 + 单位职务 + 评语 + 加成 + 落款 ≈ 400px，
   加页边距仍在一屏内，所以各处间距都取得比原来的成绩单紧一档。 */
.notice-card >>> .el-card__body {
  padding: 22px 30px 20px;
}

/* 公文标题：宋体、字距拉开、居中。下面那道红细线是"红头"与正文的分界 */
.notice-title {
  margin: 0 0 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--gov-red-faint);
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 6px;
  text-align: center;
  color: var(--gov-red);
}

/* ── 中段：分数 ── */
.notice-score {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
}

.notice-score-label {
  font-size: 14px;
  letter-spacing: 2px;
  color: var(--ink-title);
}

/* 分数是整页最大的字，也是唯一的纯红大字——玩家第一眼要看到的就是它 */
.notice-score-num {
  font-size: 46px;
  font-weight: 700;
  line-height: 1;
  color: var(--gov-red);
  font-variant-numeric: tabular-nums;
}

.notice-score-unit {
  font-size: 16px;
  color: var(--gov-red);
}

.notice-score-max {
  margin-left: 4px;
  font-size: 12px;
  color: var(--ink-faint);
}

/* ── 中段：分到哪了 ── */
.notice-assign {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

/* 录用单位用体制红实底——公文里落款盖章的位置，这一抹红要压得住 */
.unit-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 0;
  background-color: var(--gov-red);
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--on-red);
}

.notice-unit {
  font-size: 18px;
  font-weight: 600;
  color: var(--ink);
}

.notice-position {
  font-size: 13px;
  color: var(--ink-sub);
}

/* 评语：一句话，居中、行距放开。它是这张通知单的"人味"所在，
   所以给它整段留白，不跟上下挤在一起 */
.notice-comment {
  margin: 14px 0 0;
  padding: 10px 14px;
  border-left: 3px solid var(--gov-red-line);
  background-color: rgba(192, 57, 43, 0.04);
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink);
}

/* 初始加成落在"底部"这一组里（与落款、按钮同组），
   因为它是"报到之后你会带着什么上路"，属于通知的执行部分，不是正文。
   与落款之间留一道 2px 的浅红短线，读起来像表格里另起的一栏。 */
.notice-bonus {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 2px solid var(--gov-red-faint);
  text-align: center;
}

.bonus-title {
  margin-right: 8px;
  font-size: 13px;
  color: var(--ink-sub);
}

.bonus-tag {
  margin-right: 6px;
}

/* ── 底部：落款 + 报到 ──
   虚线分隔，模仿公文正文与落款之间的那道线 */
.notice-foot {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line-warm);
  text-align: center;
}

.notice-call {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-title);
}

/* ── 详细阅卷意见（默认收起） ── */
.detail-toggle {
  margin-bottom: 18px;
  text-align: center;
}

.result-card {
  margin-bottom: 18px;
}

.result-card >>> .el-card__body {
  padding: 20px 30px;
}

.break-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.break-label {
  flex: none;
  width: 68px;
  font-size: 13px;
  color: var(--ink-title);
}

.break-bar {
  flex: 1;
}

.break-num {
  flex: none;
  width: 72px;
  text-align: right;
  font-size: 12px;
  color: var(--ink-sub);
  font-variant-numeric: tabular-nums;
}

.ai-comment {
  margin: 0;
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink);
}

/* ───────────────────────── 逐题回顾 ───────────────────────── */

.panel-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-title);
}

.panel-sub {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-sub);
}

.result-card >>> .el-collapse,
.result-card >>> .el-collapse-item__header,
.result-card >>> .el-collapse-item__wrap {
  border-color: var(--line-warm);
  background-color: transparent;
}

.result-card >>> .el-collapse-item__header {
  color: var(--ink);
}

.result-card >>> .el-collapse-item__content {
  color: var(--ink-title);
}

.review-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 10px;
}

.review-stem {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--ink);
}

.review-body {
  padding: 4px 2px 2px;
}

.review-line {
  margin: 0 0 7px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink-title);
}

.review-key {
  display: inline-block;
  width: 70px;
  color: var(--ink-sub);
}

/* 对错两色压成墨绿与体制红：Element 默认的 #67c23a / #f56c6c 在纸底上太扎眼 */
.is-wrong {
  color: var(--gov-red);
}

.is-right {
  color: var(--gov-olive);
}

.review-comment {
  margin: 10px 0 6px;
  padding: 9px 12px;
  border-left: 3px solid var(--gov-red-line);
  border-radius: 0;
  background-color: rgba(192, 57, 43, 0.04);
  font-size: 13px;
  line-height: 1.8;
  color: var(--ink);
}

.review-rationale {
  margin: 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--ink-sub);
}

.result-actions {
  text-align: center;
}

/* ───────────────────────── 窄屏（手机） ─────────────────────────
   断点 768px。桌面端一行不动。

   本页三张卡（发卷/答题/成绩单）都是**写死的像素宽**：460 / 620 / 680。
   手机上一律改成"满宽 + 上限"，上限值仍用桌面那两个数——
   窄屏上永远不会触及，等于只对手机生效。 */
@media (max-width: 768px) {
  /* align-items 从 center 改成 flex-start。
     center 在内容比视口高的时候会**两头溢出**：卡顶被推到屏幕上方之外，
     而那部分滚不到，玩家看到的是"标题没了"。flex-start 只往下长，能滚。 */
  .exam-page {
    align-items: flex-start;
    padding: 16px 12px 36px;
  }

  .center-card {
    width: 100%;
    max-width: 460px;
    /* 发卷页是整屏居中的，改成 flex-start 之后要自己把上边距补回来 */
    margin-top: 12vh;
  }

  .center-card >>> .el-card__body {
    padding: 30px 22px;
  }

  .center-text {
    font-size: 15px;
  }

  .paper-card {
    width: 100%;
    max-width: 620px;
  }

  .paper-card >>> .el-card__body {
    padding: 18px 16px 16px;
  }

  .paper-progress {
    margin: 10px 0 18px;
  }

  .stem {
    margin-bottom: 16px;
  }

  .stem-text {
    font-size: 15px;
    line-height: 1.85;
  }

  /* 选项：全宽 + 44px 触控底线。
     选项点下去就定分且**不可回退**，点偏的代价比别处大，
     所以这里的 44px 不只是舒适度问题。 */
  .option {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 13px 14px;
  }

  .option-text {
    font-size: 14px;
    line-height: 1.7;
  }

  /* "重新开考""查看档案"这些按钮是页面的出口，抬到 44px 触控底线 */
  .exam-page .el-button {
    min-height: 44px;
  }

  .result-wrap {
    width: 100%;
    max-width: 680px;
  }

  /* ── 通知单：手机上不滚动是一道硬要求 ──
     窄屏把每一处纵向间距都收到最小，分数仍保留 38px（它是这张纸的重点，
     再小就不像公文标题下的成绩了），标题字距从 6px 收到 3px——
     6px 在 375px 屏上会把 6 个字撑到换行。 */
  .notice-card >>> .el-card__body {
    padding: 18px 16px 16px;
  }

  .notice-title {
    margin-bottom: 12px;
    padding-bottom: 10px;
    font-size: 18px;
    letter-spacing: 3px;
  }

  .notice-score-num {
    font-size: 38px;
  }

  .notice-score-label,
  .notice-score-unit {
    font-size: 13px;
  }

  .notice-assign {
    margin-top: 12px;
  }

  .notice-unit {
    font-size: 16px;
  }

  .notice-comment {
    margin-top: 12px;
    padding: 8px 11px;
    font-size: 13px;
    line-height: 1.8;
  }

  .notice-bonus {
    margin-bottom: 12px;
    padding-bottom: 10px;
  }

  .notice-foot {
    margin-top: 14px;
    padding-top: 12px;
  }

  .notice-call {
    margin-bottom: 12px;
    font-size: 12px;
  }

  .detail-toggle {
    margin-bottom: 14px;
  }

  .result-card >>> .el-card__body {
    padding: 18px 16px;
  }

  /* 分项得分那一行：标签 68px + 数值 72px + 两处 12px 间距 = 164px 死宽，
     375px 屏上留给进度条的就只剩 120 多像素，短得看不出差别。
     把两侧收窄，进度条才重新有信息量。 */
  .break-row {
    gap: 8px;
  }

  .break-label {
    width: 54px;
    font-size: 12px;
  }

  .break-num {
    width: 56px;
    font-size: 11px;
  }

  /* 逐题回顾的标题行：题面本来就有省略号，这里只是把右侧留白收掉，
     让"第 N 题"和标签之间不至于挤在一起 */
  .review-title {
    gap: 6px;
    padding-right: 4px;
  }

  .review-key {
    width: 62px;
  }

  .review-comment,
  .review-rationale {
    font-size: 12px;
    line-height: 1.75;
  }
}
</style>
