/**
 * 立案审查调查决定书（终局）。
 *
 * ── 它和危机公关的区别 ───────────────────────────────────────
 * 危机公关是"组织上先跟你通个气"，是给你机会；这一条是**已经定了性**。
 * 触发条件是财产申报算出来的差额越过红线（见 game/wealth.js），
 * 不是风险值——风险高只说明有人看不惯你，差额大才说明你的钱解释不通，
 * 后者才是纪委立案的依据。
 *
 * ── 狡辩的成功率为什么必须递减 ──────────────────────────────
 * 每 100 万非法所得扣 3 个百分点。这条曲线的意思不是"贪得多所以运气差"，
 * 而是**贪得多，能自圆其说的空间就越小**：
 *   · 5 万：冰箱里一个塑料袋，说是打牌赢的，办案人员还得费点劲去证伪。
 *   · 500 万：冷藏室都塞满了，年收入十几万的人，这话没人信。
 *   · 800 万：运钞车都来了，任何解释都是笑话。
 * 所以三个狡辩选项分别在 667 万 / 500 万 / 333 万处归零，
 * 越过这条线之后，"认罪"是唯一还走得通的路——这正是设计意图：
 * **越贪，你能选的路越少**，最后只剩一条。
 *
 * ── 为什么从 5% 放缓到 3% ───────────────────────────────────
 * 5% 那条线下，最强的一档狡辩在 400 万就归零了。而 400 万以下
 * 根本攒不出运钞车那档画面——也就是说，**最荒唐的冰箱撑不到最荒唐的画面**，
 * 冰箱顶层成了一个设计出来却永远看不见的彩蛋。
 * 放缓到 3% 之后，贪到 600 万时最强的那档还剩 2%：低，但不是零。
 * 这不是放水，是让"赌一把"在贪到顶时**依然存在**——
 * 有 2% 可赌，玩家才会在那一屏上犹豫；直接归零，他只会觉得
 * 这条路是被系统关掉的，跟自己贪了多少无关。
 *
 * 产出的对象是标准 GameEvent（多带本地标签），复用那套关不掉的弹窗。
 */

import { formatMoney } from '@/constants/money'

export const INVESTIGATION_EVENT_ID = 'evt_investigation_filing'

/** 每 100 万非法所得，狡辩成功率扣多少（3 个百分点） */
export const EXCUSE_PENALTY_PER_MILLION = 0.03

/**
 * 狡辩成功率：基础 − (非法所得 ÷ 100万) × 3%，下限 0。
 *
 * 下限是 0 而不是某个小数字，是**刻意**的：到了那个数额，
 * 狡辩就不该有"万一呢"的幻想。选项会如实显示 0%，
 * 玩家看得见，也就不会觉得是被系统坑了。
 */
export function excuseOdds(base, illicitWealth) {
  const millions = (Number(illicitWealth) || 0) / 1000000
  const odds = Number(base) - millions * EXCUSE_PENALTY_PER_MILLION
  return Math.max(0, Math.min(1, odds))
}

/**
 * 冰箱里的景象。按非法所得分三档——**这是整个游戏最该好笑也最该冷的地方**，
 * 数字越大，画面越荒唐，而荒唐本身就是判词。
 */
const FREEZER_TIERS = [
  {
    min: 8000000,
    text: '双开门冰箱几乎被卡住，柜门只推开一条缝就顶住了，'
      + '纪委人员不得不叫来一辆运钞车。'
  },
  {
    min: 5000000,
    text: '冷藏室和冷冻室被塞得满满当当，连冷冻饺子都扔了，粗粗一数几百万。'
  },
  {
    min: 0,
    text: '在冰箱冷冻室的速冻水饺底下，搜出一个黑色塑料袋。'
  }
]

export function freezerScene(illicitWealth) {
  const amount = Number(illicitWealth) || 0
  const tier = FREEZER_TIERS.find((t) => amount >= t.min)
  return (tier || FREEZER_TIERS[FREEZER_TIERS.length - 1]).text
}

/**
 * 刑期阶梯。**必须跟着金额走**——
 * 写死一个"十二年"，贪 5 万和贪 3000 万判得一样重，那是另一种"档案局的镇长"：
 * 单个数字放在一个会变的东西旁边，看着就不对。
 *
 * 分档依据是"这笔钱在办案人员眼里是什么性质"，四档：
 *   · 50 万以下：够立案，但够不上"数额巨大"，三年。
 *   · 50 万～500 万：数额巨大。5 年起步，随金额线性走到 10 年——
 *     这一段刻意用插值而不是拍死一个数：多贪 100 万，判词就该长出一年多。
 *   · 500 万～800 万：数额特别巨大，无期。
 *   · 800 万以上：冰箱装不下了。这一档不套用统一判词模板，
 *     末尾整段放在 tail 里，由 verdictText 直接接上去。
 *
 * tail 里**不写"法院认定"**：它前面紧跟着的就是语录的驳斥，
 * 那句已经说着"法院最终认定"了，tail 再来一句就是连说两遍。
 * 开头也**不能承接前文**——原先写的是"你不仅把冰箱塞满了"，
 * 那个"不仅"是在接玩家的冰箱辩解；现在它前面接的是随机挑出来的一句
 * 哲学反思语录，"不仅"就悬在半空，成了半句话。
 */
const SENTENCE_TIERS = [
  {
    min: 8000000,
    text: '死刑，缓期两年执行',
    tail: '办案人员在你家清点了一夜，冰箱和马桶水箱都塞满了，连冷冻饺子都扔了。'
      + '判处死刑，缓期两年执行。'
  },
  { min: 5000000, text: '无期徒刑，剥夺政治权利终身' },
  // 插值档：50 万判 5 年，500 万判 10 年，中间按金额线性取整
  { min: 500000, from: 5, to: 10, spanFrom: 500000, spanTo: 5000000 },
  { min: 0, text: '有期徒刑3年' }
]

function sentenceTierOf(illicitWealth) {
  const amount = Number(illicitWealth) || 0
  return SENTENCE_TIERS.find((t) => amount >= t.min)
    || SENTENCE_TIERS[SENTENCE_TIERS.length - 1]
}

/** 插值档的年数。夹在 [from, to] 之间，越界金额不会算出离谱的数字 */
function interpolatedYears(tier, amount) {
  const span = tier.spanTo - tier.spanFrom
  const ratio = span > 0 ? (amount - tier.spanFrom) / span : 0
  const years = tier.from + (tier.to - tier.from) * ratio
  return Math.min(tier.to, Math.max(tier.from, Math.round(years)))
}

export function sentenceOf(illicitWealth) {
  const amount = Number(illicitWealth) || 0
  const tier = sentenceTierOf(amount)
  if (tier.text) return tier.text
  return `有期徒刑${interpolatedYears(tier, amount)}年`
}

/**
 * 贪官忏悔语录库。**落马判词里那段"你说……"就是从这儿来的。**
 *
 * ── 一条语录是"两句"，不是一句 ──────────────────────────────
 * 每条都带着自己的驳斥（`rebuttal`），因为**驳斥是跟着语录走的**：
 * 「对夹没有行贿能力」只能接在赤峰对夹后面，
 * 「朋友没有替你坐牢的义务」只能接在朋友暂放后面。
 * 拆成"语录池 + 驳斥池"两边各自随机，立刻就会出现
 * "你说钱是土特产。法院认定，冰箱没有行贿能力"这种串台——
 * 而且它不会报错，只会在结局海报上丢人。
 *
 * ── 为什么这五类正好能覆盖三个狡辩选项 ──────────────────────
 * 早先 `EXCUSE_VERDICTS` 里那三句（打牌赢的 / 朋友暂放 / 冰箱），
 * 本来就在这个库的"变相合法派"和"不知情派"里。所以这不是新加一层，
 * 是把它**升级成库**：按选项取的那条必须与玩家亲口说的话一致。
 *
 * 那三条在库里照旧，但**不进随机池**：它们只能由玩家自己那句话带出来，
 * 随机池是库里剩下的那几条（见 RANDOM_ENTRIES）。理由反过来也成立——
 * 没狡辩过的人不该读到"你说这是朋友暂放在你那里的"。
 *
 * ── 语气 ────────────────────────────────────────────────────
 * 全程白描，不抒情、不评论、不加感叹号。荒诞感来自"用公文体裁
 * 一本正经地驳斥一个荒唐说法"这个落差本身，一旦替玩家感叹一句，
 * 落差就没了。判词里唯一允许带情绪的位置是最后那句刑期。
 */
export const CONFESSION_GROUPS = [
  {
    key: 'childhood',
    label: '童年贫困派',
    entries: [
      {
        id: 'duijia',
        quote: '你说你小时候家里穷，父母偶尔给你和哥哥两块钱，'
          + '买八分钱一个的赤峰对夹，一家四口吃得跟过年一样。'
          + '你后来当了官，成千上万一桌的席，再也找不到那个味了。',
        rebuttal: '法院最终认定，对夹没有行贿能力，你的童年也没教会你拒腐防变。'
      }
    ]
  },
  {
    key: 'ignorance',
    label: '不知情派',
    entries: [
      {
        id: 'freezer',
        quote: '你说钱是冰箱自己长出来的。你从来不知道冰箱里有东西，'
          + '你连家里冰箱有几个抽屉都说不清。',
        rebuttal: '法院最终认定，冰箱没有行贿能力，它不会自己把行李箱塞进去。'
      },
      {
        id: 'mother_said_no',
        quote: '你说你母亲一直跟你说：不能拿人家钱，不能要人家东西。' +
          '你说你后来把这话忘了。',
        rebuttal: '法院最终认定，你说的全是谎话。你母亲的话你没忘，你只是没听。'
      },
      // 这一条不能删：EXCUSE_ENTRY 把 opt_b（"朋友暂放的，我不知道是钱。"）
      // 钉死在它身上。删了它，选 opt_b 的玩家判词会静默掉进随机——
      // 刚说完"朋友暂放的"，判词回他"你说你母亲一直说不能拿人家钱"，
      // 一眼就知道系统没在听（见 EXCUSE_ENTRY 上面的说明）。
      {
        id: 'friend',
        quote: '你说这是朋友暂放在你那里的。他当时只说出差几天，谁知道他一去不回。',
        rebuttal: '法院最终认定，朋友没有替你坐牢的义务。'
      }
    ]
  },
  {
    key: 'legit',
    label: '变相合法派',
    entries: [
      {
        id: 'gamble',
        quote: '你说这钱是打牌赢来的。你那几年手气好，逢赌必赢，牌友都叫你财神。',
        // 唯一一条要引金额的驳斥：玩家越贪，这句话越荒唐，
        // 而荒唐是靠"牌局赢不出这个数"本身说出来的，不用再补一句评论
        rebuttal: (amount) =>
          `法院最终认定，你的牌友去年已经被抓了，牌局产生不了 ¥${formatMoney(amount)} 元的利润。`
      },
      {
        id: 'six_thousand_limit',
        quote: '你说你还是有一些敬畏心的。你给自己定了一个六千的限额，' +
          '只收六千以下，不收六千以上。你说金额大了不安全，' +
          '你也不希望有那种好像被卖给别人一样的感觉。',
        rebuttal: '法院最终认定，你说的全是谎话。只收六千以下，那这么多钱又是哪来的？'
      }
    ]
  },
  {
    key: 'idealist',
    label: '理想主义派',
    entries: [
      {
        id: 'heartfelt_thanks',
        quote: '你说他们给你送钱，是因为你帮了他们，是发自内心感谢你。' +
          '你说你收下这些钱，心里没有愧疚，因为那是人家真心实意的谢意。',
        rebuttal: '法院最终认定，你说的全是谎话。他感谢的是你手里的权，不是你这个人；' +
          '你收下的是钱，丢的是底线。'
      }
    ]
  },
  {
    key: 'philosophic',
    label: '哲学反思派',
    entries: [
      {
        id: 'bury_money',
        quote: '你说你后来对着自己吼：你要钱干什么，埋你啊！' +
          '你说你疯狂的贪欲登峰造极，但你从来不知道要钱是为了什么。' +
          '你吃喝不愁，你什么都不缺，那些钱在保险柜里发霉，你却停不下来。',
        rebuttal: '法院最终认定，这个问题你问得太晚了。'
      }
    ]
  }
]

/** 语录 id → { group, entry }。按 id 取是常态，所以建一次索引，别每次遍历 */
const CONFESSION_INDEX = {}
CONFESSION_GROUPS.forEach((group) => {
  group.entries.forEach((entry) => {
    CONFESSION_INDEX[entry.id] = { group, entry }
  })
})

/**
 * 狡辩选项 → 语录 id。
 *
 * 映射到**具体某一条**，不是只映射到类别：玩家刚才说的是"打牌赢的"，
 * 判词里就必须接打牌那一条。只在类别里随机的话，
 * 说打牌的玩家会读到"你说那都是土特产"——他知道自己没说过这句话，
 * 于是刚建立的"系统记得我干了什么"当场破功。
 *
 * 这三条同时**从随机池里摘出去**（见 RANDOM_ENTRIES）：它们只该在玩家
 * 亲口说过那句话时出现。混在池子里的话，一个压根没狡辩、直接被留置的
 * 玩家会读到"你说这是朋友暂放在你那里的"——他没说过，系统替他认了。
 */
const EXCUSE_ENTRY = {
  opt_a: 'gamble',
  opt_b: 'friend',
  opt_c: 'freezer'
}

/** 被选项钉死的那几条的 id。随机池要在它们之外挑 */
const MAPPED_IDS = new Set([
  EXCUSE_ENTRY.opt_a,
  EXCUSE_ENTRY.opt_b,
  EXCUSE_ENTRY.opt_c
])

/**
 * 随机池 = 库里去掉被选项钉死的那几条，剩下的每条等概率。
 *
 * 铺平成一个 {group, entry} 的数组，是因为"先均匀挑类、再类内均匀挑条"
 * 那套在类内条数不等时会**放大**单条的那几类（曾经把哲学反思派顶到四成，
 * 跟"稀有"的初衷正好反了）。平铺之后条与条之间才是真等概率。
 *
 * 今天摘完正好每类剩一条（赤峰对夹 / 母亲的话 / 六千限额 / 真心感谢 /
 * 埋钱），所以类与类之间也是等概率的 1/5。这是**当前数据的结果**，
 * 不是代码保证的性质：哪类多写一条，那条就多占一份。
 */
const RANDOM_ENTRIES = []
CONFESSION_GROUPS.forEach((group) => {
  group.entries.forEach((entry) => {
    if (!MAPPED_IDS.has(entry.id)) RANDOM_ENTRIES.push({ group, entry })
  })
})

/**
 * 挑一条忏悔语录。
 *
 * 只剩**两条**规则，而且只有第一条不随机：
 *   1. 玩家在狡辩时选过某一条 → 取与他那句话**逐字对应**的那一条；
 *   2. 其余（风险触顶的留置：他压根没来得及解释）→ 随机池里等概率挑一条。
 *
 * 为什么"接得上那句话"是底线，别的都可以让路：
 * 玩家刚在决定书上说了"钱是打牌赢的"，判词里却回他"你说你小时候穷"——
 * 他知道自己没说过那句话，"系统记得我干了什么"当场破功，
 * 而这一屏的全部力量都建立在"它记得"上面。
 *
 * ── 为什么按金额挑的那条规则没了 ────────────────────────────
 * 原先还有一条"非法所得 > 500 万 → 二成五落哲学反思派"。问题不在比例，
 * 在于**它替玩家把话说死了**：贪得多的人不一定就是"钱只是数字"那一类
 * 心态，现实里贪了一千万还在说"我从小穷怕了"的遍地都是。
 * 何况它排在规则 1 之前还是之后都别扭——金额凭什么改掉他亲口说的话。
 * 删掉之后判词的来源只剩"他说过的"和"随机"两件事，一眼可查。
 * （顺带一提：那个二成五是按十五条的池子反推的，池子缩到八条之后
 *   它算出来的稀有度本来就已经不对了。）
 *
 * ── 兜底不能是 opt_c ────────────────────────────────────────
 * 这里原先写的是 `verdictExcuse || 'opt_c'`，看着像个无害的默认值，
 * 实际后果是**随机那条规则永远不执行**：风险触顶那条路本来就没有
 * verdictExcuse，于是每次都被兜底成冰箱那一条，五类随机一次都轮不上，
 * 当时十五条里有十二条是死文案——写出去了，玩家一辈子读不到。
 * 现在没记过就是不映射，直接落到随机。
 *
 * @returns {{group: Object, entry: Object}} 选中的类别与语录
 */
export function pickConfession(state = {}, random = Math.random) {
  const key = (state.gameStatus && state.gameStatus.verdictExcuse) || ''

  // 1. 玩家亲口说过的那句，必须接得上
  const mapped = EXCUSE_ENTRY[key]
  if (mapped && CONFESSION_INDEX[mapped]) return CONFESSION_INDEX[mapped]

  // 2. 其余一律随机，池子里每条等概率
  const idx = Math.min(
    RANDOM_ENTRIES.length - 1,
    Math.max(0, Math.floor(random() * RANDOM_ENTRIES.length))
  )
  return RANDOM_ENTRIES[idx]
}

/**
 * 只取"语录 + 驳斥"那一段，不带开头也不带刑期。
 *
 * 留置那条结局要用它：那一段的判词没有"收受财物共计"这个账目开头，
 * 是中段插一句忏悔。所以这里给的是**零件**，
 * 三段怎么拼由各自的判词决定（见 verdictText 与 engine.js 的 ENDINGS.purged）。
 */
export function confessionText(state = {}, random = Math.random) {
  const { entry } = pickConfession(state, random)
  const amount = Number(state.player && state.player.illicitWealth) || 0
  const rebuttal = typeof entry.rebuttal === 'function'
    ? entry.rebuttal(amount)
    : entry.rebuttal
  return `${entry.quote}${rebuttal}`
}

/**
 * 落马判词。**结局海报上的那段话**。
 *
 * 三段式：**开头（账）→ 忏悔语录与驳斥（话）→ 判决（刑）**。
 * 开头报数额、中段是玩家自己那套说辞连同法院怎么驳回去、
 * 末段按金额给出刑期。名字取玩家自己填的那个，金额走 formatMoney，
 * 否则一串零玩家得自己数，而这段文案的全部力量就在那个数字上。
 *
 * 中段的语录由 pickConfession 挑：狡辩时说过话的接他那**一句**，
 * 没说过的一律从随机池里等概率取（见 pickConfession 的说明）。
 *
 * 顶档（800 万以上）末段换成 tier.tail，不再另接狡辩文案：
 * 那一段是这一档定死的画面（见 SENTENCE_TIERS 的说明），
 * 到了那个数额，法院先看见的是那间屋子，不是你怎么解释的。
 * 但**忏悔语录照样接在它前面**，跳过语录会让这一档比别的档少一句话。
 *
 * 顶档的语录是从随机池里抽的，**不保证**是哲学反思派那一条。
 * 接"你连马桶水箱里都是美金"落差最正好的是它，但顶档没法独自占住它——
 * 占住了，那句就成了"贪得多的人专用判词"，跟按金额挑的规则一个毛病。
 * 代价是这一档的落差不再每次都有，换来的是一个不总说同一句话的判词。
 * 这是取舍，不是疏漏。
 */
export function verdictText(state, random = Math.random) {
  const name = (state.player && state.player.name) || '某'
  const amount = Number(state.player && state.player.illicitWealth) || 0
  const tier = sentenceTierOf(amount)
  const sentence = tier.tail || `判你${sentenceOf(amount)}。`
  return `${name}同志，查明收受财物共计 ¥${formatMoney(amount)} 元。`
    + confessionText(state, random)
    + sentence
}

/**
 * 这人的账上有没有一笔是他自己收的。
 *
 * 决定书是**冲着钱来的**：它要你说明的是差额，判词里那句"查明收受财物共计"
 * 也得有个数。账上一分赃款都没有的人被送上这一屏，写出来的是一份
 * "共计 ¥0 元"的决定书，配着三个他根本没资格选的狡辩——
 * "钱是打牌赢的"，而他连牌局都没有。
 *
 * 为什么用的是 illicitWealth 而不是 hasIllicitRecord：
 * "收过"和"账上还有"是两件事（见 gameConfig 里那两个字段的说明）。
 * 决定书问的是钱，退完赃的人账上就是干净的，这份文件同样发不下去。
 */
export function hasGraft(state = {}) {
  return (Number(state.player && state.player.illicitWealth) || 0) > 0
}

/**
 * 该不该弹立案审查。
 *
 * 除了"标记立起来了"，还要**账上有赃款**——标记那两个置位处
 * （engine.js 第 8 步的申报差额、第 8.5 步的函询对抗）现在都不会给
 * 零贪腐的人置位了：置位那一刻就直接按免职闲赋了结（见 engine.js）。
 * 这里再挡一道，兜的是**旧存档**：标记还在、人还没结束。
 * 挡下来不等于放他过关——同一个条件在 checkGameOver 里也有一条，
 * 下一次结算（随便点一个选项、或进下一季）就按免职闲赋收尾。
 */
export function needsInvestigation(state = {}) {
  const status = state.gameStatus || {}
  if (status.gameOver) return false
  if (!status.investigationPending) return false
  return hasGraft(state)
}

/** 三个狡辩选项的基础成功率 */
export const EXCUSE_BASES = {
  opt_a: 0.20,
  opt_b: 0.15,
  opt_c: 0.10
}

/**
 * 三条狡辩的选项 id。引擎据此判断"这一掷失败之后该记住哪句话"。
 *
 * 走 id 白名单而不是在选项上挂一个新字段（比如 excuseId）：
 * 选项对象会被写进存档（currentEvent 是入档的），也会过界面的
 * LOCAL_OPTION_KEYS 那道转发；多一个字段就多一处要记得同步的地方，
 * 而这里需要的只是一个"是不是狡辩"的是非判断。
 */
export function isExcuseOption(id) {
  return Object.prototype.hasOwnProperty.call(EXCUSE_BASES, id)
}

/**
 * 认罪退赃的代价。
 *
 * 这里**没有 riskRelief**：退赃是把风险清零，不是减一个固定值（见 engine 的 surrender）。
 * 早先有一个 30，后来改成清零，那个常数就没人读了——
 * 留着它最坏的情况是将来有人拿它当"退赃能降多少风险"的依据，
 * 而实际行为是清零，两者对不上。
 */
export const SURRENDER = {
  popularityLoss: 15,  // 名声没了，但人在
  authorityLoss: 10
}

/**
 * 组装立案审查调查决定书。
 *
 * 三个狡辩选项的 odds 在**这里**就算好写进 gamble——
 * 事件对象本身就是按当前状态现攒的，没有理由让引擎再去认一个
 * "动态概率"的新字段：静态的 gamble 已经够用，多一个机制就多一处会忘的同步。
 */
export function buildInvestigationEvent(state = {}) {
  const amount = Number(state.player && state.player.illicitWealth) || 0
  const scene = freezerScene(amount)
  const name = (state.player && state.player.name) || '你'

  // ── 退赃机会只有一次，用过就没有了 ──
  // 只读 gameStatus.usedRetreat，不看差额多少：决定"还有没有退路"的是次数。
  // 这个标记由 engine 的 surrender() 置位，读档时从存档恢复（见 utils/storage.js）。
  const usedRetreat = Boolean(state.gameStatus && state.gameStatus.usedRetreat)

  const excuse = (id, text, hitText) => ({
    id,
    text,
    costAp: 0,
    effects: {},
    gamble: {
      odds: excuseOdds(EXCUSE_BASES[id], amount),
      hit: { risk: -25, popularity: -5 },
      hitText,
      // 狡辩失败 = 落马。missEnding 交给引擎置位，结局由 checkGameOver 统一裁定。
      //
      // missText 必须写实。原先留了空串，引擎兜底成"这次侥幸没被揪住"——
      // 而这一掷失败的含义恰恰相反，玩家看到的是**当场被留置**之前的最后一句，
      // 弹的却是一句报平安的话。
      missEnding: 'corrupted',
      missText: '审查调查组没有采信。当晚，你被采取了留置措施。'
    },
    note: `成功率 ${(excuseOdds(EXCUSE_BASES[id], amount) * 100).toFixed(1)}%`
      + `（每 100 万非法所得扣 3 个点）`
  })

  return {
    id: INVESTIGATION_EVENT_ID,
    title: '立案审查调查决定书',
    npcName: '审查调查组',
    unitType: '通用',
    bands: [],
    theme: 'risk',
    description:
      `${scene}`
      + `经查，你名下及实际控制的财产，超出合法收入共计 ¥${formatMoney(amount)} 元，`
      + '来源无法说明。审查调查组把决定书推到你面前，让你自己写一份说明材料。'
      + `「${name}，想清楚了再写。你有一晚上的时间。」`,
    options: [
      excuse('opt_a', '钱是打牌赢的。', '这一笔勉强圆上了：同桌的人记不清输了多少，牌局又确实有过。'),
      excuse('opt_b', '朋友暂放的，我不知道是钱。', '朋友认了这个说法，把事揽了过去。你从这间屋子走了出去。'),
      excuse('opt_c', '谁把钱放我家冰箱的？我真不知道！', '这话连你自己都不信，但证据链确实断了。案子暂时挂了起来。'),
      // 认罪退赃：**一辈子只给一次**。第二次立案进来，这里就是三条狡辩，
      // 失败直接落马（见 gameConfig 的 usedRetreat，那里记了为什么必须限次）。
      //
      // 注意它不再按差额分档：早先是"差额超 300 万就不给退赃"，
      // 但实测贪腐玩家的收入速度让他在年度申报时直接跳过 100~300 万那一档，
      // 一上来就是 300 万以上——那个条件下退赃选项**一次都没被触发过**，
      // 跑路（要 500 万）也就永远排在它后面够不着。
      // 改成按次数分之后，第一次进去总能退，退完出来才有那段攒跑路本钱的窗口。
      ...(usedRetreat ? [] : [{
        id: 'opt_d',
        text: '我认罪，争取宽大处理。',
        costAp: 0,
        // risk 不在这里写死：退赃是**清零**而不是减一个固定值，
        // 动态效果塞不进静态 effects，由 engine 的 surrender() 现算。
        effects: {
          popularity: -SURRENDER.popularityLoss,
          authority: -SURRENDER.authorityLoss
        },
        surrender: true,
        note: '全额退赃，风险清零，降一级使用，保留公职。一辈子只有一次'
      }])
    ]
  }
}
