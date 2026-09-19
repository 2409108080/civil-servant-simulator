/**
 * 本地事件库（手工种子 + 机器产出）
 *
 * 这是事件池的**唯一入口**。运行时不再调用 AI，所有事件都从这里抽。
 * 池子由两部分拼成：
 *
 *   1. SEED_EVENTS     —— 本文件里手写的，人的地盘。开局保底用的精编事件。
 *   2. GENERATED       —— ../mock/localEvents.generated.js，scripts/gen_events.py 产出，
 *                         脚本的地盘（约 120 条）。**不要手改那个文件**，下次跑脚本就覆盖了。
 *   3. MOCK_EVENTS     —— ./events.js 里那 8 条老事件。没有标签，是历史包袱，
 *                         只够得着抽取链的最后一档（见 game/eventPool.js），
 *                         留着的意义是断网/池子抽干时还有个垫底的，不删。
 *
 * ── 字段 ────────────────────────────────────────────────
 * 契约字段（与 backend/models.py 的 GameEvent 一致，一个字母都不能改）：
 *   id / title / description / options: [{ id, text, costAp, effects }]
 *
 * 本地标签（**不进网络**）：
 *   npcName   出场人物，纯界面展示
 *   unitType  适用单位类型，取 UNIT_TYPES 之一或「通用」
 *   bands     适用职级档，见下方 BANDS
 *   theme     daily 日常 / risk 廉政题材 / health 健康题材
 *   minGates  事件级门槛，如 { ability: 45 }。**一项不达标整条事件抽不到**，
 *             这是与选项 requires 的分工所在：requires 是"这事你能做但本钱不够"
 *             （摆出来置灰，让玩家知道差多少），minGates 是"这事压根轮不到你"
 *             （干脆别出现）。遴选/借调靠它保证"攒够了才会来敲门"。
 *             键取 PROMOTION_GATES 四项，外加 money（家产，住在 player 下，
 *             不在那八项资源里，见 game/eventPool.js 的 gatesMet）。
 *   onceFlag  一次性事件：引擎在结算它时把 gameStatus[onceFlag] 置起，
 *             此后这条**永远**退池（见 game/eventPool.js 的 onceDone）。
 *             与冷却期不是一回事——冷却只管"一年内别再出现"，
 *             一年后自动回来。剧情上只发生一次的事（纪委的函询通知书）
 *             必须用这个，不能指望冷却兜住。
 *             **值必须是 gameStatus 上真有的字段名**，写错不报错、只静默失效，
 *             所以自检会拿初始档案比对（见 validatePool）。
 *
 * 选项上的本地标签（同样不进网络，由 stripLocalMeta 剥掉）：
 *   costMoney  花多少家产。引擎会真扣，也是这个选项的置灰门槛
 *   gainMoney  进多少家产
 *   requires   附加门槛，如 { mgmt: 10 }。只判"够不够"，不负责扣
 *   gamble     结果随机。{ odds, hit, hitText, missText }，结算时掷骰。
 *              还可带 miss（失败时的固定代价）与 missEnding（失败即终局，
 *              取其值为结局代号，如 'corrupted'）——立案审查的狡辩靠它落马
 *   veto       true 表示选了它，本次提任必定告吹
 *   inquiryDefiance  true 表示在函询上对抗或沉默。下季度直接进入立案审查
 *              （见 game/engine.js 第 8.5 步），不是当场立案——
 *              函询答复到立案之间本来就隔着一道审批程序
 *   note       界面说明签，交代静态 effects 说不清的事（概率、人情代价）
 *   gainIllicit 收下多少非法所得。**写它就够，不要再写一份同额的 gainMoney**：
 *              引擎一次写两个字段（家产 + 纪委的账），分开写迟早有人只写前一个，
 *              表现是钱到账了、纪委永远查不到，贪腐流变成无风险套利
 *   buyAsset   置办资产。{ kind, holder }，取 constants/assets.js 的两个枚举。
 *              **价格不写在这里**，由资产目录算（含代持手续费），
 *              引擎会先验资再扣，界面也拿同一个函数算置灰门槛
 *   surrender  true 表示认罪退赃：全额退赃、降一级使用、保留公职
 *   transfer   遴选/借调，成功则换单位类型。**必须写 unitType，且取 UNIT_TYPES 之一**
 *              ——写错不会报错，只会让这个玩家从此抽不到对口事件，
 *              所以 resolveTransfer 会当场拒绝非法值。
 *              成功率 = base + 能力×perAbility + 向上管理×perMgmt，再夹到
 *              [minOdds, maxOdds]（见 game/transfer.js）。这几项都能逐条覆盖：
 *              四个系数全写 0、只留 base，就是一次**纯掷骰**的调动，
 *              此时 minOdds 也要一起写小，否则默认下限 15% 会把它抬上去。
 *              可选文案 okText / failText 交代成败的说法。
 *
 * 标签为什么不干脆塞进契约里：backend/models.py 的 _Base 是 extra="forbid"，
 * GameEvent 多一个字段就会 422。而这几项纯本地，后端既不用也不该知道。
 * 于是标签留在事件上（可读性最好），由 api/event.js 的 stripLocalMeta()
 * 在上报前剥掉——出口处收口，比在入口处到处补字段可靠。
 */

import {
  AUTHORITY_PER_BONUS,
  BANDS,
  LEVEL_LADDER,
  PROMOTION_GATES,
  bandOfLevel
} from '@/constants/promotion'
import { UNIT_TYPES, createInitialState } from '@/constants/gameConfig'
import { ASSET_HOLDERS, ASSET_KINDS, assetCostOf } from '@/constants/assets'
import { MOCK_EVENTS } from './events'
import GENERATED from './localEvents.generated'

/**
 * 免费选项的"自我惩罚"下限。
 *
 * **必须与 scripts/gen_events.py 里的同名常量一致**——那里是生成时的准入线，
 * 这里是运行前的自检线。不一致的后果不是报错，而是生成脚本放行的料
 * 被前端自检判为不合格（或反过来，自检放过了脚本本该拦下的料），
 * 两边都在"检查同一件事"，却各查各的。
 */
export const RISK_SELF_PUNISH = 8

/**
 * minGates 允许出现的键：四项晋升门槛，外加 money 和 illicit。
 *
 * money / illicit 都不在 PROMOTION_GATES 里（它们不是资源条），但各有一类正当门槛：
 *   · money   —— "家底够厚才轮得到你"，买豪宅那条就该这样拦人。
 *   · illicit —— "**手上已经脏了才轮得到你**"。这是贪腐梯度能不能成立的关键：
 *                80 万、100 万那两笔不该是玩家的第一次伸手，否则一上来就是
 *                大额，"越陷越深"的曲线就没了。用非法所得本身当门槛，
 *                比拿职级或家底去近似都准——它直接问"你贪过没有"。
 * 白名单要单独放它们进来，否则自检会把合法的门槛判成"键写错了"。
 */
const GATE_KEYS = PROMOTION_GATES.concat(['money', 'illicit'])

/**
 * 初始 gameStatus 的键集。校验 onceFlag 用（见 validatePool）。
 *
 * 直接问初始档案要，而不是在这里再抄一份标记位名单：抄一份的后果是
 * 加了新标记位却忘了补名单，于是合法的 onceFlag 被判成"键写错了"——
 * 自检开始报假警之后，真警就没人看了。
 */
const INITIAL_GAME_STATUS = createInitialState().gameStatus

/**
 * 这个选项要花掉多少钱。两个来源相加：直接花（costMoney）+ 置办资产（buyAsset）。
 *
 * 置办资产的价钱不在事件里，得问目录——这与 EventModal.moneyCostOf 用的是
 * 同一个函数，两处必须得出同一个数：自检说"花了钱所以不算刷分"、
 * 界面却显示"不花钱"，中间那笔差额没人会发现。
 */
function moneySpentBy(option) {
  const buy = option && option.buyAsset
  const asset = buy ? assetCostOf(buy.kind, buy.holder) : 0
  return (Number(option && option.costMoney) || 0) + asset
}

// 档位的定义（BANDS / bandOfLevel）已挪到 constants/promotion.js——薪级表也要用，
// 而 constants 不该反过来依赖 mock。这里只做一次转发，保持原有取用方式不变。
export { BANDS }

/**
 * 职级 → 档位的查表形式。抽取是按 `BAND_OF_LEVEL[player.level]` 取的，
 * 保留这个形状比让调用方改成函数调用改动更小。
 */
export const BAND_OF_LEVEL = LEVEL_LADDER.reduce((acc, item) => {
  acc[item.level] = bandOfLevel(item.level)
  return acc
}, {})

export const THEMES = {
  DAILY: 'daily',
  RISK: 'risk',
  HEALTH: 'health'
}

/** 不限单位/不限职级的标签值。写成常量，别在代码里散落中文字面量 */
export const COMMON = '通用'

// ══════════════════════════════════════════════════════════════════
// 手工种子
//
// 数量不多，作用是「一开局、池子还没铺开时也有像样的事件」。
//
// **id 一律带 seed_ 前缀，这不是装饰。** 机器生成的事件 id 形如
// evt_<单位>_<职级>_<slug>（见 scripts/gen_events.py 的 normalize），
// 而那个脚本不知道这里手写了哪些 id——两边各写各的，撞名只是时间问题。
// 撞了之后冷却表会把这两条当成同一条：抽到其中一条，另一条跟着一起进冷却，
// 而且不报错（自检那关在生产构建里是被摇掉的）。加个前缀把它变成不可能，
// 比每次跑完脚本去人肉核对可靠。
// 每条都要满足 game/eventPool.js 的校验，尤其是：
//   · 至少一个 costAp=0 的选项（否则玩家剩 1 点行动力时会卡在关不掉的弹窗里）
//   · 免费选项不得让四项晋升门槛净增长（否则可以无限点击刷分，
//     详见 scripts/gen_events.py 里 check_event() 的说明）
// ══════════════════════════════════════════════════════════════════

export const SEED_EVENTS = [
  {
    id: 'evt_seed_core_k_deepnight_doc',
    title: '凌晨一点的通知',
    npcName: '书记秘书 小周',
    unitType: '核心部门',
    bands: ['科级'],
    theme: 'daily',
    description:
      '凌晨一点，小周的电话把你从床上叫起来，说书记明天上午在全会上有个发言，'
      + '材料他们拟了一稿，书记看了只回一句「站位还不够高」，让你再捋一遍。'
      + '他没说几点要，只说「上班前吧」。稿子十七页，落款是你的名字。',
    options: [
      {
        id: 'opt_a',
        text: '回办公室，通宵重写一稿',
        costAp: 1,
        effects: { mgmt: 9, kpi: 5, ability: 3, energy: -20, health: -8 }
      },
      {
        id: 'opt_b',
        text: '电话里口述思路，让他们改',
        costAp: 0,
        effects: { mgmt: 1, energy: -8, kpi: -4, authority: -2 }
      },
      {
        id: 'opt_c',
        text: '按程序办，明早先报个提纲',
        costAp: 0,
        effects: { mgmt: -7, kpi: -4, authority: 3, energy: 5, health: 3 }
      }
    ]
  },
  {
    id: 'evt_seed_town_k_blocked_gate',
    title: '堵在门口的二十三个人',
    npcName: '信访办 老魏',
    unitType: '基层乡镇',
    bands: ['科级'],
    theme: 'daily',
    description:
      '镇上那条断头路修了两年没修通，二十三个村民举着牌子把大门堵了，有人在开直播。'
      + '老魏凑过来小声说：「张镇长去县里开会了，电话打不通。」门外开始有人拍门，'
      + '你抬头看见的是门厅那面「为人民服务」的牌子。',
    options: [
      {
        id: 'opt_a',
        text: '出去见，当场给个答复',
        costAp: 1,
        effects: { popularity: 8, authority: 5, kpi: 4, risk: 7, energy: -12 }
      },
      {
        id: 'opt_b',
        text: '请信访办按程序接访登记',
        costAp: 0,
        effects: { popularity: -7, risk: -4, kpi: -2, energy: 4 }
      },
      {
        id: 'opt_c',
        text: '让派出所先维持秩序、劝返',
        costAp: 1,
        effects: { popularity: -12, risk: 9, authority: 4, kpi: -3, energy: -6 }
      }
    ]
  },
  {
    id: 'evt_seed_bureau_k_window_complaint',
    title: '举着手机的办事群众',
    npcName: '窗口 小刘',
    unitType: '常规局委',
    bands: ['科级'],
    theme: 'daily',
    description:
      '政务大厅三号窗口，一位群众因为材料少一份被退了件，当场举起手机录像，'
      + '说要发到网上去。窗口的小刘红着眼圈站在一边，身后还排着十几号人，'
      + '都在往这边看。分管领导今天不在，值班表上签的是你的名字。',
    options: [
      {
        id: 'opt_a',
        text: '出面道歉，特事特办先给他办',
        costAp: 1,
        effects: { popularity: 8, risk: 10, mgmt: -4, kpi: 3, energy: -10 }
      },
      {
        id: 'opt_b',
        text: '按规定不予受理，把政策讲透',
        costAp: 0,
        effects: { popularity: -7, authority: 6, risk: -5, kpi: -2, energy: -4 }
      },
      {
        id: 'opt_c',
        text: '请他补齐材料，我陪他跑一趟',
        costAp: 2,
        effects: { popularity: 5, ability: 4, authority: 4, kpi: 4, energy: -16, health: -3 }
      }
    ]
  },
  {
    id: 'evt_seed_marg_k_chorus_checkup',
    title: '合唱比赛与体检表',
    npcName: '工会干事 王姐',
    unitType: '边缘部门',
    bands: ['科级'],
    theme: 'daily',
    description:
      '市里组织机关合唱比赛，王姐把报名表拍在你桌上，说局里就你年轻、「撑撑场面」。'
      + '同一时间，办公室转来一份体检通知，今年新增了胃镜，得自己去预约。'
      + '两件事的通知上都写着「自愿参加」。',
    options: [
      {
        id: 'opt_a',
        text: '报名，晚上留下来跟着练',
        costAp: 1,
        effects: { popularity: 7, mgmt: 3, energy: -12, kpi: -2 }
      },
      {
        id: 'opt_b',
        text: '先把体检约了，合唱往后放',
        costAp: 0,
        effects: { health: 14, energy: 6, popularity: -5, mgmt: -2 }
      },
      {
        id: 'opt_c',
        text: '两样都推掉，图个清静',
        costAp: 0,
        effects: { energy: 8, health: 4, popularity: -8, authority: -3 }
      }
    ]
  },
  // ── 遴选 / 借调：换流派的两条。1.5.0 新增 ──
  //
  // 这是全局唯一能把 unitType 改掉的入口。没有它，考公分数就把玩家
  // 钉死在一条道上——低分进边缘部门的玩家，往后几十个季度都在处理
  // 清水衙门的事，努力再多也换不了跑道，那不叫难度，叫开局定终身。
  //
  // minGates 是**事件级**门槛（不是选项门槛）：攒不够能力/政绩的人
  // 根本抽不到这两条。理由很实在——一个能力 20 的新人，组织上不会来借调他，
  // 给他看见这个选项反而是误导。
  //
  // transfer 三个系数见 game/transfer.js：成功率 = 基础 + 能力×系数 + 向上管理×系数。
  // 所以"平时好好干活"本身就是通往别处的路，不需要额外设计。
  {
    id: 'evt_seed_marg_k_open_selection',
    title: '市级机关公开遴选',
    npcName: '人事科 老吴',
    unitType: '边缘部门',
    bands: ['科级', '处级'],
    theme: 'daily',
    minGates: { ability: 45 },
    description:
      '市里今年的公开遴选公告挂出来了，市委办公室要两个人。老吴把打印件放在你桌上，'
      + '说：「条件你都够，就是得考试、得面谈，还得原单位放人。」'
      + '他顿了顿，又补一句：「咱们这儿往年没人报过，你要报，动静不会小。」',
    options: [
      {
        id: 'opt_a',
        text: '报市委办的名，把材料准备扎实',
        costAp: 2,
        effects: { energy: -12, ability: 4, kpi: -2 },
        transfer: {
          unitType: '核心部门',
          unit: '市委办公室',
          okText: '遴选通过，你被市委办公室录用了。',
          failText: '面试没进前三。市委办的门槛比想象中高，原单位的工作还得接着干。'
        }
      },
      {
        id: 'opt_b',
        text: '报个对口的业务局委，稳一点',
        costAp: 1,
        effects: { energy: -6, ability: 2 },
        transfer: {
          unitType: '常规局委',
          unit: '市财政局',
          base: 0.3,
          okText: '遴选通过，你调进了市财政局。',
          failText: '对口局委的竞争一样激烈，这次没能挤进去。'
        }
      },
      {
        id: 'opt_c',
        text: '不报了，把手上的事做扎实',
        costAp: 0,
        effects: { health: 10, energy: 8, popularity: 4, kpi: -6, ability: -3 }
      }
    ]
  },
  {
    id: 'evt_seed_town_k_secondment',
    title: '组织部来借调',
    npcName: '组织部 张科长',
    unitType: '基层乡镇',
    bands: ['科级', '处级'],
    theme: 'daily',
    minGates: { kpi: 20 },
    description:
      '组织部张科长到镇上调研，散会时单独留了你，说部里近期要抽人参与专项工作，'
      + '为期半年，「材料要能写，人也要能熬」。他没承诺什么，只说借调结束之后'
      + '「组织上会考虑」。镇上的书记在旁边听着，没接话。',
    options: [
      {
        id: 'opt_a',
        text: '去，借调期间把活干到没人挑得出毛病',
        costAp: 2,
        effects: { energy: -16, health: -4, kpi: 5 },
        transfer: {
          unitType: '核心部门',
          unit: '市委组织部',
          base: 0.25,
          okText: '借调期满，组织部把你留了下来。',
          failText: '半年干下来，部里编制紧张，你还是回了镇上。'
        }
      },
      {
        id: 'opt_b',
        text: '去，但说清半年后回原单位（踏实干活，等一个被强行留下的机会）',
        costAp: 1,
        effects: { kpi: 6, ability: 5, mgmt: 3, energy: -8 },
        // 这一条是**纯掷骰**，与能力无关，10% 就是 10%。
        //
        // 三个字段缺一不可：perAbility / perMgmt 写成 0 才是真的不看能力，
        // 否则它会跟着能力一起涨；而只写 base 的话，默认下限 15% 会把它
        // 悄悄抬到 15%——玩家看到的是一个和他以为的规则不符的数字。
        //
        // 为什么留着这个"意外之喜"：opt_a 是"我去拼一个前程"，成功率靠能力挣；
        // opt_b 是"我只想把活干好"，组织上留不留你跟你多努力没关系。
        // 两条路的收益差得不多，但心态完全不同——玩家该有得选。
        transfer: {
          unitType: '核心部门',
          unit: '市委组织部',
          base: 0.1,
          perAbility: 0,
          perMgmt: 0,
          minOdds: 0.1,
          okText: '半年期满，部里缺人手，组织上把你留了下来——你本来只是想安稳干完这半年。',
          failText: '半年期满，部里编制没松动，你按当初说好的回了镇上。'
        }
      },
      {
        id: 'opt_c',
        text: '推掉，镇上的工作走不开',
        costAp: 0,
        effects: { popularity: 4, authority: 4, kpi: -5, mgmt: -4 }
      }
    ]
  },

  // ── 家产（money）相关的四条。1.4.0 新增 ──
  //
  // 这几条的共同点是：**降风险不再是免费的**。1.4.0 之前的降风险选项只有
  // 「如实交代，得罪人」这一种代价（扣 mgmt / popularity / energy），
  // 玩家攒了一身资源反而无所谓。加入家产之后，风险有了第二条出口，
  // 但这条出口是有限的——钱要一季一季地攒。
  //
  // costMoney 与 gainMoney 是**本地字段**：钱不在那八项资源里，
  // 塞进 effects 会被后端的 RESOURCE_KEYS 校验挡下（详见 api/event.js）。
  {
    id: 'evt_seed_common_k_subsidy_refund',
    title: '退钱的通知',
    npcName: '财务科 老赵',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    description:
      '财务科把一份清单拍在你桌上。三年前那笔「业务加班补贴」，按新口径属于违规发放，'
      + '要求限期清退。金额你一眼就看见了：两万三。老赵压低声音说：'
      + '「局里统一动作，早退早利索。拖到后面，就不是钱的事了，是态度问题。」',
    options: [
      {
        id: 'opt_a',
        text: '当天就去银行，一分不少地退回去',
        costAp: 1,
        costMoney: 23000,
        effects: { risk: -14, mgmt: 6, authority: 4, popularity: -6, energy: -6 }
      },
      {
        id: 'opt_b',
        text: '先拖着，看看别人退不退',
        costAp: 0,
        effects: { risk: 9, mgmt: -3, energy: 3 }
      },
      {
        id: 'opt_c',
        text: '找老赵问清口径，按最低标准退',
        costAp: 1,
        costMoney: 8000,
        effects: { risk: -6, mgmt: -2, kpi: -2, energy: -4 }
      }
    ]
  },
  {
    id: 'evt_seed_common_k_gift_envelope',
    title: '门缝里的信封',
    npcName: '办公室 小陈',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    description:
      '下班时你发现办公室门缝里塞着一个牛皮纸信封，没有落款。拆开是三千块现金和一张便签，'
      + '写着「上次的事，多谢」。落款处那行字被撕掉了一半，你盯着它，'
      + '想起上周是谁在这个位置上坐过半个小时。走廊的声控灯灭了。',
    options: [
      {
        id: 'opt_a',
        text: '原封不动交到纪检监察室登记',
        costAp: 1,
        effects: { risk: -12, mgmt: 5, authority: 6, popularity: -4 }
      },
      {
        id: 'opt_b',
        text: '按便签上的线索，原路退回去',
        costAp: 0,
        effects: { risk: 5, mgmt: -2, energy: 2 }
      },
      {
        id: 'opt_c',
        text: '先收着，事情照办',
        costAp: 0,
        gainMoney: 3000,
        effects: { risk: 16, popularity: 4, authority: 3 }
      }
    ]
  },
  {
    id: 'evt_seed_common_c_family_business',
    title: '配偶名下的一家公司',
    npcName: '组织人事处 老郑',
    unitType: '通用',
    bands: ['处级', '厅级'],
    theme: 'risk',
    description:
      '组织人事处转来一份《领导干部个人有关事项报告表》。老郑用笔尖点了点其中一栏：'
      + '「配偶经商办企业情况」。你想起妻子去年和朋友合伙注册的那家公司，'
      + '营业执照还压在书房的抽屉里，当时谁都没当回事。老郑说：'
      + '「截止到月底。补报是主动，瞒报是隐瞒，性质不一样。」',
    options: [
      {
        id: 'opt_a',
        text: '如实填报，同步把关联业务注销干净',
        costAp: 2,
        costMoney: 30000,
        effects: { risk: -16, mgmt: 8, authority: 5, popularity: -5, energy: -10 }
      },
      {
        id: 'opt_b',
        text: '如实填报，业务先不动',
        costAp: 1,
        effects: { risk: -8, mgmt: 4, popularity: -3, energy: -4 }
      },
      {
        id: 'opt_c',
        text: '这一栏先空着，回头再说',
        costAp: 0,
        effects: { risk: 12, mgmt: -6, energy: 3 }
      }
    ]
  },
  {
    id: 'evt_seed_common_c_canteen_table',
    title: '老领导组的局',
    npcName: '退休的老处长',
    unitType: '通用',
    bands: ['科级', '处级', '厅级'],
    theme: 'daily',
    description:
      '退休的老处长打电话来，说几个老同事凑一桌，让你务必到。地点在城郊一个不挂招牌的院子，'
      + '人均不便宜。你清楚这顿饭是什么意思——有些话在办公室里说不出口，'
      + '在酒桌上才递得过来。他把时间定在周五晚上，没问你方不方便。',
    options: [
      {
        id: 'opt_a',
        text: '到，散席前悄悄把单买了',
        costAp: 1,
        costMoney: 12000,
        effects: { risk: -10, mgmt: 10, popularity: 8, energy: -10, health: -4 }
      },
      {
        id: 'opt_b',
        text: '人到，账 AA',
        costAp: 1,
        effects: { mgmt: 4, popularity: 4, energy: -8, health: -3 }
      },
      {
        id: 'opt_c',
        text: '推说有事，不去',
        costAp: 0,
        effects: { mgmt: -5, popularity: -4, energy: 4, health: 3 }
      }
    ]
  },
  {
    id: 'evt_seed_common_k_inquiry_notice',
    title: '函询通知书',
    npcName: '纪委 李同志',
    unitType: '通用',
    bands: ['科级'],
    theme: 'risk',
    // 一辈子只发一次。函询通知书不是季度通报，组织上不会每三个月
    // 重新问你一遍同一笔专项资金——真到了那一步，来的是决定书，不是通知。
    // 标记位置起后这条永远退池（见 eventPool.js 的 onceDone）。
    onceFlag: 'hasInquiryNotice',
    description:
      '一份函询通知书放在你桌上，要你就去年那笔专项资金的具体走向作出书面说明，'
      + '十五个工作日内交。李同志临走时补了一句：「组织上给你机会，说明还是信任你的。」'
      + '走廊里有两个人回头看了你一眼。',
    options: [
      {
        id: 'opt_a',
        text: '如实写清，把责任揽下来',
        costAp: 1,
        effects: { risk: -16, mgmt: -8, authority: 5, energy: -12 }
      },
      {
        // 「按程序办」是拖。拖得住一时，拖不过一个季度——
        // 材料不交，组织上等不到说明，下一步就是决定书（见 engine.js 第 8.5 步）。
        id: 'opt_b',
        text: '按程序办，请分管领导先核实',
        costAp: 0,
        inquiryDefiance: true,
        effects: { risk: 6, mgmt: -5, authority: -4, energy: -3 }
      },
      {
        id: 'opt_c',
        text: '找老领导打个招呼问问口径',
        costAp: 1,
        inquiryDefiance: true,
        effects: { risk: 15, mgmt: 4, popularity: -6, authority: -5 }
      }
    ]
  },

  // ══════════════════════════════════════════════════════════════════
  // 置业与贪腐。1.5.0 新增，也就是「疯狂贪腐流」的全部入口。
  //
  // 为什么这两类必须一起加：**只加置业不加收入，等于没加**。
  // 买豪车要 50 万，一个科级干部正常攒到那份上得干到退休；
  // 而没有置业这条路，贪来的钱又只是账上的一串数字，没有任何出口。
  // 两者是一套东西：贪腐提供本金，置业把钱换成看得见的东西，
  // 而"看得见"正是被查的原因（见 wealth.js 的申报公式）。
  //
  // ── 金额为什么按职级递增 ──
  // 科级几十万、处级几百万、厅级上千万，不是为了"数值成长"，
  // 是因为**冰箱藏钱的景象本来就分档**（见 investigation.js）。
  // 一个科级干部冰箱里搜出三千万，那不是讽刺，那是胡编。
  // 想让玩家看到"运钞车开来了"那句，就得让他先坐到能收那么多钱的位置上。
  // ══════════════════════════════════════════════════════════════════

  // ── 置业：花钱买体面，也买下每季度的账 ──
  //
  // 价钱**不写在这里**，由 constants/assets.js 的目录算（代持还要加两成手续费）。
  // 写了价格就等于把同一个数字放在两处，改一处忘一处，表现为
  // "选项写着 50 万、实际扣了 60 万"，且两边都不报错。
  {
    id: 'evt_seed_common_k_luxury_car',
    title: '4S 店里的那台车',
    npcName: '销售顾问',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'daily',
    description:
      '陪朋友去看车，销售顾问的话却一直对着你讲。那台落地五十来万的车，坐进去关上门，'
      + '外面的声音一下就没了。朋友在旁边笑：「你这个位置，开这个正好。」'
      + '你想起来局里那台开了十一年的帕萨特，方向盘上的皮都磨白了。'
      + '签字之前，销售抬头问了一句：车，写谁的名字？',
    options: [
      {
        id: 'opt_a',
        text: '买了，登记在本人名下',
        // 不耗行动力。**买东西不是工作**——行动力管的是"这个季度能处理几件事"，
        // 而 4S 店只需要他去一趟。原先两条买入选项各要 1 点，于是剩 1 点行动力
        // 时它们全灰、只剩"不买"点得动——那个界面看着像系统不许他买车。
        // 不担心被刷：价钱（见目录）与"买过就不再卖"（见 eventPool 的
        // assetGateMet）各是一道闸，比行动力那道紧得多。
        costAp: 0,
        effects: { authority: 15, health: 10 },
        buyAsset: { kind: 'car', holder: 'self' }
      },
      {
        id: 'opt_b',
        text: '买了，挂在老家亲戚名下',
        costAp: 0,
        effects: { authority: 15, health: 10 },
        buyAsset: { kind: 'car', holder: 'proxy' }
      },
      {
        id: 'opt_c',
        text: '不买，那台旧车再开两年',
        costAp: 0,
        effects: { popularity: 1, kpi: -3, energy: 4 }
      }
    ]
  },
  {
    id: 'evt_seed_common_c_riverside_flat',
    title: '江景大平层',
    npcName: '中介 小许',
    unitType: '通用',
    bands: ['处级', '厅级'],
    theme: 'daily',
    description:
      '小许带你看的那套房子在十七楼，客厅一整面落地窗对着江，冬天下午三点还有太阳。'
      + '两百来万，全款。她说了两遍「这套不愁卖」，又补一句：「您这样的，'
      + '写自己名下也正常。」你在窗边站了很久，楼下那条江一直流到市里去。',
    options: [
      {
        id: 'opt_a',
        text: '买了，登记在本人名下',
        // 同 4S 店那条：看房、签约是私事，不占"这个季度能办几件事"的额度。
        costAp: 0,
        effects: { mgmt: 20, popularity: -10 },
        buyAsset: { kind: 'house', holder: 'self' }
      },
      {
        id: 'opt_b',
        text: '买了，让小舅子出面签',
        costAp: 0,
        effects: { mgmt: 20, popularity: -10 },
        buyAsset: { kind: 'house', holder: 'proxy' }
      },
      {
        id: 'opt_c',
        text: '算了，周转房还能住',
        costAp: 0,
        effects: { mgmt: -4, popularity: 1, energy: 3 }
      }
    ]
  },

  // ── 贪腐收入：钱进来了，纪委的账也记上了 ──
  //
  // 收钱的选项一律写 gainIllicit，**不写 gainMoney**——
  // 引擎会一次写两个字段：家产进去了，非法所得那条记录也留下。
  // 分出两个字段让作者各写各的，迟早有人只写 gainMoney，
  // 表现是钱到账了、纪委永远查不到，贪腐流变成无风险套利。
  //
  // 收钱的选项风险在 8~15 之间，**刻意压在"当场不会被风险条弄死"的区间**：
  // 贪腐流的死法应该是财产申报算出差额、纪委立案，而不是风险条先到 100。
  // 代价改由数额承担——钱进来是安全的，问题是它躺在账上解释不通。
  //
  // 数额本身是一条**梯度**，而且它同时是玩家的第一次生死判定（红线 50 万，含等号）：
  //   10 万 土特产／15 万 纪念品 → 单收安全，危险全在累积
  //   20 万 加急的件／30 万 惠农资金 → 单收也安全，两笔就到线
  //   50 万 中标之后 → **一笔就到线**。红线取 >=，所以这是"第一次就爆"的起点
  //   60 万 领导的一句家常 → 一样爆，且数额更大
  //   80 万 年底的分红／100 万 最后一次机会 → 爆，且**门槛是非法所得本身**
  //     （minGates.illicit），第一次伸手的人碰不到——它们只在你已经脏了之后
  //     才出现，是"再收一笔就收手"这句话的诱饵。
  // 50 万以下四条是温水，50 万起是悬崖：同一档位里两种命运，
  // 玩家第一次伸手碰上哪一种，决定了他这一局是慢性病还是猝死。
  //
  // 红线取 >= 是后来改的。原先写 >，于是 50 万那笔**正好压在线上**、
  // 永远不查，实测"见钱就收"的玩家 100% 会伸第二次手——
  // 不是他胆子大，是第一次伸手在数学上没有任何后果。
  {
    id: 'evt_seed_common_k_bid_kickback',
    title: '中标之后',
    npcName: '中标单位的老板',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    description:
      '项目验收完的第三天，中标的老板约你在茶楼见面。他先说了二十分钟的感谢，'
      + '然后把一个文件袋推过来，说里面是"一点心意，跟项目没关系"。'
      + '袋子不厚，压在桌上有一点分量。他没看你，低头给自己续了杯茶：'
      + '「以后还有的是机会。」',
    options: [
      {
        id: 'opt_a',
        text: '收下，往后的事往后说',
        costAp: 0,
        gainIllicit: 500000,
        effects: { risk: 10, popularity: 4, authority: 3 }
      },
      {
        id: 'opt_b',
        text: '把袋子推回去，只留两条烟',
        costAp: 0,
        effects: { risk: 3, authority: 4, popularity: -5 }
      },
      {
        id: 'opt_c',
        text: '出门直接去了纪检监察室',
        costAp: 0,
        effects: { risk: -14, mgmt: -7, popularity: -5, kpi: 4, authority: 6 }
      }
    ]
  },
  {
    id: 'evt_seed_bureau_k_approval_fee',
    title: '加急的件',
    npcName: '办事员 老丁',
    unitType: '常规局委',
    bands: ['科级'],
    theme: 'risk',
    description:
      '窗口后面的老丁凑过来，说有个企业的材料压在你这儿快两个月了，'
      + '对方托人问了几次。「人家也不是要你违规，」他压低声音，'
      + '「就是想让流程走快点。这种事，咱们这儿一年到头都有。」'
      + '他手里捏着一张写了电话号码的便签。',
    options: [
      {
        id: 'opt_a',
        text: '接过来，先办他那件',
        costAp: 0,
        gainIllicit: 200000,
        effects: { risk: 8, popularity: 5, kpi: -2 }
      },
      {
        id: 'opt_b',
        text: '按受理顺序办，谁也别插队',
        costAp: 0,
        effects: { risk: -3, mgmt: -3, energy: 2 }
      },
      {
        id: 'opt_c',
        text: '把便签登记进廉政台账',
        costAp: 0,
        effects: { risk: -10, authority: 5, popularity: -5, kpi: 2 }
      }
    ]
  },
  {
    id: 'evt_seed_town_k_poverty_fund',
    title: '惠农资金的过路费',
    npcName: '村支书 老周',
    unitType: '基层乡镇',
    bands: ['科级'],
    theme: 'risk',
    description:
      '那笔惠农补贴拨下来的时候，老周拎着两条烟来了，说村里已经把账做好了，'
      + '只要你在拨付单上签个字，剩下的「镇上有镇上的难处」。'
      + '他报了个数：三成。你翻了翻手里的花名册，最后一页那几个名字，'
      + '去年冬天还来镇里领过救灾的棉被。',
    options: [
      {
        id: 'opt_a',
        text: '签字，镇上的账确实难',
        costAp: 0,
        gainIllicit: 300000,
        effects: { risk: 14, popularity: -8, kpi: 5, authority: 3 }
      },
      {
        id: 'opt_b',
        text: '一分不扣，自己盯着发到户',
        costAp: 1,
        effects: { kpi: 8, popularity: 6, energy: -10 }
      },
      {
        id: 'opt_c',
        text: '让他先报个申请，走程序',
        costAp: 0,
        effects: { risk: 6, popularity: -4, kpi: -3 }
      }
    ]
  },
  {
    id: 'evt_seed_core_k_leader_hint',
    title: '领导的一句家常',
    npcName: '分管领导',
    unitType: '核心部门',
    bands: ['科级', '处级'],
    theme: 'risk',
    description:
      '领导在走廊里叫住你，说有个企业最近想见你一面，聊一聊「行业发展的思路」。'
      + '他说得很随意，还顺便问了问你孩子上几年级。'
      + '你没接话，他拍了拍你的肩：「就是聊聊，别有负担。」'
      + '转身进了电梯，门合上之前又看了你一眼。',
    options: [
      {
        id: 'opt_a',
        text: '去聊，顺便收下那份咨询费',
        costAp: 0,
        gainIllicit: 600000,
        effects: { risk: 10, mgmt: 8, popularity: 3 }
      },
      {
        id: 'opt_b',
        text: '装作没听懂',
        costAp: 0,
        effects: { mgmt: -6, risk: -4, energy: 3 }
      },
      {
        id: 'opt_c',
        text: '去聊，但把事都谈在明面上',
        costAp: 1,
        effects: { mgmt: 5, kpi: 4, energy: -8 }
      }
    ]
  },
  // ── 80 万 / 100 万：给"收完 50 万之后"准备的两笔 ──
  //
  // minGates 卡的是**非法所得本身**，不是职级也不是家底：
  // 这两笔不该出现在第一次伸手的人面前，否则大额成了开局，
  // "越陷越深"的曲线就断了。10→15→20→30→50→60 是温水，
  // 从 80 万起才是"再收一笔就收手"——而这句话本身就是这类人栽跟头的地方。
  {
    id: 'evt_seed_common_k_project_dividend',
    title: '年底的分红',
    npcName: '工程公司的老总',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    minGates: { illicit: 500000 },
    description:
      '去年那笔钱收下之后，你和他之间就有了一种不用明说的默契。'
      + '今年他换了种说法，说项目赚了，给你留了一份"干股分红"，'
      + '不用签字，也不用过户，「账上过一道，年底直接给你」。'
      + '他报的数比去年大了不少，语气却更随意了——因为他知道你不会拒绝。',
    options: [
      {
        id: 'opt_a',
        text: '收下，反正已经这样了',
        costAp: 0,
        gainIllicit: 800000,
        effects: { risk: 12, mgmt: 6, popularity: 3 }
      },
      {
        id: 'opt_b',
        text: '今年到此为止，让他别再提',
        costAp: 0,
        effects: { risk: -6, popularity: -5, mgmt: -3, kpi: 3 }
      },
      {
        id: 'opt_c',
        text: '把去年那笔也一并交上去',
        costAp: 1,
        effects: { risk: -18, authority: 4, popularity: -8, kpi: 4 }
      }
    ]
  },
  {
    id: 'evt_seed_common_k_final_offer',
    title: '最后一次机会',
    npcName: '中间人',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    minGates: { illicit: 1000000 },
    description:
      '中间人约在停车场见面，没下车，摇下一条窗缝。'
      + '他说上面那条线快断了，趁现在还能动，有一笔大的，'
      + '「做完这一笔，你我都收手，往后谁也不认识谁」。'
      + '副驾上放着一个行李箱，他没说是钱，你也没问。'
      + '后视镜里，停车场出口的栏杆抬着，一直没落下。',
    options: [
      {
        id: 'opt_a',
        text: '把行李箱搬进后备箱，最后一次',
        costAp: 0,
        gainIllicit: 1000000,
        effects: { risk: 15, mgmt: 8, popularity: -4 }
      },
      {
        id: 'opt_b',
        text: '摆手让他走，这次是真的收手',
        costAp: 0,
        effects: { risk: -10, mgmt: -5, popularity: -3, kpi: 3 }
      },
      {
        id: 'opt_c',
        text: '记下车牌，回去写材料',
        costAp: 1,
        effects: { risk: -25, authority: 6, popularity: -10, kpi: 6 }
      }
    ]
  },
  {
    id: 'evt_seed_common_k_gift_box',
    title: '土特产的包装盒',
    npcName: '老家的表叔',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    description:
      '表叔从老家来，拎着个印着「山珍」的纸盒，说是自家山上采的，不值钱，'
      + '就是点心意。你留他吃饭，他说赶下午的班车，走的时候把盒子搁在玄关，'
      + '让你别送。你拎起来，比一盒山货沉。撕开胶带，最上面是两袋真空包装的笋干，'
      + '底下压着一个牛皮纸信封，没封口。',
    options: [
      {
        id: 'opt_a',
        text: '把笋干收进柜子，信封也收进柜子',
        costAp: 0,
        gainIllicit: 100000,
        effects: { risk: 8, popularity: 3 }
      },
      {
        id: 'opt_b',
        text: '笋干留下，信封寄回去',
        costAp: 0,
        effects: { risk: -3, popularity: -4, kpi: 2 }
      },
      {
        id: 'opt_c',
        text: '连盒子一起拎到纪检监察室',
        costAp: 0,
        effects: { risk: -9, authority: 4, popularity: -5, kpi: 2 }
      }
    ]
  },
  {
    id: 'evt_seed_common_k_souvenir',
    title: '调研的纪念品',
    npcName: '接待办主任',
    unitType: '通用',
    bands: ['科级', '处级'],
    theme: 'risk',
    description:
      '下去调研了两天，临走时接待办送来一个锦盒，说是本地工艺的茶具，'
      + '「不值几个钱，留个纪念」。盒子做得讲究，掀开是六只品茗杯，'
      + '杯托底下垫着一层绒布。绒布下面还压着一张卡，背面用铅笔写了一行数字。'
      + '送盒子的人在门口站着，等你签收单。',
    options: [
      {
        id: 'opt_a',
        text: '签收，盒子放进后备箱',
        costAp: 0,
        gainIllicit: 150000,
        effects: { risk: 9, popularity: 3 }
      },
      {
        id: 'opt_b',
        text: '茶具留下，卡塞回去让他带走',
        costAp: 0,
        effects: { risk: -2, popularity: -4, energy: 3 }
      },
      {
        id: 'opt_c',
        text: '整盒退掉，晚上在会上提了一句',
        costAp: 1,
        effects: { risk: -8, authority: 3, mgmt: -4, kpi: 3 }
      }
    ]
  },
  {
    id: 'evt_seed_common_c_land_gift',
    title: '地块上的诚意',
    npcName: '开发公司的副总',
    unitType: '通用',
    bands: ['处级', '厅级'],
    theme: 'risk',
    description:
      '那块地的出让条件里有一行是你改的。开发公司的副总在饭局散场后追出来，'
      + '说想请你「入个股」，不用出钱，也不用管事，「年底分红不会少你的」。'
      + '他把一个信封塞进你大衣口袋，动作很轻，像只是替你掸了掸灰。'
      + '街对面的路灯下停着一辆没熄火的车。',
    options: [
      {
        id: 'opt_a',
        text: '入股，年底再说',
        costAp: 0,
        gainIllicit: 3000000,
        effects: { risk: 12, mgmt: 6, popularity: 4 }
      },
      {
        id: 'opt_b',
        text: '把信封还回去，地的事按程序办',
        costAp: 0,
        effects: { risk: -6, mgmt: -5, authority: 5 }
      },
      {
        id: 'opt_c',
        text: '第二天带着信封去纪委说清楚',
        costAp: 1,
        effects: { risk: -16, mgmt: -10, popularity: -6, authority: 8 }
      }
    ]
  },
  {
    id: 'evt_seed_common_t_project_stake',
    title: '项目里的干股',
    npcName: '老板 陈总',
    unitType: '通用',
    bands: ['厅级', '省部级'],
    theme: 'risk',
    description:
      '那个上百亿的项目挂了三年，最后落在陈总手里。庆功宴上他端着杯子过来，'
      + '说这个项目「本来就有你一半」，账已经做好了，'
      + '放在一个你一定想不到的地方。他说这话的时候在笑，'
      + '满桌子人都在笑，只有你知道那不是一句玩笑。',
    options: [
      {
        id: 'opt_a',
        text: '不推辞，这份人情记下',
        costAp: 0,
        gainIllicit: 8000000,
        effects: { risk: 15, mgmt: 8, popularity: -3 }
      },
      {
        id: 'opt_b',
        text: '当场回绝，让项目重新招标',
        costAp: 2,
        effects: { risk: -8, mgmt: -8, authority: 8, kpi: 6 }
      },
      {
        id: 'opt_c',
        text: '不表态，先把这杯酒喝了',
        costAp: 0,
        effects: { risk: 10, mgmt: 2, popularity: -3 }
      }
    ]
  }
]

/**
 * 给 ./events.js 的老事件补标签。
 *
 * 老事件（征地拆迁、招商引资那 8 条）写的时候还没有标签这一套。不补的话，
 * 它们匹配不上任何一档日常题材，**只有抽到最后一档「全池兜底」才有机会出场**，
 * 而前面几档一旦有货，最后一档就永远轮不到——等于这 8 条白留着。
 *
 * 补成「通用／不限职级／日常」，它们就落在「通用池」那一档：
 * 本单位、本职级没料时才顶上，位置合理，内容也确实够通用。
 */
function tagLegacy(evt) {
  return { unitType: COMMON, bands: BANDS, theme: THEMES.DAILY, ...evt }
}

/**
 * 四项晋升资源的正收益放大系数。
 *
 * ── 治的是什么病 ────────────────────────────────────────────
 * 200 局「正常玩」模拟，登顶率 0.4%。终局资源均值：工作能力 94.9、
 * 政绩 85.1、人缘只有 32.1——另外三项早溢出了，人缘还差一半。
 *
 * 但**只补人缘没用**，这是扫过一遍才看明白的。把全池的正负收益
 * 按属性加总，跟八级台阶的总需求比一比（净供给 / 总需求）：
 *
 *     工作能力    +495 / −146   净 +349   需求 498   →  0.70
 *     向上管理    +813 / −819   净   −6   需求 467   →  ≈ 0
 *     人缘        +783 / −1111  净 −328   需求 433   →  负
 *     政绩        +638 / −666   净  −28   需求 510   →  ≈ 0
 *
 * 也就是说除了工作能力，另外三条腿在池子层面都是净零或净负的。
 * 只放大人的缘，人缘撞到 100 上限之后，卡住的就是向上管理和政绩——
 * 实测确实如此，只放人缘的那一轮扫描：
 *
 *     ×1.5 → 1.5%    ×2.0 → 3.5%    ×2.5 → 3.0%    ×3.0 → 1.5%
 *
 * 非单调，而且到顶也就 3.5%。墙没拆掉，只是从一条腿挪到了另一条腿上。
 *
 * ── 所以改成四项齐放 ────────────────────────────────────────
 * 补的是**供给**，不是把门槛放低：constants/promotion.js 的门槛表一个字没动。
 * 四项按同一个系数放，是为了不让某一条腿重新变成瓶颈——
 * 单独给哪一项开小灶，下一轮扫描就会看到墙挪到别处去。
 * 200 局一档、换三组种子各跑一遍（模拟脚本见 scripts/）：
 *
 *     ×1.3 →  3.0%    ×1.5 → 12.0%    ×1.8 → 18.0%
 *     ×2.0 → 16.5% / 19.0% / 19.5%   （三组种子，登顶年龄稳定 45 岁）
 *     ×2.2 → 20.5%
 *
 * 取 2.0：落在策划要的 15~25% 中段，三组种子都稳，最快登顶年龄 45 岁
 * 仍卡在区间里。调大调小都只改这一个数。
 *
 * ── 为什么只放大正值 ────────────────────────────────────────
 * 负值是**代价**（得罪老板、把袋子推回去），跟着一起放大等于把所有
 * 得罪人的选项额外罚一遍，玩家会算出来"少管闲事最划算"——
 * 那正好是这次改动要治的病。
 *
 * ── 为什么不放威信、精力、健康 ──────────────────────────────
 * 它们不是晋升门槛，是资源上限和状态，放大它们等于改游戏节奏，
 * 跟"拆掉瓶颈"是两回事。系数只作用在 PROMOTION_GATES 这四个键上。
 */
export const GAIN_SCALE = 2.0

/**
 * 把四项晋升资源的正收益放大。返回新对象，不动原事件——自检可能还要看原值。
 *
 * 循环走 PROMOTION_GATES 而不是写死四个键名：门槛表将来加一项、改个名，
 * 这里不用记得同步。漏同步的后果是静默的——那一项悄悄退回原值，
 * 表现得像"这次改动没生效"，最难查。
 */
function scaleGains(event) {
  const options = (event.options || []).map((opt) => {
    const effects = opt.effects || {}
    let touched = false
    const next = { ...effects }
    for (const key of PROMOTION_GATES) {
      const gain = Number(effects[key]) || 0
      if (gain <= 0) continue
      next[key] = Math.max(1, Math.round(gain * GAIN_SCALE))
      touched = true
    }
    return touched ? { ...opt, effects: next } : opt
  })
  return { ...event, options }
}

/**
 * 全池。抽取只看这个数组，不看它由几部分拼成。
 *
 * 顺序有讲究：种子在前，机器产出的在后，老事件垫底。
 * eventPool 的抽取是「候选里随机取一」，与顺序无关，
 * 但人翻文件时前面就是最该看的那几条。
 *
 * 收益放大放在**拼装这一步**，而不是在三个池子里各改一遍：
 * 三个来源（手写种子 / 机器生成 / 老事件）各有各的写法，
 * 而且 localEvents.generated.js 是 gen_events.py 的产物，手改了下次生成就没了。
 * 在这里过一道，将来加第四个来源也不用记得再补一次。
 */
export const LOCAL_EVENTS = [
  ...SEED_EVENTS,
  ...GENERATED,
  ...MOCK_EVENTS.map(tagLegacy)
].map(scaleGains)

/**
 * 事件池自检。**开发环境才跑**，生产环境由脚本侧拦。
 *
 * 为什么要有这个：EventModal 是关不掉的（玩家必须做选择），而「推进工作」
 * 只要 AP>0 就能点。玩家剩 1 点 AP、手里这个事件最便宜的选项也要 2 点，
 * 三个选项就全部置灰、弹窗又关不掉——**死局**，只能刷新。
 * 池子上百条，靠人眼盯这条不变量是不现实的。
 */
export function validatePool(pool = LOCAL_EVENTS) {
  const problems = []
  const seen = new Set()

  pool.forEach((evt, idx) => {
    const who = evt && evt.id ? evt.id : `#${idx}`
    if (!evt || !evt.id || !evt.title || !evt.description) {
      problems.push(`${who}：缺少 id / title / description`)
      return
    }
    if (seen.has(evt.id)) problems.push(`${who}：id 重复，避重会失灵`)
    seen.add(evt.id)

    // ── 事件级门槛的合法性 ──
    // 键写错（abilityy、kpi 写成 performance）不会报错，只会让这条事件
    // 永远抽不到或永远抽得到——两种都是静默失败，必须在这一层拦下。
    if (evt.minGates !== undefined) {
      if (!evt.minGates || typeof evt.minGates !== 'object') {
        problems.push(`${who}：minGates 必须是对象，如 { ability: 45 }`)
      } else {
        Object.keys(evt.minGates).forEach((key) => {
          if (!GATE_KEYS.includes(key)) {
            problems.push(
              `${who}：minGates 的键「${key}」不是可判定的门槛项`
              + `（应为 ${GATE_KEYS.join(' / ')}），永远不会生效`
            )
            return
          }
          const want = Number(evt.minGates[key])
          if (!Number.isFinite(want) || want <= 0) {
            problems.push(`${who}：minGates.${key} 必须是正数，实为 ${evt.minGates[key]}`)
          }
        })
      }
    }

    // ── 一次性标记位的合法性 ──
    // 写错一个字母的表现是**静默失效**：标记位永远置不起来，这条事件就一直
    // 留在池子里，整池抽干后的冷却重置照样把它捞回来——而退池正是它写
    // onceFlag 的唯一理由。所以这里要求它必须是 gameStatus 上真有的一个键。
    if (evt.onceFlag !== undefined) {
      if (typeof evt.onceFlag !== 'string' || !evt.onceFlag) {
        problems.push(`${who}：onceFlag 必须是非空字符串（gameStatus 上的字段名）`)
      } else if (!Object.prototype.hasOwnProperty.call(INITIAL_GAME_STATUS, evt.onceFlag)) {
        problems.push(
          `${who}：onceFlag「${evt.onceFlag}」不是 gameStatus 上的字段，`
          + '标记位永远置不起来，这条事件退不了池'
        )
      }
    }

    if (!Array.isArray(evt.options) || !evt.options.length) {
      problems.push(`${who}：没有选项`)
      return
    }
    if (!evt.options.some((o) => Number(o.costAp) === 0)) {
      problems.push(`${who}：没有 costAp=0 的选项，行动力不足时会卡死`)
    }
    evt.options.forEach((o) => {
      if (!o.effects || typeof o.effects !== 'object') {
        problems.push(`${who}：选项 ${o.id} 缺少 effects`)
        return
      }

      // ── 白嫖不变量 ──
      // 「推进工作」只要 ap > 0 就能点，而抽事件本身不耗行动力——所以只要手上
      // 还有 1 点 AP，玩家就能无限抽事件；一个不耗行动力又给晋升门槛**净加分**的
      // 选项，就能被反复点到四项刷满。允许的例外只有两种：它同时涨了足够高的
      // 风险（自己惩罚自己），或者它要花钱（钱是有限的，刷不动）。
      //
      // 判据是**净和**，不是"只把正的加起来"。这一点踩过坑：早先按正项算，
      // 于是「让贤」这种 +5 人缘 / −6 政绩的选项被判成可以刷——可它每点一次
      // 玩家的门槛总分是**退**的，刷它只会越刷越差，根本刷不动。
      // 按净和算，只有真正"点了不亏"的免费选项才该被拦。
      //
      // 威信必须算进来，而且**按名望分折算**（÷ AUTHORITY_PER_BONUS，即 10）。
      // 自从威信接进晋升判定，一个免费 +10 威信的选项等价于四项门槛各 +1，
      // 而它不在 PROMOTION_GATES 里——不折算就会从这条不变量的缝里漏过去，
      // 变成"点一百次威信刷满四项门槛"。按 10:1 折算，+10 威信计 1 分，
      // 跟它在判定里的实际价值一致；不足 10 点的零头仍然计小数，
      // 因为那种选项一样可以无限点（点十次就凑够 1 分了）。
      const net = PROMOTION_GATES.reduce(
        (sum, key) => sum + (Number(o.effects[key]) || 0),
        0
      ) + (Number(o.effects.authority) || 0) / AUTHORITY_PER_BONUS
      if ((Number(o.costAp) || 0) === 0 && net > 0) {
        const spent = moneySpentBy(o)
        const risk = Number(o.effects.risk) || 0
        if (spent <= 0 && risk < RISK_SELF_PUNISH) {
          problems.push(
            `${who}：选项 ${o.id} 不耗行动力却净加 ${net} 点晋升门槛，`
            + `而风险只有 ${risk}（需 ≥ ${RISK_SELF_PUNISH}）——可以无限点击刷分`
          )
        }
      }

      // ── 家产字段的合法性 ──
      // 写成负数是最容易犯的错：想表达"花钱"就顺手写 costMoney: -5000，
      // 引擎那边按 > 0 判断，负数会被当成"不花钱"，于是白拿效果还不扣钱。
      ;['costMoney', 'gainMoney', 'gainIllicit'].forEach((key) => {
        if (o[key] === undefined) return
        const num = Number(o[key])
        if (!Number.isFinite(num) || num <= 0) {
          problems.push(`${who}：选项 ${o.id} 的 ${key} 必须是正数（花/赚多少），实为 ${o[key]}`)
        }
      })

      // ── 置办资产的合法性 ──
      // kind / holder 写错，引擎那边是"这次置办作废"（buyAsset 返回 ok:false），
      // 但玩家看到的会是一个点了没反应的选项——而且钱还可能已经按目录扣了。
      // 两个枚举都必须在这里拦下。
      if (o.buyAsset !== undefined) {
        const buy = o.buyAsset
        if (!buy || typeof buy !== 'object') {
          problems.push(`${who}：选项 ${o.id} 的 buyAsset 必须是对象，如 { kind: 'car', holder: 'self' }`)
        } else {
          if (!ASSET_KINDS.includes(buy.kind)) {
            problems.push(
              `${who}：选项 ${o.id} 的 buyAsset.kind「${buy.kind}」不在资产目录内`
              + `（应为 ${ASSET_KINDS.join(' / ')}）`
            )
          }
          if (buy.holder !== undefined && !ASSET_HOLDERS.includes(buy.holder)) {
            problems.push(
              `${who}：选项 ${o.id} 的 buyAsset.holder「${buy.holder}」不合法`
              + `（应为 ${ASSET_HOLDERS.join(' / ')}）`
            )
          }
        }
      }

      // surrender 是布尔开关，写成 'true' 这种字符串会让引擎的 if 判定
      // 恰好为真、看起来能用，但读起来是在赌；写错成 false 则静默失效。
      if (o.surrender !== undefined && typeof o.surrender !== 'boolean') {
        problems.push(`${who}：选项 ${o.id} 的 surrender 必须是布尔值，实为 ${typeof o.surrender}`)
      }

      // ── 遴选/借调的合法性 ──
      // unitType 是硬约束（见 game/transfer.js）：写进一个池子里没有的值，
      // 玩家不会看到报错，只会从此抽不到对口事件。在这里就拦下来。
      if (o.transfer !== undefined) {
        if (!o.transfer || typeof o.transfer !== 'object') {
          problems.push(`${who}：选项 ${o.id} 的 transfer 必须是对象`)
        } else if (!UNIT_TYPES.includes(o.transfer.unitType)) {
          problems.push(
            `${who}：选项 ${o.id} 的 transfer.unitType「${o.transfer.unitType}」`
            + `不是合法单位类型（应为 ${UNIT_TYPES.join(' / ')}）`
          )
        }
      }
    })
  })

  return problems
}

export default LOCAL_EVENTS
