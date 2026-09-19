<template>
  <el-dialog
    :visible="visible"
    width="760px"
    custom-class="rules-dialog"
    :close-on-click-modal="true"
    @update:visible="$emit('update:visible', $event)"
  >
    <!-- 标题槽：红头文件的「红头」部分。用了 slot 之后 Element 不再渲染
         它默认的 .el-dialog__title，样式由 .rules-head 自己接。 -->
    <div slot="title" class="rules-head">
      <p class="rules-secret">内部资料 · 注意保存</p>
      <h2 class="rules-title">《干部管理手册（内部版）》</h2>
      <p class="rules-docno">组人字〔2026〕1 号</p>
    </div>

    <div class="rules-body">
      <p class="rules-preface">
        本手册供新录用人员入职教育使用。请逐条阅读，阅后即焚（本页不支持焚毁功能）。
      </p>

      <el-collapse v-model="openPanels" class="rules-collapse">
        <el-collapse-item
          v-for="section in SECTIONS"
          :key="section.key"
          :name="section.key"
        >
          <template slot="title">
            <span class="rules-sec-no">{{ section.no }}</span>
            <span class="rules-sec-title">{{ section.title }}</span>
          </template>

          <div class="rules-sec">
            <template v-for="(item, idx) in section.items">
              <!-- 总纲这类"一句话"，单独排成引文块 -->
              <p v-if="item.quote" :key="'q' + idx" class="rules-quote">
                {{ item.quote }}
              </p>
              <p v-else :key="'i' + idx" class="rules-item">
                <span class="rules-key">{{ item.k }}</span>
                <span v-if="item.k">：</span>{{ item.v }}
              </p>
            </template>
          </div>
        </el-collapse-item>
      </el-collapse>

      <p class="rules-foot-note">
        本手册最终解释权归组织所有。组织不解释，也是解释。
      </p>
    </div>
  </el-dialog>
</template>

<script>
/**
 * 数值全部对着代码核过，写错一个字就是给玩家发假文件：
 *   威信折算 ÷10           → constants/promotion.js  AUTHORITY_PER_BONUS
 *   奥迪 A6L 50 万          → constants/assets.js     ASSET_CATALOG.car.price
 *   科级净攒 20 年          → money.js 薪级表 − gameConfig.js 季度支出
 *   退休 60 岁              → game/engine.js          TUNING.retireAge
 *   廉政风险 0~100          → constants/gameConfig.js RESOURCE_LIMITS.risk
 *   走动 1/2/5/10 万        → constants/assets.js     BALANCE_COST_BY_BAND
 *   有案底 ×5、封顶家产 50% → constants/assets.js     ILLICIT_RECORD_MARKUP
 *                                                    / RECORD_MARKUP_WALLET_CAP
 *   案底降幅 -1~3、每季一次 → constants/money.js      BALANCE.recordRiskRelief*
 *                                                    / assets.js 的季度上限
 *   平事 5~41 万、-10~-3    → constants/money.js CRISIS + game/crisis.js 的三个递推
 *   廉政审查挂起一年半      → constants/promotion.js  AUDIT_HOLD_QUARTERS = 6 季
 *   科级 40/30/30、厅级翻倍 → constants/promotion.js  PROMOTION_REQUIREMENTS
 *                             （表里键是【当前】职级，'乡科级副职'那一行
 *                              才是"提任乡科级正职"的门槛；厅局级为 82/80/72）
 */
const SECTIONS = [
  {
    key: 'goal',
    no: '一',
    title: '核心目标',
    items: [
      { k: '胜利条件', v: '晋升到省部级正职，或平安退休（60 岁）。' },
      { k: '失败条件', v: '健康归零、廉政风险触顶（100%）、落马。' },
      {
        quote: '仕途是一场马拉松，有人跑到了终点，有人倒在了半路，有人被带走了。'
      }
    ]
  },
  {
    key: 'resources',
    no: '二',
    title: '关键资源（八项）',
    items: [
      { k: '精力、健康', v: '干工作的本钱。归零则游戏结束——本钱没了，什么都没了。' },
      { k: '威信、向上管理、人缘', v: '决定你走得顺不顺。' },
      { k: '工作能力、政绩', v: '晋升的硬指标。' },
      {
        k: '廉政风险',
        v: '所有脏钱都会变成这个数字。超过上限，组织上会先找你谈谈心。'
      }
    ]
  },
  {
    key: 'promotion',
    no: '三',
    title: '晋升规则',
    items: [
      {
        k: '四项门槛',
        v: '工作能力、向上管理、人缘、政绩。任一不达标，晋升无望。'
      },
      {
        k: '威信折算名望分',
        v: '威信每 10 点，四项门槛各 +1。群众口碑也是硬通货。'
      },
      { k: '任职年限', v: '门槛达标不代表能升，还得看年限和风险。' },
      { k: '晋升是概率事件', v: '不是必然事件。条件够了也可能陪跑。' },
      {
        k: '廉政审查',
        v: '有过贪腐记录的人，提任前多一道审查。'
          + '未通过，材料挂起一年半，期间不列入提任考虑。'
      },
      {
        k: '案底的影响',
        v: '有案底是永久标记。你走关系时降风险比别人少（-1~3 而不是 -5~10），'
          + '每季度也最多走一次。这不是每季度吸血，是你比别人更疼。'
      },
      {
        v: '具体门槛随职级阶梯上升，且增幅越来越大。以科级为例，'
          + '晋升乡科级正职大约需要工作能力 40、向上管理 30、人缘 30；'
          + '到了厅局级，门槛会翻倍不止。具体数值以左侧『提任研判』面板为准'
          + '——那里会实时显示你还差多少。'
      }
    ]
  },
  {
    key: 'money',
    no: '四',
    title: '金钱与风险',
    items: [
      {
        k: '工资来源',
        v: '按职级发放，饿不死但发不了财。买一辆奥迪 A6L，科级干部要不吃不喝攒 20 年。'
      },
      { k: '季度支出', v: '养家糊口、应酬往来，每季度自动扣除。' },
      {
        k: '贪腐诱惑',
        v: '门缝里的信封、老领导组的局、土特产包装盒——伸手之前想清楚，'
          + '这一次伸手，等于你几年工资。'
      },
      { k: '财产申报', v: '定期查账，差额过大触发立案审查。' },
      {
        k: '走动关系',
        v: '花行动力和金钱，压下廉政风险。成本按职级递增'
          + '（科级 1 万 / 处级 2 万 / 厅级 5 万 / 省部级 10 万），'
          + '有案底 ×5，但封顶为当前家产的 50%。'
      },
      {
        k: '平事成本',
        v: '组织上跟你谈话时，可以花钱平事。但成本逐次递增'
          + '（5 / 8 / 12 / 18 / 27 / 41 万），效果逐次递减（-10 到 -4，封顶 -3）。'
          + '找关系找多了，人家也不敢再全力保你。'
      },
      {
        k: '退赃机制',
        v: '组织给你一次机会。第一次认罪退赃，降一级、保公职；第二次没有退路。'
      },
      {
        k: '风声预警',
        v: '赃款到 300 万、廉政风险到 40 时，会有人给你打一通电话。'
          + '这一辈子只响一次。走：成功率随赃款递增（两成起，封顶八成），'
          + '先烧掉三成赃款铺路，成则红通，败则机场被拦。'
          + '不走：下个季度直接立案审查，不再走财产申报。'
      }
    ]
  },
  {
    key: 'endings',
    no: '五',
    // 「七种」是**给玩家看的分类**，不是 ENDINGS 里的代号数。
    // 代码里是九个代号：落马那条线上「纪委监委留置」与「立案审查调查」
    // 是两个代号、一份结论；跑路那条线上「红色通缉令」与「机场被拦」同理。
    // 对着玩家把它们拆成九个，是拿内部账目当说明书用——
    // 他不会因为这两者代号不同就认为自己遇到了两件事。
    // 反过来，光荣退休与涉险过关**要**分开列：代号不同，玩家心里那件事也不同——
    // 一个是到站下车，一个是夜里听见敲门声。这本手册列的是玩家心里那几件事，
    // 所以这一条按玩家的感受拆，上一条按组织上的结论合。
    // 别拿 ENDINGS 的键数来"修正"这个数字。
    title: '结局类型（共七种）',
    items: [
      { k: '光荣退休', v: '到站下车，功德圆满。' },
      {
        k: '涉险过关',
        v: '你登顶了，账上却有一笔说不清的钱。组织没查出来，但你自己知道。'
      },
      { k: '平安落地', v: '没上去，但也没进去。' },
      { k: '落马', v: '该来的总会来。' },
      { k: '跑路', v: '另一种落马，只是换了个国家。' },
      { k: '倒在工作岗位', v: '因公殉职，档案上留下一行字。' },
      {
        k: '免职闲赋',
        v: '风险触顶，或被立案审查但未发现违纪违法问题。免去职务，另行安排。'
      },
      { quote: '人生没有存档，但游戏有。点重新开始，下一局，希望你做个好人。' }
    ]
  }
]

export default {
  name: 'RulesModal',

  props: {
    visible: { type: Boolean, default: false }
  },

  data() {
    // 默认全展开：说明书的意义在于被读到，不在于被折叠得好看
    return {
      SECTIONS,
      openPanels: SECTIONS.map((s) => s.key)
    }
  }
}
</script>

<style scoped>
/* ══════════════ 红头 ══════════════ */
.rules-head {
  padding: 20px 34px 16px;
  border-bottom: 2px solid var(--gov-red);
  text-align: center;
}

.rules-secret {
  margin: 0 0 10px;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--gov-red);
}

.rules-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--gov-red-deep);
}

.rules-docno {
  margin: 10px 0 0;
  font-size: 12px;
  letter-spacing: 1px;
  color: var(--ink-sub);
}

/* ══════════════ 正文 ══════════════ */
.rules-body {
  padding: 18px 34px 26px;
  /* 弹窗比屏幕高时自己滚，别把红头挤出视野 */
  max-height: 68vh;
  overflow-y: auto;
}

.rules-preface {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 2;
  color: var(--ink-sub);
  text-indent: 2em;
}

/* ══════════════ 折叠面板 ══════════════ */
.rules-collapse {
  border-top: none;
}

.rules-collapse >>> .el-collapse-item__header {
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

.rules-collapse >>> .el-collapse-item__arrow {
  color: var(--gov-red);
}

.rules-collapse >>> .el-collapse-item__wrap {
  background-color: transparent;
  border-bottom: 1px solid var(--line-warm);
}

.rules-collapse >>> .el-collapse-item__content {
  padding: 12px 0 16px;
}

.rules-sec-no {
  display: inline-block;
  min-width: 30px;
  margin-right: 8px;
  color: var(--gov-red);
}

.rules-sec-title {
  letter-spacing: 1px;
}

/* ══════════════ 条款与引文 ══════════════ */
.rules-item {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 2;
  color: var(--ink);
}

.rules-item:last-child {
  margin-bottom: 0;
}

.rules-key {
  font-weight: 700;
  color: var(--ink-title);
}

.rules-quote {
  margin: 16px 0 0;
  padding: 12px 16px;
  font-size: 14px;
  line-height: 2;
  color: var(--ink-title);
  text-indent: 2em;
  background-color: rgba(192, 57, 43, 0.05);
  border-left: 3px solid var(--gov-red);
}

.rules-foot-note {
  margin: 22px 0 0;
  padding-top: 14px;
  font-size: 12px;
  line-height: 1.9;
  color: var(--ink-faint);
  text-align: center;
  border-top: 1px dashed var(--gov-red-line);
}

/* ══════════════ 窄屏 ══════════════
   红头与正文的窄屏排版放在这里，而不是 element-override.css：
   那边写 `.rules-dialog .rules-head` 与本文件的 `.rules-head[data-v-x]`
   权重相同，谁赢看打包顺序——不该拿版面赌这个。
   弹窗**外壳**的宽度仍然只能写在全局（见 element-override.css 的说明）。 */
@media (max-width: 768px) {
  .rules-head {
    padding: 16px 16px 12px;
  }

  .rules-title {
    font-size: 18px;
    letter-spacing: 1px;
  }

  .rules-body {
    padding: 14px 16px 20px;
    /* 手册比一屏长得多，正文可滚（与事件弹窗同理）。
       留得比事件弹窗少，是因为它上面还顶着一块红头。 */
    max-height: 72vh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .rules-item,
  .rules-quote {
    font-size: 13px;
  }
}
</style>
