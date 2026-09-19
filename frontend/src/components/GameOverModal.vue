<template>
  <!-- 全屏固定定位：结算画面不是"再弹一个框"，这一局到此为止，
       底下的工作台不该还能被看见或点到。所以不用 el-dialog——
       弹窗是浮在场景之上的，而这张纸是**盖住**场景的。 -->
  <div class="game-over" :class="'skin-' + skin">
    <article class="report">
      <!-- ── 档案抬头 ── -->
      <header class="report-head">
        <p class="report-org">干部人事档案</p>
        <h1 class="report-title">《关于 {{ displayName }} 同志工作履历的总结报告》</h1>
        <p class="report-no">组人字〔{{ archiveYear }}〕第 {{ archiveNo }} 号</p>
      </header>

      <div class="report-body">
        <!-- ── 履历 ── -->
        <section class="block">
          <h2 class="block-title">履历</h2>
          <dl class="grid-2">
            <div class="cell">
              <dt>职级</dt><dd>{{ player.level }}</dd>
            </div>
            <div class="cell">
              <dt>职务</dt><dd>{{ player.position }}</dd>
            </div>
            <div class="cell">
              <dt>单位</dt><dd>{{ player.unit }}</dd>
            </div>
            <div class="cell">
              <dt>年龄</dt><dd>{{ player.age }} 岁</dd>
            </div>
            <div class="cell">
              <dt>任期</dt><dd>任现职 {{ tenureQuarters }} 个季度</dd>
            </div>
          </dl>
        </section>

        <!-- ── 核心资源 ── -->
        <section class="block">
          <h2 class="block-title">核心资源</h2>
          <dl class="res-grid">
            <div v-for="item in coreResources" :key="item.key" class="cell">
              <dt>{{ item.label }}</dt>
              <dd :class="{ 'is-risk': item.key === 'risk' && item.value >= RISK_ALERT }">
                {{ item.value }}
              </dd>
            </div>
          </dl>
        </section>

        <!-- ── 财产与结论 ── -->
        <section class="block">
          <h2 class="block-title">财产与结论</h2>
          <dl class="rows">
            <div class="row">
              <dt>家产</dt><dd>¥{{ money(player.money) }} 元</dd>
            </div>
            <div class="row">
              <dt>名下资产</dt>
              <dd>
                ¥{{ money(assetValue) }} 元
                <span v-if="assetCount" class="sub">（{{ assetCount }} 处）</span>
              </dd>
            </div>
            <div class="row">
              <dt>非法所得</dt>
              <dd :class="{ 'is-risk': illicit > 0 }">
                {{ illicit > 0 ? `¥${money(illicit)} 元` : '无' }}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <!-- 通栏横幅。横幅上那四个字是**结局的大类**，不是 ENDINGS 里那个精确代号，
           所以把精确代号挂在 title 上：大字保持封面色，鼠标一停仍能读到
           "平安落地"与"光荣退休"的区别。 -->
      <p class="ending-banner" :title="endingLabel">{{ bannerText }}</p>

      <!-- ── 判词 ── -->
      <div class="verdict-block">
        <div
          v-for="(para, i) in verdictParagraphs"
          :key="i"
          class="verdict-para"
          :class="'is-' + para.kind"
        >
          <p v-if="para.label" class="verdict-label">{{ para.label }}</p>
          <p class="verdict">{{ para.text }}</p>
        </div>
      </div>

      <footer class="report-foot">
        <!--
          二次确认做在**结算画面内部**，不用 $confirm。
          $confirm 走的是 el-message-box，层级由 PopupManager 从 2000 起分配，
          而结算画面是 z-index:3000 的全屏层——弹窗会被结结实实压在底下：
          玩家看得见按钮、点得动，但看不到任何反应，只会以为按钮坏了。
          （脚本化的 .click() 忽略层叠顺序，所以早先的自动化测试全绿，
          真人在浏览器里却点不动。这类 bug 只有真人会踩到。）
          做进画面里就没有层级问题，顺带也不用再弹一个盖住判词的框。
        -->
        <div v-if="!confirming" class="restart-row">
          <button type="button" class="archive-btn" @click="confirming = true">
            {{ actionLabel }}
          </button>
        </div>
        <div v-else>
          <p class="restart-ask">重新开始将清空本局全部进度，回到报到页重新参加录用考试。</p>
          <div class="restart-row">
            <button type="button" class="archive-btn" @click="$emit('restart')">
              确定重开
            </button>
            <button type="button" class="archive-btn is-ghost" @click="confirming = false">
              再想想
            </button>
          </div>
        </div>
        <p class="foot-note">{{ footNote }}</p>
      </footer>
    </article>
  </div>
</template>

<script>
import { ENDINGS, absQuarterOf, parseQuarter } from '@/game/engine'
import { RESOURCE_LABELS } from '@/constants/gameConfig'
import { formatMoney } from '@/constants/money'
import { totalAssetValue } from '@/game/wealth'

/**
 * 结局 → 皮肤。
 *
 * 四套皮肤对应四种"组织上会怎么对待你"，而不是四个结局代号：
 *   retire  光荣退休 / 平安落地    —— 米黄纸底
 *   purged  留置 / 立案 / 机场被拦 —— 深灰底，判词区红字
 *   flee    红色通缉令             —— 深蓝底，白字
 *   obit    倒在工作岗位           —— 白底黑细框
 *
 * 「机场被拦」归到 purged 而不是 flee：跑路那条线只有**真出去了**才算跑，
 * 在登机口被请下来是当场落马。和结局标签那边同一个判断
 * （见 GameMain.vue 里 .ending-tag.is-caught 那段）。
 */
const SKINS = {
  peak: 'retire',
  landed: 'retire',
  // 涉险过关单开一套，但**纸面与退休那套一模一样**（见下方 .skin-narrow 的说明）：
  // 组织上给他的就是一份干净人的履历，档案纸没有理由长得不一样。
  // 区别全在横幅那一个颜色上——那是这局唯一的记号。
  narrow: 'narrow',
  // 免职闲赋单开一套。它是风险触顶的**另一半**：同样顶到 100，
  // 伸手拿过钱的走 purged（深灰底、红字、判词里有一整段忏悔），
  // 一分钱没贪的走这一套。两者成因相同、结论完全相反，
  // 归到 purged 那套就等于把组织处理和刑事结论混成一份文件。
  dismissed: 'dismissed',
  purged: 'purged',
  corrupted: 'purged',
  caught: 'purged',
  rednotice: 'flee',
  collapse: 'obit'
}

/**
 * 横幅直接取结局代号的皮肤。
 *
 * retire 与 purged 是因为一套皮肤底下压着多个结局（见下面 SKIN_META 的说明），
 * dismissed 则是反过来：它只对应一个结局，但仍然取 ENDINGS 的 label——
 * 不为这一个词在 SKIN_META 里再抄一份，抄了就有两处要同步。
 */
const ENDING_LABEL_SKINS = ['retire', 'purged', 'dismissed', 'narrow']

/**
 * 皮肤 → 横幅、按钮、页脚小字。
 *
 * 刻意与 ENDINGS 的 label 分开：那是一份**法律结论**（立案审查调查 / 倒在工作岗位上），
 * 这里是**封面上的四个大字**。封面上写"倒在工作岗位上"排不下，
 * 写"因公殉职"才是这份档案合上时该有的分量。
 *
 * retire 这一套**不在这里定横幅**：它底下压着两个结局，
 * 而"走到了顶"和"止步于此"是两回事，横幅上写同一句话等于把没登顶的那一局
 * 也说成登顶了。所以它交给 ENDINGS 的精确代号去说（见 bannerText）。
 *
 * purged 这一套同理，而且后果更重。它底下压着**三个**结局，法律含义各不相同：
 *   纪委监委留置   —— 已经被留置，风险顶到 100 才走得到
 *   立案审查调查   —— 只是立案调查，人是自由的，风险通常只有三十上下
 *   机场被拦       —— 出逃途中被拦下
 * 原先一律写"纪委监委留置"，等于把"被组织叫去谈话"的那一档也说成留置了。
 * 实测这正是绝大多数人真正走的那条：400 局里落马 75.3%，**全部**是立案审查调查，
 * 留置那一档的风险线（100）在正常对局里根本够不着。
 * 于是玩家看到的是"横幅写着留置、风险写着 30"——自相矛盾的不是数字，是横幅。
 */
const SKIN_META = {
  retire: { action: '安享晚年', note: '档案已封存。' },
  // 「夜不能寐」不是修辞，是这一档的全部意思：底下那个"安享晚年"
  // 在**他**这儿是句反话——他也能点，点了也没有第二件事发生，
  // 但按下去的那一下玩家自己会犹豫。
  narrow: { action: '夜不能寐', note: '涉险过关，不代表安全落地。' },
  dismissed: { action: '接受安排', note: '档案已封存，不涉及处分。' },
  purged: { action: '接受处分', note: '本案已归档，不可申诉。' },
  flee: { banner: '红色通缉', action: '继续流亡', note: '档案已封存。' },
  obit: { banner: '因公殉职', action: '因公殉职', note: '档案已封存。' }
}

/** 需要摆出"辩解 / 认定"两造的那两套皮肤。退休与殉职这一局没有被告 */
const TRIED_SKINS = ['purged', 'flee']

/**
 * 判词里"法院开口"的位置。
 *
 * 十八句驳斥无一例外都以"法院最终认定，"开头（见 investigation.js 的 CONFESSION_GROUPS），
 * 所以这个短语就是那两造之间**本来就存在**的分界线，不是我们划的。
 * 拿它当切分点，比按句号数数可靠——文案以后加一句，这里不会跟着错位。
 */
const RULING_LEAD = '法院最终认定'

/** 落马类结局的收束句。purged 的判词本来就以它结尾，所以要先去重 */
const FINAL_LINE = '政治生命就此终结。'

/** 廉政风险到这个数就标红。与 PromotionPanel 里的"高风险"读数一致 */
const RISK_ALERT = 60

export default {
  name: 'GameOverModal',

  props: {
    player: { type: Object, required: true },
    resources: { type: Object, required: true },
    gameStatus: { type: Object, required: true },
    /** 任现职的季度数。由 GameMain 算好传进来，组件里不重算 */
    tenureQuarters: { type: Number, default: 0 }
  },

  data() {
    // confirming：footer 那个「再点一次」的二次确认状态，见模板里的注释
    return { RISK_ALERT, confirming: false }
  },

  computed: {
    /** 姓名缺省时不能出现「关于  同志」中间空一块 */
    displayName() {
      return this.player.name || '某'
    },

    /**
     * 无名氏的结局代号。
     * 读档重建或旧存档可能没有 gameOverEnding，兜到 landed——
     * 与 GameMain 里 endingKey 的兜底值保持一致，两处不能各兜各的。
     */
    endingKey() {
      return this.gameStatus.gameOverEnding || 'landed'
    },

    skin() {
      return SKINS[this.endingKey] || 'retire'
    },

    endingLabel() {
      const ending = ENDINGS[this.endingKey]
      return ending ? ending.label : '本局结束'
    },

    /**
     * 横幅上那四个大字。
     *
     * retire 这套皮肤底下压着**两个**结局——光荣退休与平安落地同为米黄纸底，
     * 但一个是走到了顶，一个是止步于此。横幅是这一屏最大的字，
     * 在这四个字上把两者合并，等于告诉一个没登顶的玩家他登顶了。
     * 所以这一套直接取 ENDINGS 的精确代号，另三套取 SKIN_META 的封面色。
     *
     * purged 那一套同样取 ENDINGS 的代号，理由见 SKIN_META 上面那段：
     * 留置、立案审查调查、机场被拦是三件事，用一个词盖住就会失真。
     */
    bannerText() {
      if (ENDING_LABEL_SKINS.indexOf(this.skin) !== -1) return this.endingLabel
      const meta = SKIN_META[this.skin]
      return meta && meta.banner ? meta.banner : '本局结束'
    },

    actionLabel() {
      const meta = SKIN_META[this.skin]
      return meta ? meta.action : '重新开始'
    },

    footNote() {
      const meta = SKIN_META[this.skin]
      return meta ? meta.note : ''
    },

    /**
     * 归档年份与文号。
     *
     * 抬头是红头文件的格式，缺了文号那一行就不像一份文件。
     * 存档里没有这两个字段，也不该为了一行装饰去动契约——
     * 所以从**已有的**季度推出：年份取结局发生在哪一年，
     * 文号取绝对季度序号补零。它是个装饰，但它不是随机数：
     * 同一局读档重建两次，看到的文号是一样的。
     */
    archiveYear() {
      const parsed = parseQuarter(this.player.quarter)
      // 补零到两位。"组人字〔9〕第 0034 号"里那个孤零零的 9 不像文号，
      // 像抄漏了一位；补成 〔09〕 才有一份公文的年份该有的样子。
      return String(parsed ? parsed.year : 1).padStart(2, '0')
    },

    archiveNo() {
      const n = absQuarterOf({ player: this.player })
      return String(n).padStart(4, '0')
    },

    /**
     * 核心资源 = 全部八项。
     *
     * 顺序直接取 RESOURCE_LABELS 的键序，不再在这里手写一份白名单：
     * 资源是**一处定义、多处引用**的东西（ResourceBar 也读它），
     * 组件里再抄一遍键名，加第九项资源时就会漏掉这一屏——
     * 而漏掉的那一项正好是玩家最想看的那一项。
     */
    coreResources() {
      return Object.keys(RESOURCE_LABELS).map((key) => ({
        key,
        label: RESOURCE_LABELS[key],
        value: Number(this.resources[key]) || 0
      }))
    },

    assetCount() {
      const list = this.player.assets
      return Array.isArray(list) ? list.length : 0
    },

    /**
     * 名下资产的购入价合计。
     *
     * 算法从 game/wealth.js 借，不在这里再写一遍 reduce：
     * 那个函数只读 state.player.assets，所以传一个最小壳子即可，
     * 不必把整份 state 塞进 props——组件要的是"这几件值多少"，
     * 不是"这一局现在是什么样"。
     */
    assetValue() {
      return totalAssetValue({ player: this.player })
    },

    illicit() {
      return Number(this.player.illicitWealth) || 0
    },

    /**
     * 判词拆段。**只读 gameOverReason，不碰存档，也不改写一个字**。
     *
     * 落马那两条（留置 / 立案审查）的判词本来就是两造对峙的结构：
     * 前面是他那套说辞，后面从"法院最终认定"起是驳斥。按这个短语切开，
     * 两段各自成立，末尾再补一句收束。
     *
     * 红色通缉与机场被拦**不拆**：那两条判词通篇是叙述，
     * 没有"他说了什么"，也没有一句法院的驳斥，硬拆只会拆出一个
     * 文案里根本不存在的边界，读起来像两句被裁开的半句话。
     *
     * 退休、平安落地、因公殉职那三条更没有法院——他不是被组织否定的，
     * 是到点了、或者累垮了。给它们套"你辩解称"是把一份正常的
     * 人事结论写成了判决书，所以只出结论段。
     */
    verdictParagraphs() {
      const reason = String(this.gameStatus.gameOverReason || '').trim()
      if (!reason) return []

      if (TRIED_SKINS.indexOf(this.skin) === -1) {
        return [{ kind: 'conclusion', label: '', text: reason }]
      }

      let body = reason
      const hasFinal = body.slice(-FINAL_LINE.length) === FINAL_LINE
      if (hasFinal) body = body.slice(0, -FINAL_LINE.length).trim()

      const out = []
      const at = body.indexOf(RULING_LEAD)
      if (at > 0) {
        out.push({ kind: 'defense', label: '你辩解称', text: body.slice(0, at).trim() })
        out.push({ kind: 'ruling', label: RULING_LEAD, text: stripRulingLead(body.slice(at)) })
      } else {
        out.push({ kind: 'ruling', label: '', text: body })
      }
      out.push({ kind: 'final', label: '', text: FINAL_LINE })
      return out
    }
  },

  methods: {
    money(amount) {
      return formatMoney(amount)
    }
  }
}

/**
 * 驳斥句自带"法院最终认定，"这个引子，而上面已经把它作为小标题单独摆了一行。
 * 不去掉就会变成"法院最终认定 / 法院最终认定，对夹没有行贿能力……"。
 *
 * 只在**真的**以它开头时才削，削不到就原样返回：文案改了形状的时候，
 * 这里退化成多印半句，而不是把半句话吃掉。
 */
function stripRulingLead(text) {
  return text.replace(/^法院最终认定[，,：:]?\s*/, '')
}
</script>

<style scoped>
/*
 * ── 为什么配色是**每套皮肤一组局部变量**，不复用 styles/theme.css 的令牌 ──
 * 全站令牌只有一个答案："档案纸 + 体制红"。而结算画面要按结局换皮肤：
 * 落马是深灰的、跑路是深蓝的——四套里有两套跟纸底**正好相反**，
 * 文字一色一底全都要跟着翻。硬把它们塞进令牌，等于让令牌去回答
 * "这张纸是什么颜色"之外的第二个问题，以后每加一个结局都要动全局调色板。
 * 所以这里自成一套变量，只在这一屏内生效；皮肤段落因此只剩"换一组值"，
 * 不必把每条规则各写四遍。
 *
 * 米黄纸底那套（retire）仍沿用全站令牌——那本来就是纸，与全站同源，
 * 也就该跟着全站一起变。
 *
 * 三处硬性要求贯穿全篇：无圆角、无阴影、宋体。
 */

.game-over {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3000; /* 压在 el-dialog（2000 起）之上，结算画面是最后一层 */
  overflow-y: auto;
  padding: 32px 20px;
  box-sizing: border-box;
  display: flex;
  font-family: 'Songti SC', 'SimSun', 'Noto Serif SC', serif;
}

.report {
  width: 100%;
  max-width: 1000px;
  box-sizing: border-box;
  border-radius: 0;
  box-shadow: none;
  /* margin:auto 而不是 align-items:center：
     内容比屏幕高的时候，居中对齐会把**顶部**截掉且滚不上去——
     而结算画面在小屏笔记本上正好会超过一屏。margin:auto 两边都居中，
     装不下时又退化成正常滚动，是这两件事唯一的共同解。 */
  margin: auto;
}

/* ══════════════ 抬头 ══════════════ */
.report-head {
  padding: 30px 34px 20px;
  text-align: center;
  border-bottom: 3px solid var(--f-accent); /* 红头文件那一杠，也是全屏唯一的 3px 实线 */
}

.report-org {
  margin: 0 0 12px;
  font-size: 12px;
  letter-spacing: 4px;
  text-indent: 4px; /* 抵消末字后面多出来的字距，否则整行看着偏左 */
  color: var(--f-sub);
}

.report-title {
  margin: 0 0 12px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--f-accent);
}

.report-no {
  margin: 0;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--f-sub);
}

/* ══════════════ 信息区：单栏，三块 ══════════════ */
.report-body {
  padding: 0 34px;
}

.block {
  padding: 20px 0 22px;
}

/* 块与块之间用淡红虚线分段。用虚线不用实线，是因为这一屏已经有一条
   3px 实线（抬头那条），再来几条会跟它抢"这里是边界"的意思 */
.block + .block {
  border-top: 1px dashed var(--f-line);
}

.block-title {
  position: relative;
  margin: 0 0 14px;
  padding-left: 12px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--f-accent);
}

/* 标题前面那道 3px 竖线。用伪元素而不是 border-left，
   是为了让它只跟文字一样高——border-left 会跟着行框撑满整行 */
.block-title::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  width: 3px;
  height: 14px;
  margin-top: -7px;
  background-color: var(--f-accent);
}

/* ── 履历：两列 ── */
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  column-gap: 32px;
}

/* ── 核心资源：每行三个，数值等宽 ── */
.res-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  column-gap: 32px;
}

.cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
  line-height: 28px;
  font-size: 13px;
}

.cell dt {
  flex: 0 0 auto;
  color: var(--f-sub);
}

.cell dd {
  margin: 0;
  flex: 1 1 auto;
  text-align: right;
  font-weight: 700;
  color: var(--f-ink);
  word-break: break-all;
}

/* 只有资源那一块要等宽：同一列上下对齐，扫一眼就能比大小。
   履历那块的 dd 是文字（职级、单位名），等宽反而难读 */
.res-grid .cell dd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace;
}

/* ── 财产与结论：单列，数字右对齐 ── */
.rows {
  margin: 0;
}

.row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-height: 28px;
  line-height: 28px;
  font-size: 13px;
}

.row dt {
  flex: 0 0 auto;
  color: var(--f-sub);
}

.row dd {
  margin: 0;
  flex: 1 1 auto;
  text-align: right;
  font-weight: 700;
  color: var(--f-ink);
  word-break: break-all;
}

.row .sub {
  font-weight: 400;
  opacity: 0.7;
}

/* 高风险与涉案金额：这两处必须自己跳出来，玩家扫一眼就知道钱在哪、
   风险在哪。其余数字都是中性叙述，不抢注意力。
   用的不是 --f-accent：殉职那套皮肤的档案色是深灰（见下），
   可钱和风险在**任何**一套皮肤下都必须是红的——它是一条警告，
   不是版式的一部分。两个变量因此不能合并。 */
.row dd.is-risk,
.cell dd.is-risk {
  color: var(--f-alert);
}

/* ══════════════ 结局横幅（通栏） ══════════════ */
.ending-banner {
  margin: 0;
  height: 48px;
  line-height: 48px;
  width: 100%;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 4px;
  text-indent: 4px;
  color: #fff;
}

.skin-retire .ending-banner { background-color: #2e7d32; }
/* 涉险过关的横幅：同一族里的暗绿（#2E5A3A），比光荣退休那颗墨绿（#2e7d32）
   暗一档、也灰一档。两个绿并排时不放在一起比是分不出来的，
   但这一屏一次只出现一个——玩家看到的是"绿"，读到的字不一样，
   而**重复看到**这两屏的老玩家会记住深浅的差别。
   纸面刻意与 retire 共用一组变量（见下面的 .skin-retire, .skin-narrow）：
   组织上给他的就是一份干净人的履历，档案纸没有理由长得不一样。 */
.skin-narrow .ending-banner { background-color: #2e5a3a; }
/* 落马横幅与跑路统一用体制红。
   原来是 #8b0000，压在 #1c1c1c 的页底上只有 1.70:1——和跑路那个深蓝
   是同一个毛病，只是深红配深灰不扎眼，所以第一轮没看出来。
   代价说清楚：这两条结局的横幅从此同色，"留置"和"通缉"不再靠横幅区分，
   改由页底（深灰 / 深蓝）和横幅上那八个字承担。 */
.skin-purged .ending-banner { background-color: #c0392b; }
/* 跑路横幅用体制红而不是深蓝。
   量过：原来那个 #1a237e 压在 #0d1b2a 的页底上只有 1.31:1 —— 两个蓝挨在一起，
   横幅确实"陷"进去了。提亮到 #283593 也只到 1.67:1，**没解决问题**；
   要跨过 3:1 这道坎，蓝得亮到 #1565C0（3.03:1）才勉强够。
   与其把一个冷色硬提亮，不如换暖色：体制红 #c0392b 有 3.20:1，一步到位，
   而且这条结局的名字里本来就写着"红色通缉"。
   它和落马那条的 #8b0000 仍是两个红——一个暗沉一个扎眼，
   加上页底一深灰一深蓝，两者不会看混。 */
.skin-flee .ending-banner { background-color: #c0392b; }
.skin-obit .ending-banner { background-color: #424242; }
/* 免职的横幅用赭石（#8a6d3b）而不是体制红。
   横幅上的红在这份文件里已经是一个**结论**：落马、通缉都用它，
   意思是"组织上定了你的罪"。而免职恰恰是"查过了，没查出问题"——
   用同一个红，等于把免职说成落马，而这两条结局的区别正是这次要立起来的那条线。
   赭石在浅灰底（#d9dbdd）上是 4.4:1，白字压在上面 4.2:1，
   既不扎眼也不至于糊掉，读起来像一份人事通知而不是一份判决书。
   底下那颗"接受安排"仍然是全站统一的红按钮——它是**操作**不是结论，
   殉职那套皮肤下面也是同一颗，这里不跟着皮肤走。 */
.skin-dismissed .ending-banner { background-color: #8a6d3b; }

/* ══════════════ 判词 ══════════════ */
.verdict-block {
  padding: 24px 34px 4px;
}

.verdict-para + .verdict-para {
  margin-top: 16px;
}

.verdict-label {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--f-sub);
}

.verdict {
  margin: 0;
  font-size: 14px;
  line-height: 1.8;
  text-indent: 2em;
}

/* 他说的那套说辞：退到灰色，正常字重 */
.verdict-para.is-defense .verdict {
  color: var(--f-defense);
}

/* 法院驳回去的那段：跳出来，加粗，用体制红 */
.verdict-para.is-ruling .verdict-label,
.verdict-para.is-ruling .verdict {
  color: var(--f-accent);
}

.verdict-para.is-ruling .verdict {
  font-weight: 700;
}

.verdict-para.is-final .verdict {
  text-align: center;
  font-weight: 700;
  font-size: 15px;
  text-indent: 0;
  letter-spacing: 2px;
  margin: 12px 0;
  color: var(--f-ink);
}

/* ══════════════ 按钮区 ══════════════ */
.report-foot {
  padding: 26px 34px 30px;
  text-align: center;
}

.restart-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

/* 用原生 button 而不是 el-button：这一屏要的是"一枚红章"，
   Element 那套圆角、内边距、相邻按钮外边距得逐条覆盖掉才轮得到
   这里的高 44px / 宽 160px，覆盖的过程比直接就手写长得多，
   而且以后升级 Element 还得再对一遍。点击行为与 el-button 无异。 */
.archive-btn {
  display: inline-block;
  box-sizing: border-box; /* 「再想想」那枚带 1px 描边，不这样写它会比主按钮高 2px */
  width: 160px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background-color: #c0392b;
  color: #fff8f3;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 3px;
  text-indent: 3px;
  cursor: pointer;
}

.archive-btn:hover {
  background-color: #a93226;
}

.archive-btn.is-ghost {
  background-color: transparent;
  border: 1px solid var(--f-line);
  color: var(--f-sub);
}

.archive-btn.is-ghost:hover {
  background-color: transparent;
  border-color: var(--f-accent);
  color: var(--f-accent);
}

/* 二次确认的那句话，宽度跟着上面的判词走，两段文字左右齐平 */
.restart-ask {
  margin: 0 auto 16px;
  max-width: 720px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--f-sub);
  text-align: left;
  text-indent: 2em;
}

.foot-note {
  margin: 14px 0 0;
  font-size: 11px;
  letter-spacing: 1px;
  color: var(--f-sub);
}

/* ══════════════ 皮肤一：光荣退休 / 平安落地 / 涉险过关 ══════════════
   米黄纸底。这是全站的"正常态"，与档案纸同源，所以直接用令牌。
   涉险过关（narrow）与它们共用这一组变量，**有意为之**：
   组织上给他的就是一份干净人的履历——职级、单位、结论都跟光荣退休一样，
   区别只在横幅那一个颜色和判词的最后两句。给这一档换一张纸，
   等于替他宣布"我们查过你了"，而这一档的全部意思恰恰是"谁也没查出来"。 */
.skin-retire,
.skin-narrow {
  --f-flood: #ece5d8;
  --f-bg: #fdfbf7;
  --f-ink: var(--ink);
  --f-sub: var(--ink-sub);
  --f-accent: var(--gov-red);
  --f-alert: var(--gov-red);
  --f-line: var(--gov-red-line);
  --f-defense: #8a7b69;
  background-color: var(--f-flood);
}

/* ══════════════ 皮肤二：落马 ══════════════
   深灰底、判词区红字。整张纸暗下去，红色是这份文件里
   唯一还亮着的东西——它就是结论。 */
.skin-purged {
  --f-flood: #141414;
  --f-bg: #1c1c1c;
  --f-ink: #e8e4de;
  --f-sub: #9a9188;
  /* 暗底上的红要提亮一档，否则 #c0392b 在 #1c1c1c 上糊成一团 */
  --f-accent: #e2685a;
  --f-alert: #e2685a;
  --f-line: rgba(226, 104, 90, 0.22);
  /* 辩解段那点灰也要提亮：#8a7b69 在深灰上对比度只有 4.3:1，
     十四号字读起来发虚 */
  --f-defense: #9c8b77;
  background-color: var(--f-flood);
}

/* ══════════════ 皮肤三：红色通缉令 ══════════════
   深蓝底、白字。人已经出去了，那份文件不再是"组织对你的结论"，
   而是别人在通缉你。 */
.skin-flee {
  --f-flood: #071322;
  --f-bg: #0d1b2a;
  --f-ink: #f0f4fa;
  /* 辩解段的暖灰搬到深蓝上会发浑，这里换成同明度的冷灰 */
  --f-sub: #93a9d6;
  --f-accent: #ff8b7a;
  --f-alert: #ff8b7a;
  --f-line: rgba(255, 139, 122, 0.22);
  --f-defense: #9fb0c8;
  background-color: var(--f-flood);
}

/* ══════════════ 皮肤四：倒在工作岗位上 ══════════════
   白底黑细框。全站唯一一处**不用体制红**的正经结局：
   他不是被组织否定的，是累垮的。用红反而像是判了他的罪——
   抬头那条线、块标题那道竖线，在这套皮肤下一律沉成深灰。
   但钱和风险照样是红的（见 --f-alert 的说明）：那是警告，不是版式。 */
.skin-obit {
  --f-flood: #ededed;
  --f-bg: #ffffff;
  --f-ink: #111111;
  --f-sub: #6f6f6f;
  --f-accent: #1f1f1f;
  --f-alert: var(--gov-red);
  --f-line: rgba(31, 31, 31, 0.22);
  --f-defense: #8a7b69;
  background-color: var(--f-flood);
}

/* ══════════════ 皮肤五：免职闲赋 ══════════════
   冷灰纸底、赭石作版式色。和另四套都不同源，这是有意的：
   它既不是"到龄善终"（那套是暖米黄），也不是"组织定了你的罪"（那套是深灰红字）。
   一张冷灰的人事通知，说的正是这件事——组织上没查出你什么，
   但也不再让你坐在这个位子上。
   钱和风险照样用红（--f-alert），理由与殉职那套同：那是警告读数，不是版式。 */
.skin-dismissed {
  --f-flood: #d9dbdd;
  --f-bg: #f5f6f7;
  --f-ink: #1b1e21;
  --f-sub: #63686d;
  /* 版式色取横幅同款的赭石：抬头那条线、块标题那道竖线都跟着它走，
     整张纸才是同一种"人事文件"的语气 */
  --f-accent: #8a6d3b;
  --f-alert: var(--gov-red);
  --f-line: rgba(138, 109, 59, 0.28);
  --f-defense: #8a7b69;
  background-color: var(--f-flood);
}

/* 纸面。五套皮肤共用这一条，各自只换 --f-bg 与描边。
   color 也定在这里，不让它一路继承到 body——全站正文色是墨色，
   落到深灰、深蓝那两套皮肤上就是墨字压墨底，一个字都看不见。 */
.report {
  background-color: var(--f-bg);
  color: var(--f-ink);
}

.skin-obit .report {
  border: 1px solid #1f1f1f;
}

/* ══════════════ 窄屏 ══════════════ */
@media (max-width: 768px) {
  .game-over {
    padding: 20px 0;
  }

  .report {
    width: 92vw;
    max-width: 92vw;
  }

  .report-head {
    padding: 22px 18px 16px;
  }

  .report-title {
    font-size: 17px;
  }

  .report-body {
    padding: 0 18px;
  }

  /* 两列并排时每列只剩 40 来个像素，职级名会被折成两行，
     还不如老老实实一行一项 */
  .grid-2 {
    grid-template-columns: minmax(0, 1fr);
  }

  .res-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ending-banner {
    height: 40px;
    line-height: 40px;
    font-size: 15px;
  }

  .verdict-block {
    padding: 20px 18px 4px;
  }

  .verdict,
  .verdict-para.is-final .verdict {
    font-size: 13px;
  }

  .report-foot {
    padding: 22px 18px 26px;
  }

  .archive-btn {
    width: 100%;
    height: 44px;
  }
}
</style>
