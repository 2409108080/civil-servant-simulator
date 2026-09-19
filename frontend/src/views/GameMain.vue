<template>
  <div class="game-main gov-paper-bg">
    <!-- 水印：泛黄档案纸的底纹。仅装饰，必须 pointer-events:none -->
    <div class="watermark">内部人事档案</div>

    <header class="top-bar">
      <div class="brand">
        <span class="brand-title">公务员晋升模拟器</span>
        <span class="brand-sub">第 1 版 · 数据契约 {{ gameVersion }}</span>
      </div>
      <div class="top-actions">
        <el-button class="gov-btn--ghost" @click="rulesVisible = true">规则</el-button>
        <el-button class="gov-btn--ghost" @click="aboutVisible = true">关于</el-button>
        <el-button class="gov-btn--ghost" @click="onManualSave">手动存档</el-button>
        <el-button class="gov-btn--outline" @click="onReset">重新开始</el-button>
      </div>
    </header>

    <div class="layout">
      <!-- 左栏：个人档案与提任研判 -->
      <aside class="sidebar">
        <PlayerCard :player="player" />
        <PromotionPanel
          :resources="resources"
          :level="player.level"
          :tenure-quarters="tenureQuarters"
          :has-illicit-record="Boolean(player.hasIllicitRecord)"
          :illicit-wealth="Number(player.illicitWealth) || 0"
          :audit-hold-left="auditHoldLeft"
        />
      </aside>

      <!-- 右栏：资源条与工作台 -->
      <main class="workspace">
        <el-card class="gov-card panel" shadow="never">
          <div slot="header" class="panel-header">
            <span>个人状态</span>
            <span class="panel-hint">精力与健康是干工作的本钱</span>
          </div>
          <ResourceBar :resources="resources" />
        </el-card>

        <el-card class="gov-card gov-card--primary panel work-panel" shadow="never">
          <div slot="header" class="panel-header">
            <span>工作台</span>
            <span class="panel-hint">{{ player.quarter }}</span>
          </div>

          <!-- 有待办事件：只亮红点，不强制弹窗（刷新页面也不会重放事件） -->
          <div v-if="hasPending" class="pending-tip">
            <el-badge is-dot class="pending-badge">
              <span class="pending-text">有 {{ 1 }} 件待办事项等着处理</span>
            </el-badge>
            <el-button class="gov-btn" @click="openPendingEvent">
              立即处理
            </el-button>
          </div>

          <!-- 无待办且还有行动力：可以继续推进工作 -->
          <div v-else-if="player.ap > 0 && !gameStatus.gameOver" class="action-area">
            <p class="action-hint">
              本季度还剩 <strong>{{ player.ap }}</strong> 点行动力，可以继续推进工作。
            </p>
            <div class="action-buttons">
              <el-button class="gov-btn" @click="drawNewEvent">推进工作</el-button>
              <!-- 走动关系。做成常驻按钮而不是事件里的一个选项：
                   降风险不能全靠抽卡，抽不到就只能看着风险往上堆。
                   家底不够时置灰——引擎那边还会再验一道，见 balanceRelations。
                   价签随职级走，有案底再加价，所以"有案底加价"四个字必须挂在
                   按钮上而不是只在说明里：玩家要比的就是这个数，
                   藏在下面等于让他自己算，而算错账的下一步就是乱点。 -->
              <el-button
                class="gov-btn--outline"
                :disabled="!canBalance"
                @click="onBalance"
              >
                走动关系（耗 {{ balanceCost }} 点行动力 / ¥{{ balanceMoneyText }}<template
                  v-if="hasIllicitRecord"
                > · 有案底加价</template>）
              </el-button>
            </div>
            <p class="action-note">
              走动关系：耗 {{ balanceCost }} 点行动力、¥{{ balanceMoneyText }} 家产走动走动，
              廉政风险降 {{ balanceReliefMin }}~{{ balanceReliefMax }} 点，人缘 +{{ balancePopularity }}。
              <template v-if="hasIllicitRecord">你身上带着事：价钱按五倍计，
              每季度只能走这一次，而且这点交情压不住多大的事。</template>
              <template v-else>价钱随职级递增。</template>
            </p>
            <!-- 按钮置灰时不能只留一个灰按钮：玩家点了没反应，只会以为按钮坏了，
                 所以把原因写在旁边。
                 两种原因要分开说：次数用完是"这季度不能再走"，家底不够是"走不起"，
                 说成同一句的话，一个刚走完的关系户会被告知"家底还差 ¥0"。 -->
            <p v-if="!canBalance" class="action-note action-note--broke">
              <template v-if="balanceCapLeft <= 0">身上带着事，这个季度不便再走动了。</template>
              <template v-else>家底还差 ¥{{ balanceShortfallText }}，走动不起了。</template>
            </p>
          </div>

          <!-- 行动力耗尽：进入下一季度 -->
          <div v-else-if="!gameStatus.gameOver" class="action-area">
            <p class="action-hint">
              本季度行动力已用尽。休整之后，精力与健康会有所恢复，廉政风险也会随时间平息。
            </p>
            <el-button class="gov-btn" @click="onAdvanceQuarter">进入下一季度</el-button>
          </div>

          <div v-else class="action-area">
            <p class="action-hint">本局已结束。</p>
            <el-button class="gov-btn--outline" @click="onReset">重新开始</el-button>
          </div>
        </el-card>

        <el-card v-if="quarterNotes.length" class="gov-card panel" shadow="never">
          <div slot="header" class="panel-header"><span>近期通报</span></div>
          <ul class="note-list">
            <li v-for="(note, idx) in quarterNotes" :key="idx">{{ note }}</li>
          </ul>
        </el-card>
      </main>
    </div>

    <EventModal
      :visible.sync="gameStatus.showEventModal"
      :event="gameStatus.currentEvent"
      :ap="player.ap"
      :player="player"
      :resources="resources"
      @choose="onChoose"
    />

    <!-- 结算画面。所有结局共用这一个界面，由结局代号换皮肤。
         用 v-if 而不是 v-show，也不再走 el-dialog：
         它是**盖住**整个工作台的一张纸，不是浮在上面的第二个弹窗。
         用弹窗的话底下的按钮仍然在 DOM 里、仍然可聚焦，
         结局已经宣判了、玩家还能 Tab 过去点「推进工作」，
         而引擎那一边 gameOver 已经置位——两边对不上。

         没有关闭入口是刻意的：能关掉的话，玩家关掉就再也看不到自己的结局了，
         而这一局的结论已经在游戏逻辑里定死，不存在"关掉继续玩"这条路。 -->
    <GameOverModal
      v-if="gameOverVisible"
      :player="player"
      :resources="resources"
      :game-status="gameStatus"
      @restart="onRestartFromReport"
    />

    <RulesModal :visible.sync="rulesVisible" />

    <AboutModal :visible.sync="aboutVisible" />

    <!-- 存档异常：版本不符或文件损坏。
         关键：这里绝不自动清档，必须玩家点确认后才 resetGame() -->
    <el-dialog
      :visible.sync="abnormalVisible"
      :title="abnormalTitle"
      width="460px"
      custom-class="gov-dialog"
      :show-close="false"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
    >
      <p class="abnormal-text">{{ abnormalMessage }}</p>
      <p v-if="abnormalSavedAt" class="abnormal-meta">存档时间：{{ abnormalSavedAt }}</p>
      <span slot="footer">
        <el-button class="gov-btn" @click="confirmRestart">重新开始</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import gameState from '@/mixins/gameState'
import { drawEvent } from '@/game/eventPool'
import {
  advanceQuarter,
  applyOption,
  balanceRelations,
  parseQuarter,
  settleGameOver
} from '@/game/engine'
import { buildCrisisEvent, needsCrisis } from '@/game/crisis'
import { buildFleeWarningEvent, needsFleeWarning } from '@/game/flee'
import { buildInvestigationEvent, needsInvestigation } from '@/game/investigation'
import { GAME_VERSION, RESOURCE_LABELS } from '@/constants/gameConfig'
import { BALANCE, formatMoney } from '@/constants/money'
import { balanceMoneyCostOf, BALANCE_RECORD_QUARTERLY_CAP } from '@/constants/assets'
import { LOAD_STATUS } from '@/utils/storage'
import { notice, toast, dismissAll } from '@/utils/notice'
import PlayerCard from '@/components/PlayerCard.vue'
import ResourceBar from '@/components/ResourceBar.vue'
import PromotionPanel from '@/components/PromotionPanel.vue'
import EventModal from '@/components/EventModal.vue'
import GameOverModal from '@/components/GameOverModal.vue'
import RulesModal from '@/components/RulesModal.vue'
import AboutModal from '@/components/AboutModal.vue'

/**
 * 申报提示的等级 → Element 通知类型。
 * 灰用 info、黄用 warning、红用 error —— 三级必须**看得出差别**，
 * 全用 info 的话"观察名单边缘"和"重点核查"在界面上长得一模一样，
 * 分级就白做了。
 */
const NOTIFY_TYPE = { info: 'info', warning: 'warning', danger: 'error' }

export default {
  name: 'GameMain',

  components: {
    PlayerCard,
    ResourceBar,
    PromotionPanel,
    EventModal,
    GameOverModal,
    RulesModal,
    AboutModal
  },

  mixins: [gameState],

  data() {
    return {
      quarterNotes: [],
      // 走动关系的数值交给界面读，避免按钮旁那行说明自己抄一遍数字。
      // 家产的价钱**不在这里**——它按职级走、有案底还要翻倍，
      // 是个跟着 player 变的量，见下面 balanceMoneyCost 那个 computed。
      balanceCost: BALANCE.apCost,
      balanceRecordCap: BALANCE_RECORD_QUARTERLY_CAP,
      gameVersion: GAME_VERSION,
      rulesVisible: false,
      aboutVisible: false
    }
  },

  computed: {
    /**
     * 有没有待办事项。
     *
     * 判两件事，不能只看 currentEvent：财产申报挂上的立案审查
     * **没有实体事件对象**——它是在季末结算里置了一个标志位（见 engine.js 第 8 步），
     * 决定书要到玩家下一次「推进工作」时才现攒。只看 currentEvent 的话，
     * 那个红点永远不亮，玩家在一整季里都不知道有份决定书在等着他。
     */
    hasPending() {
      return this.hasPendingEvent() || needsInvestigation(this.$data)
    },

    gameOverVisible() {
      return Boolean(this.gameStatus.gameOver)
    },

    /**
     * 走动关系要花多少家产（元）。
     *
     * **不缓存进 data**：它跟着职级和案底变，而这两个都是 player 上的活字段。
     * 存一份快照的话，提任的那一刻按钮上的价签还是上一档的，
     * 玩家看到的是"厅级了还按科级收钱"——而这种错不会报错，只会算错账。
     * 价钱也不在这里算，一律问 assets.js（见 balanceMoneyCostOf 的说明）。
     */
    balanceMoneyCost() {
      // 第三个参数是家产，喂给"有案底加价"的封顶。
      // 这里和 engine.js 的 balanceRelations 必须传同一个数——
      // 一边传一边不传，按钮上写着 6 万、引擎按 25 万收，
      // 或者反过来（按钮灰着、其实点得动），而这两种都不会报错。
      return balanceMoneyCostOf(
        this.player.level,
        this.player.hasIllicitRecord,
        this.player.money
      )
    },

    /** 走动关系的价钱，带千分位。按钮与说明都读它，免得两处各写各的格式 */
    balanceMoneyText() {
      return formatMoney(this.balanceMoneyCost)
    },

    /** 有没有案底。决定按钮上要不要挂"有案底加价"那句 */
    hasIllicitRecord() {
      return Boolean(this.player.hasIllicitRecord)
    },

    /**
     * 本次走动能压下去多少风险、涨多少人缘。
     *
     * 按案底分档，与引擎里那三行**必须取同一对值**（见 money.js 的说明）。
     * 这行说明是玩家判断"这钱花得值不值"的唯一依据，
     * 写一个引擎不认的数，等于让玩家按一个假价签做决定。
     */
    balanceReliefMin() {
      return this.hasIllicitRecord ? BALANCE.recordRiskReliefMin : BALANCE.riskReliefMin
    },

    balanceReliefMax() {
      return this.hasIllicitRecord ? BALANCE.recordRiskReliefMax : BALANCE.riskReliefMax
    },

    balancePopularity() {
      return this.hasIllicitRecord ? BALANCE.recordPopularityGain : BALANCE.popularityGain
    },

    /** 还差多少家产才走得动，带千分位。只在按钮已置灰时被读到 */
    balanceShortfallText() {
      const gap = this.balanceMoneyCost - (Number(this.player.money) || 0)
      return formatMoney(gap > 0 ? gap : 0)
    },

    /**
     * 有案底的人本季度还能不能走。
     *
     * 上限只卡有案底的人（见 assets.js 的 BALANCE_RECORD_QUARTERLY_CAP）：
     * 一身干净的人正常的人情往来不该被限制，被盯过的人才需要收敛。
     */
    balanceCapLeft() {
      if (!this.hasIllicitRecord) return Infinity
      return Math.max(0, this.balanceRecordCap - (Number(this.gameStatus.balanceThisQuarter) || 0))
    },

    /**
     * 家底够不够、次数还有没有。
     *
     * 界面只管置灰，**能不能扣得起由引擎说了算**（见 engine.js 的 balanceRelations）。
     * 两边都判是刻意的冗余：置灰是给玩家看的，引擎那道是防状态烂掉——
     * money 是响应式的，万一界面漏判，行动力会白扣、风险会白降，钱却一分没花。
     */
    canBalance() {
      return (Number(this.player.money) || 0) >= this.balanceMoneyCost
        && this.balanceCapLeft > 0
    },

    /**
     * 任现职已满几个季度。跟 engine.js 的算法**必须是同一个**：
     * 这边算 9、那边算 10 的话，提任研判写着"年限已满"、
     * 季末裁定却按"未满"驳回，玩家只会觉得其中一个是 bug。
     * 所以两边都写成"当前绝对季度 − 起算点"，没有各自的四舍五入。
     */
    tenureQuarters() {
      const parsed = parseQuarter(this.player.quarter) || { year: 1, q: 1 }
      const abs = (parsed.year - 1) * 4 + parsed.q
      return abs - (Number(this.gameStatus.tenureStartAbs) || 1)
    },

    /**
     * 廉政审查还要挂起几个季度。与 engine.js 的 auditHeldAt 是同一个口径：
     * 那边判 `absQuarter < auditHoldUntil`，这边就把差值算出来给面板显示。
     * 两边各写各的迟早会对不上——面板说"还在挂起"、裁定却放行了，
     * 或者反过来，玩家会以为其中一个是 bug（与 tenureQuarters 同理）。
     */
    auditHoldLeft() {
      const until = Number(this.gameStatus.auditHoldUntil) || 0
      if (!until) return 0
      const parsed = parseQuarter(this.player.quarter) || { year: 1, q: 1 }
      const abs = (parsed.year - 1) * 4 + parsed.q
      return Math.max(0, until - abs)
    },

    abnormalVisible() {
      const status = this.loadResult && this.loadResult.status
      return status === LOAD_STATUS.VERSION_MISMATCH || status === LOAD_STATUS.CORRUPTED
    },

    abnormalTitle() {
      const status = this.loadResult && this.loadResult.status
      return status === LOAD_STATUS.CORRUPTED ? '存档损坏' : '人事档案已调整'
    },

    abnormalMessage() {
      return (this.loadResult && this.loadResult.message) || ''
    },

    abnormalSavedAt() {
      const savedAt = this.loadResult && this.loadResult.savedAt
      if (!savedAt) return ''
      try {
        return new Date(savedAt).toLocaleString('zh-CN')
      } catch (err) {
        return savedAt
      }
    }
  },

  created() {
    // 新人报到：没有姓名就先让玩家署名。
    // 存档异常时先不打扰，等玩家处理完弹窗再说。
    if (!this.player.name && !this.abnormalVisible) {
      this.$nextTick(this.askName)
    }
  },

  methods: {
    askName() {
      this.$prompt('请填写你的姓名，将记入干部档案。', '新录用人员报到', {
        confirmButtonText: '报到',
        cancelButtonText: '稍后再说',
        inputPattern: /^.{1,20}$/,
        inputErrorMessage: '姓名需为 1-20 个字符',
        closeOnClickModal: false
      })
        .then(({ value }) => {
          this.player.name = value.trim()
          this.saveGame()
        })
        .catch(() => {})
    },

    /**
     * 推进工作：从本地事件池抽一个。
     *
     * 同步返回。没有 await，所以这里**不需要** loading 态、不需要用标志位防连点、
     * 也不需要预取缓存——那三样都是为了掩盖「等 AI 十几秒」而存在的。
     * 等待消失之后它们只剩下出错的可能：预取发生在玩家读上一件事的时候，
     * 用的也是那一刻的状态，题材一旦变了（风险越过 50）存货就跟当前对不上。
     */
    drawNewEvent() {
      // 立案审查**排在最前**，而且不是从池子里抽的——见 game/investigation.js。
      // 它排得比危机公关还靠前，是因为两者虽然都不是抽卡，性质却差一层：
      // 危机公关是组织上跟你通个气（还没定性，你还能做点什么），
      // 立案审查是决定书已经批下来了（是已经发生的事）。
      // 决定书等着的时候，玩家不该有"先去别处转转"的余地。
      if (needsInvestigation(this.$data)) {
        this.showEvent(buildInvestigationEvent(this.$data))
        return
      }

      // 风声预警排在危机公关**之前**：它一辈子只响一次，而且接完这一通，
      // 这一局的走向就定了（走是终局，不走下季立案）。压在每季度都可能来的
      // 危机公关后面，玩家会先被拉去谈一次话、再回头接这通电话——
      // 那通电话的分量，就被这次插队稀释掉了。
      //
      // 也不从池子里抽：与危机公关同理，抽卡抽不出来的东西不能决定一局的结局。
      if (needsFleeWarning(this.$data)) {
        this.showEvent(buildFleeWarningEvent(this.$data))
        return
      }

      // 危机公关**优先于**抽事件，而且不是从池子里抽的——见 game/crisis.js。
      // 放在这里而不是 advanceQuarter 里：季末是自动结算，玩家手上没有决定权；
      // 摆在「推进工作」这一下，它才是一次真正由玩家做出的选择。
      if (needsCrisis(this.$data)) {
        this.gameStatus.crisisHandled = true
        this.showEvent(buildCrisisEvent(this.$data))
        return
      }

      const event = drawEvent(this.$data)
      if (!event) {
        // 只有事件池为空才会走到这里，属于配置问题，要让玩家看见而不是静默失败
        toast(this, { type: 'warning', message: '事件库为空，请检查 localEvents.js。' })
        return
      }
      this.showEvent(event)
    },

    /** 走动关系：花行动力与家产主动压风险 */
    onBalance() {
      const result = balanceRelations(this.$data)
      if (!result.ok) {
        toast(this, { type: 'warning', message: result.message })
        return
      }

      // 附言带上这笔支出。明细里那条"家产 -¥10,000"只说少了多少，
      // 不说为什么少——季度通报里得能看出钱是怎么走的。
      this.reportChanges(result.changes, result.message)
      this.saveGame()

      const ending = settleGameOver(this.$data)
      if (ending) {
        this.saveGame()
        notice(this, { type: 'error', title: ending.label, message: ending.reason })
        return
      }

      if (this.player.ap <= 0) {
        toast(this, { type: 'info', message: '本季度行动力已用尽，可以进入下一季度了。' })
      }
    },

    /** 展示事件。事件全部来自本地，没有降级可言，因此不再有任何来源提示 */
    showEvent(event) {
      this.gameStatus.currentEvent = event
      this.gameStatus.showEventModal = true
    },

    /** 从红点进入待办 */
    openPendingEvent() {
      // 决定书是现攒的，手上没有实体事件时得先攒出来。
      // 少了这一步，红点亮着、点进去却什么也没有——玩家会以为存档坏了。
      if (needsInvestigation(this.$data) && !this.gameStatus.currentEvent) {
        this.showEvent(buildInvestigationEvent(this.$data))
        return
      }
      this.gameStatus.showEventModal = true
    },

    /**
     * 事件结算。
     *
     * 这里**不记任何账**。事件冷却与一次性标记位都由引擎在 applyOption 里写
     * （见 game/engine.js）。早先这两样是记在这里的，代价是模拟器走不到这一层，
     * 跑出来的平衡数据和真实游戏不是同一局——两个口径下贪腐流落马率
     * 差了整整一个数量级，而两边都不报错。
     */
    onChoose(option) {
      const result = applyOption(this.$data, option)

      if (!result.ok) {
        toast(this, { type: 'warning', message: result.message })
        return
      }

      this.reportChanges(result.changes, result.message === '处理完毕。' ? '' : result.message)
      this.reportProfileChange(result.changedProfile)

      // ── 自动存档点 1/3：事件结算后 ──
      this.saveGame()

      // 事件里把风险顶到 100、或把健康打到 0，必须当场结束。
      // 不能等玩家点"进入下一季度"——那时休整回血会把人从留置线上捞回来。
      const ending = settleGameOver(this.$data)
      if (ending) {
        this.saveGame()
        notice(this, { type: 'error', title: ending.label, message: ending.reason })
        return
      }

      if (this.player.ap <= 0) {
        toast(this, { type: 'info', message: '本季度行动力已用尽，可以进入下一季度了。' })
      }
    },

    /**
     * 播报"换了单位流派"。
     *
     * 遴选/借调是整局里少有的**结构性变化**：单位类型一变，往后抽哪一档事件、
     * 晋升通道长什么样都跟着变。这种变化如果塞进那条 2.6 秒的资源播报里，
     * 一闪就过去了，玩家多半不知道自己刚换了条跑道——而这恰恰是设计上
     * 最想让玩家意识到的一件事。所以单开一条停留更久的通知，
     * 把"从哪到哪、新职务叫什么"写全。
     */
    reportProfileChange(profile) {
      if (!profile || !profile.from || !profile.to) return

      // 降级走另一条播报。认罪退赃动的是**职级**，不是单位——
      // 沿用下面那条"从 A 单位调到 B 单位"的文案，会写成
      // 「市财政局 → 市财政局」，看着像系统出错了。
      if (profile.demoted) {
        notice(this, {
          title: '降级使用',
          message: `组织上研究决定：由「${profile.fromLevel}」降为「${profile.toLevel}」，`
            + `改任「${profile.to.position}」，保留公职。`,
          type: 'warning'
        })
        return
      }

      // 组织调离走"红头文件"，与遴选/借调那条绿色的"调动"分开。
      // 遴选是**你自己争取来的**，调离是**组织上决定的**——
      // 同一个「调动」标题盖两件性质相反的事，玩家会以为这次也是自己考上的。
      // 红色不是装饰：这是全流程里唯一一次你什么都没做就被挪走。
      if (profile.reassigned) {
        notice(this, {
          title: '中共市委组织部',
          message: `因工作需要，经市委组织部研究决定，${this.player.name}同志`
            + `不再担任${profile.from.position}职务，另有任用。`
            + `（现单位：${profile.to.unit}）`,
          type: 'error',
          customClass: 'redhead-notice'
        })
        return
      }

      const from = `${profile.from.unit}（${profile.from.unitType}）`
      const to = `${profile.to.unit}（${profile.to.unitType}）`
      notice(this, {
        title: '调动',
        message: `${from} → ${to}，现任「${profile.to.position}」。`,
        type: 'success'
      })
    },

    /**
     * 把资源增减播报给玩家。
     *
     * @param {Array}  changes 引擎给的明细
     * @param {string} tail    结算附言（掷骰结果之类）。与增减并成一条播报，
     *                         分成两条弹会一前一后闪过去，玩家只看得见后一条。
     */
    reportChanges(changes = [], tail = '') {
      const parts = (changes || []).map((c) => {
        const delta = c.actual
        if (c.key === 'money') {
          // 钱用金额写法。跟资源一样只报 "+50000"，玩家得自己数零
          if (delta === 0) return '家产 无变化'
          return `家产 ${delta > 0 ? '+' : '-'}¥${formatMoney(Math.abs(delta))}`
        }
        // 非法所得。它**与家产那一笔同时出现**（收下 50 万 = 家产 +50 万、
        // 非法所得 +50 万），两笔都报是刻意的：钱是同一笔钱，
        // 但一笔是"你多了多少"，一笔是"纪委记了多少"，不是一回事。
        // 混着不说，玩家会以为系统把同一笔钱算了两遍。
        if (c.key === 'illicitWealth') {
          // 退赃会让这个数为负，"+¥-500,000"这种串没人看得懂，
          // 也正好把"退回去"和"记上账"两件事说反了。
          return delta < 0
            ? `非法所得 −¥${formatMoney(-delta)}（已退还）`
            : `非法所得 +¥${formatMoney(delta)}（纪委已记账）`
        }
        const label = RESOURCE_LABELS[c.key] || c.key
        if (delta === 0) return `${label} 无变化`
        return `${label} ${delta > 0 ? '+' : ''}${delta}`
      })

      if (tail) parts.push(tail)
      if (!parts.length) return

      toast(this, { type: 'info', message: parts.join('　') })
    },

    /** 进入下一季度 */
    onAdvanceQuarter() {
      const result = advanceQuarter(this.$data)

      // 季度通报**合并成一条**。
      // 原先是一条 note 一条 notify，一个季度能弹 3~5 条，一屏全是框；
      // 而这几条本来是同一份《季度工作通报》的几个自然段，拆开弹既占屏
      // 又让人来不及读——第 3 条弹出来时第 1 条已经到期了。
      // 合成一条之后也自然满足"同时在屏不超过 2 条"：通报占 1 条，
      // 下面那条财产申报占 1 条，正好。
      this.quarterNotes = result.notes.length ? result.notes : ['本季度平稳度过，无事发生。']
      notice(this, {
        title: `${result.quarter} 季度通报`,
        // 逐段分行。样式侧用 white-space: pre-line 把 \n 兑现成换行
        message: this.quarterNotes.join('\n'),
        type: 'info',
        customClass: 'redhead-notice'
      })

      // 财产申报的提示按等级上色：灰=观察名单边缘，黄=已移交，红=重点核查。
      // 它不在 notes 里（见 advanceQuarter），所以这里单独弹一条，
      // 否则那条黄提示会被上面的通报一起吞成灰的。
      if (result.declaration) {
        notice(this, {
          type: NOTIFY_TYPE[result.declaration.level] || 'info',
          title: '个人有关事项报告',
          message: result.declaration.text
        })
      }

      // ── 自动存档点 2/3：季度推进后（晋升与结束判定都发生在此之后）──
      this.saveGame()

      if (result.gameOver) {
        notice(this, {
          type: 'error',
          title: result.gameOver.label,
          message: result.gameOver.reason
        })
        return
      }
    },

    onManualSave() {
      const ok = this.saveGame()
      toast(this, {
        type: ok ? 'success' : 'error',
        message: ok ? '已存档。' : '存档失败，本地存储不可用。'
      })
    },

    /**
     * 清档并回到报到页。
     *
     * 必须跳回 `#/` 而不是原地重开：考公决定去哪个单位，是这一局的起点。
     * 原地清档会让玩家以"无姓名的基层乡镇副镇长"身份直接上任，
     * 等于把考公整个跳过去了。
     */
    restartAndReport(message) {
      // resetGame 内部已经 dismissAll() 过了，这里再清一次是刻意的冗余：
      // 这条路径是"带着上一局判决书开局"最常走的一条，
      // 多清一次不花钱，漏一次就是玩家带着上一局的通报进新局。
      dismissAll()
      this.resetGame()
      this.loadResult = null
      this.quarterNotes = []
      this.rulesVisible = false
      this.aboutVisible = false
      toast(this, { type: 'success', message })
      this.$router.push('/')
    },

    /** 版本不符 / 存档损坏，玩家确认后按新版本重开 */
    confirmRestart() {
      this.restartAndReport('已按新版本重新开始，请重新报到。')
    },

    /**
     * 结算画面里的「确定重开」。
     *
     * **这里不能再走 onReset**：结算画面是 z-index:3000 的全屏层，
     * 而 $confirm 的弹窗层级从 2000 起，会被压在底下——玩家点了没反应。
     * 二次确认已经做在画面内部了，所以到这里直接重开。
     */
    onRestartFromReport() {
      this.restartAndReport('已重新开始，请重新报到。')
    },

    /**
     * 工作台头部那个「重新开始」。它身上没有全屏层，$confirm 正常可见，
     * 所以确认仍然交给弹窗。
     */
    onReset() {
      this.$confirm('重新开始将清空当前全部进度，并回到报到页重新参加录用考试。确定吗？', '重新开始', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          this.restartAndReport('已重新开始，请重新报到。')
        })
        .catch(() => {})
    }
  }
}
</script>

<style scoped>
.game-main {
  min-height: 100vh;
  /* 纸底与径向渐变由主题的 .gov-paper-bg 提供 */
}

/* 水印。用 position:fixed 铺在视口上，而不是 absolute 撑在内容里——
   主面板比一屏长得多，absolute 会把它推到**整页**的正中，
   玩家在首屏根本看不到，等于白放。
   z-index:0 且内容层抬到 1：水印必须在卡片之下，否则字压在卡上没法读。
   透明度沿用档案页的 0.06（普通办公显示器上看得见、又不抢正文）。 */
.watermark {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-18deg);
  z-index: 0;
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
  font-size: 56px;
  letter-spacing: 10px;
  white-space: nowrap;
  color: var(--gov-red);
  opacity: 0.06;
  pointer-events: none;
  user-select: none;
}

.top-bar {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background-color: var(--paper-card);
  /* 红头文件的那一条红线。整页的"体制感"基本就压在这一笔上 */
  border-bottom: 3px solid var(--gov-red);
}

.brand-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1px;
  color: var(--gov-red);
}

.brand-sub {
  margin-left: 10px;
  font-size: 12px;
  color: var(--ink-faint);
}

.layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 18px;
  padding: 18px 24px 32px;
  align-items: start;
}

.sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workspace {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.panel >>> .el-card__header {
  padding: 12px 16px;
}

.panel >>> .el-card__body {
  padding: 18px 16px;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.panel-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-faint);
}

.work-panel >>> .el-card__body {
  padding: 22px 16px;
}

.pending-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pending-badge {
  margin-left: 6px;
}

.pending-text {
  font-size: 14px;
  color: var(--ink);
}

.action-area {
  text-align: center;
}

.action-hint {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-sub);
}

.action-hint strong {
  color: var(--gov-red);
  font-size: 15px;
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

/* 两个按钮的说明压在底下，字号比正文再小一档：
   它是规则说明，不是行动号召，不该跟上面的提示抢注意力。 */
.action-note {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-faint);
}

/* 季报是中性通报，不是警报——用赭石左边条，不用红。
   用红会让人以为出了事，点开一看只是"本季度平稳度过"。 */
.note-list {
  margin: 0;
  padding-left: 20px;
  border-left: 3px solid var(--gov-amber);
  font-size: 13px;
  line-height: 1.9;
  color: var(--ink-sub);
}

/* 家底不够是"做不了"而不是"出事了"，所以走赭石不走体制红——
   红是警报色，这里只是缺钱，用红会把一次普通的余额不足喊成事故。 */
.action-note--broke {
  color: var(--gov-amber-text);
}

.abnormal-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--ink-sub);
}

.abnormal-meta {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ink-faint);
}

/* ───────────────────────── 窄屏（手机） ─────────────────────────
   断点 768px。桌面端一行不动。

   手机上只做一件事：**把两栏摊成一栏**。
   版面的先后顺序不用动——.layout 里的 DOM 顺序本来就是
   左栏（个人卡片、提任研判）在前、右栏（资源条、工作台、近期通报）在后，
   而单列网格是按 DOM 顺序往下排的。
   需求里"个人卡片放最上面、工作台放最下面"，正好就是现有顺序，
   所以这里只改列数，一行模板都不用挪。 */
@media (max-width: 768px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding: 12px 12px 28px;
  }

  .sidebar,
  .workspace {
    gap: 12px;
  }

  /* 顶栏。窄屏放不下"品牌 + 两个按钮"一行，允许换行；
     按钮字号收到 12px，但高度留 38px——缩字号是为了不挤，
     缩到点不着就本末倒置了。 */
  .top-bar {
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 14px;
  }

  .brand-title {
    font-size: 15px;
    letter-spacing: 0.5px;
  }

  /* "第 1 版 · 数据契约 x.y.z"是给开发者看的版本号，手机上直接不显示——
     留着会让顶栏折成三行。已确认，不是待定项。 */
  .brand-sub {
    display: none;
  }

  .top-actions {
    margin-left: auto;
  }

  .top-actions .el-button {
    padding: 9px 12px;
    min-height: 38px;
    font-size: 12px;
  }

  .top-actions .el-button + .el-button {
    margin-left: 8px;
  }

  /* 待办提示：文字与按钮并排会把按钮挤成一小块，改成上下两行、按钮通栏 */
  .pending-tip {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .pending-tip .el-button {
    width: 100%;
    min-height: 44px;
  }

  /* 行动按钮：并排时两个按钮各自只剩一半宽，中文文案会被折成两行。
     改成一列通栏，顺便把触控区做到 44px。 */
  .action-buttons {
    flex-direction: column;
    gap: 10px;
  }

  .action-buttons .el-button {
    width: 100%;
    min-height: 44px;
    margin-left: 0;
  }

  .action-hint {
    font-size: 13px;
  }

  .panel >>> .el-card__body,
  .work-panel >>> .el-card__body {
    padding: 16px 14px;
  }

  /* 面板标题右侧那句提示在窄屏会和标题抢位置，让它换行而不是被压扁 */
  .panel-header {
    flex-wrap: wrap;
    gap: 4px;
  }

  .note-list {
    padding-left: 16px;
    font-size: 13px;
    line-height: 1.8;
  }
}
</style>
