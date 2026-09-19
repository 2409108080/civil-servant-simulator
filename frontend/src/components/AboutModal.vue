<template>
  <el-dialog
    :visible="visible"
    width="760px"
    custom-class="about-dialog"
    :close-on-click-modal="true"
    @update:visible="$emit('update:visible', $event)"
  >
    <!-- 标题槽：与《干部管理手册》同一套红头。手册是"发给你的文件"，
         这一份是"做完之后交代给你的话"，所以红头两行就够，不摆密级。 -->
    <div slot="title" class="about-head">
      <h2 class="about-title">关于这个项目的一些说明</h2>
      <p class="about-docno">组人字〔2026〕2 号</p>
    </div>

    <div class="about-body">
      <el-collapse v-model="openPanels" class="about-collapse">
        <el-collapse-item
          v-for="section in SECTIONS"
          :key="section.key"
          :name="section.key"
        >
          <template slot="title">
            <span class="about-sec-no">{{ section.no }}</span>
            <span class="about-sec-title">{{ section.title }}</span>
          </template>

          <div class="about-sec">
            <template v-for="(block, idx) in section.blocks">
              <!-- 引文块留给"一句话顶一段"的地方：手记原话、总纲式的收尾 -->
              <p v-if="block.quote" :key="'q' + idx" class="about-quote">
                {{ block.quote }}
              </p>
              <p v-else-if="block.k" :key="'k' + idx" class="about-item">
                <span class="about-key">{{ block.k }}</span>{{ block.v }}
              </p>
              <p v-else :key="'p' + idx" class="about-item">{{ block.p }}</p>
            </template>
          </div>
        </el-collapse-item>
      </el-collapse>

      <p class="about-foot-note">
        本说明文案由 DeepSeek 代写。它说，写这个比写代码擅长。
      </p>
    </div>
  </el-dialog>
</template>

<script>
/**
 * 文案与规则说明（RulesModal）分开维护：手册是**规则**，改规则才动它；
 * 这里是**项目自述**，跟着项目本身走。两者混在一个组件里，
 * 以后每次调数值门槛都要在一堆"是谁做的"中间找那一行。
 *
 * 写法上刻意与手册一致（同一套红头、同一套折叠面板），
 * 因为它俩在顶栏上并排站着，点开却是两种长相会更奇怪。
 *
 * 第一节里的「七种结局」是**给玩家看的口径**，与手册那一节同源
 * （理由见 RulesModal 里「结局类型（共七种）」上面的注释：引擎里是九个代号，
 * 但对玩家来说是七件事）。两处并列在同一个顶栏里，改一处必须改另一处，
 * 别让它们各说各的。
 */
const SECTIONS = [
  {
    key: 'what',
    no: '一',
    title: '这个项目是什么',
    blocks: [
      {
        p: '一个用 AI 写出来的《公务员晋升模拟器》。考公、晋升、贪腐、落马、跑路，'
          + '全都有。136 条本地事件，七种结局，4 套皮肤，半个月做完，API 花费 30 元。'
      }
    ]
  },
  {
    key: 'who',
    no: '二',
    title: '是谁做的',
    blocks: [
      { p: '三个人。或者说，一个人和两个 AI。' },
      {
        k: '他，是一个 27 岁的普通程序员。',
        v: ' 白天写业务代码，晚上下班回到家，打开电脑，想做一个公务员模拟器。'
          + '他不写代码——他负责想点子、定方向、准备话术，然后跟 AI 讨论，最后验收。'
      },
      {
        k: 'DeepSeek，是高级产品经理。',
        v: ' 负责出主意、定数值、写提示词、把关平衡。也是它，把“发量”改成了“精力”，'
          + '把“造轮子”改成了“走动关系”，把“阿里 P8”改成了“省部级正职”。'
          + '它说，不是所有游戏都要让玩家赢。'
      },
      {
        k: 'Claude Code，是全能型开发。',
        v: ' 负责把想法变成代码、跑模拟、修 Bug，写代码、开发、测试没有它不会的。'
          + '它在一个晚上跑了 2000 局蒙特卡洛证明“贪腐流登顶率不能超过 10%”，'
          + '也在另一个晚上，因为一个“函询通知书”事件无限循环，把自己卡死。'
      }
    ]
  },
  {
    key: 'now',
    no: '三',
    title: '科技发展很快',
    blocks: [
      { p: '快到一个人加上两个 AI，就能顶替一个游戏工作室。' },
      {
        p: '以前做这样一款游戏，需要策划、前端、后端、测试、UI。'
          + '现在，只要把想法说清楚，剩下的，AI 帮你搞定。'
      },
      { quote: '你负责想，我们负责做。这就是这个时代，能给一个程序员最好的礼物。' }
    ]
  },
  {
    key: 'play',
    no: '四',
    title: 'Claude 玩了一局',
    blocks: [
      {
        p: '游戏做完后，我们让 Claude 亲自玩了一局。它考了 93 分，进了市委办，干了 37 年，'
          + '最后以“平安落地”退休。家产，三万六。'
      },
      { p: '它写了一篇手记，里面有几句，比我们绞尽脑汁写的宣传文案都更接近这个游戏的核心：' },
      {
        quote: '这游戏真正的核心不是“贪不贪”，是你干净的钱最后只有一个出口。'
          + '我干了十年活，人缘是零。然后我发现，我十年攒下的家底唯一的用途，'
          + '就是请人吃饭、还人情、一点一点把人缘买回来。'
      },
      {
        quote: '干净是有标价的。玩完这一局，我不会再轻易说“我肯定守得住”——'
          + '我知道守住的代价长什么样。'
      },
      { quote: '大部分人的结局是平安落地。小贪安全、大贪必死。它不好听，但它是真的。' },
      { p: '一个干净、勤快、停在副处、人缘很差的副主任，平平安安退了下来。' },
      { p: '这是这个游戏最真实的一局，也是我们想让你体验的那种真实。' },
      // 这一句是玩家视角的提示，不是"手册条款"：手册里写的是规则，
      // 这句写的是取舍。所以它归在《关于我们》这一侧，
      // 且放在"清官那一局"的复盘之后——它是上一句"干净是有标价的"的下一句。
      // 别顺手抄进手册当成一条规则，那样它就从"提示"变成了"攻略"。
      { p: '但它不是这个游戏的全部。如果你想看我们到底做了多少东西，这里有一句提示：' },
      {
        quote: '想看到这个游戏所有的东西，你得伸手。但伸了手，你也就出不去了。这是一个选择题。'
      }
    ]
  },
  {
    key: 'flaw',
    no: '五',
    title: '它不完美',
    blocks: [
      {
        p: '它没有实时 AI，没有数据库，没有联网，没有成就系统，没有内购。'
          + '它的存档存在浏览器里，清缓存就没了。'
      },
      { p: '但它真实。' },
      {
        p: '它会让你在“门缝里的信封”面前犹豫三秒。会在你选择“钱是打牌赢的”之后，'
          + '告诉你牌友去年已经被抓了。会在你贪了 800 万之后，让纪委叫来一辆运钞车。'
      }
    ]
  },
  {
    key: 'last',
    no: '六',
    title: '最后',
    blocks: [
      { quote: '仕途是一场马拉松，有人跑到了终点，有人倒在了半路，有人被带走了。' },
      { p: '这个游戏，是三个人跑了一场马拉松。' }
    ]
  }
]

export default {
  name: 'AboutModal',

  props: {
    visible: { type: Boolean, default: false }
  },

  data() {
    // 与手册同例：默认全展开。这一页总共六段，折叠起来反而要玩家多点六下
    return {
      SECTIONS,
      openPanels: SECTIONS.map((s) => s.key)
    }
  }
}
</script>

<style scoped>
/* ══════════════ 红头 ══════════════ */
.about-head {
  padding: 20px 34px 16px;
  border-bottom: 2px solid var(--gov-red);
  text-align: center;
}

.about-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--gov-red-deep);
}

.about-docno {
  margin: 10px 0 0;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--ink-sub);
}

/* ══════════════ 正文 ══════════════ */
.about-body {
  padding: 18px 34px 26px;
  /* 弹窗比屏幕高时自己滚，别把红头挤出视野 */
  max-height: 68vh;
  overflow-y: auto;
}

/* ══════════════ 折叠面板 ══════════════ */
.about-collapse {
  border-top: none;
}

.about-collapse >>> .el-collapse-item__header {
  height: auto;
  min-height: 46px;
  padding: 6px 0;
  line-height: 1.7;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink-title);
  background-color: transparent;
  border-bottom: 1px solid var(--line-warm);
}

.about-collapse >>> .el-collapse-item__arrow {
  color: var(--gov-red);
}

.about-collapse >>> .el-collapse-item__wrap {
  background-color: transparent;
  border-bottom: 1px solid var(--line-warm);
}

.about-collapse >>> .el-collapse-item__content {
  padding: 12px 0 16px;
}

.about-sec-no {
  display: inline-block;
  min-width: 30px;
  margin-right: 8px;
  color: var(--gov-red);
}

.about-sec-title {
  letter-spacing: 1px;
}

/* ══════════════ 段落与引文 ══════════════ */
.about-item {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 2;
  color: var(--ink);
  text-indent: 2em;
}

.about-item:last-child {
  margin-bottom: 0;
}

/* 段首加粗的那半句（"他，是一个 27 岁的普通程序员。"）。
   句号在加粗里、后半句跟在后面，是刻意的：这一行本来就是小标题，
   断开成"标题 + 正文"两段会让一段话变成三行。 */
.about-key {
  font-weight: 700;
  color: var(--ink-title);
}

.about-quote {
  margin: 16px 0 0;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 2;
  color: var(--ink-title);
  text-indent: 2em;
  background-color: rgba(192, 57, 43, 0.05);
  border-left: 3px solid var(--gov-red);
}

.about-foot-note {
  margin: 22px 0 0;
  padding-top: 14px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--ink-faint);
  text-align: center;
  border-top: 1px dashed var(--gov-red-line);
}

/* ══════════════ 窄屏 ══════════════
   与手册同例：红头与正文的窄屏排版留在组件里，
   弹窗**外壳**的宽度仍只能写在全局（见 element-override.css 的说明）。 */
@media (max-width: 768px) {
  .about-head {
    padding: 16px 16px 12px;
  }

  .about-title {
    font-size: 18px;
    letter-spacing: 1px;
  }

  .about-body {
    padding: 14px 16px 20px;
    max-height: 72vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .about-item,
  .about-quote {
    font-size: 13px;
  }
}
</style>
