/**
 * 事件池（本地 mock）
 *
 * 严格遵循 GameEvent 契约，字段与 backend/models.py 的 GameEvent / EventOption 一一对应：
 *   { id, title, description, options: [{ id, text, costAp, effects }] }
 *
 * effects 的键必须是八项资源之一，后端会校验，写错会 422。
 * 接 AI 之后本文件降级为"接口异常时的兜底事件池"，不删。
 */

export const MOCK_EVENTS = [
  {
    id: 'evt_demolition',
    title: '征地拆迁协调会',
    description:
      '县里下达了高铁新区的征地任务，涉及三个村的祖坟迁移，群众情绪激烈。'
      + '镇党委书记在会上问："谁牵头啃这块硬骨头？"会议室里一片沉默。',
    options: [
      {
        id: 'take',
        text: '主动请缨，我牵头',
        costAp: 1,
        effects: { kpi: 8, energy: -15, health: -5, authority: 5, mgmt: 3 }
      },
      {
        id: 'watch',
        text: '稳妥观望，等书记点名',
        costAp: 0,
        // 观望是"没接活"，所以能力不长。不写这一项的话它是净 +2 的免费
        // 向上管理，而代价只有会自动恢复的精力，可以无限刷。
        effects: { mgmt: 1, energy: -3, authority: -2, ability: -3 }
      },
      {
        id: 'pass',
        text: '推给老同志，说这块他熟',
        costAp: 0,
        effects: { popularity: -6, authority: -4, energy: -2 }
      }
    ]
  },
  {
    id: 'evt_inspection',
    title: '上级调研接待',
    description:
      '市委组织部常务副部长明天来镇里调研，行程半天。'
      + '办公室主任拿着一份接待方案来找你："要不要您全程陪同？"',
    options: [
      {
        id: 'full',
        text: '全程陪同，午宴标准提一档',
        costAp: 1,
        effects: { mgmt: 8, authority: 3, energy: -12, risk: 6 }
      },
      {
        id: 'normal',
        text: '按标准接待，全程陪同',
        costAp: 1,
        effects: { mgmt: 5, energy: -10, risk: 1 }
      },
      {
        id: 'delegate',
        text: '让分管副职陪同，自己留守',
        costAp: 0,
        effects: { mgmt: -4, energy: -2, popularity: 2 }
      }
    ]
  },
  {
    id: 'evt_friend',
    title: '老同学请托',
    description:
      '大学同寝室的老周突然来访，拎着两条烟。他小舅子投标镇上的道路工程落了标，'
      + '想让你"帮忙问问情况"。烟不便宜，但话没说死。',
    options: [
      {
        id: 'help',
        text: '先收下东西，问一句也就是个电话的事',
        costAp: 0,
        effects: { risk: 18, popularity: 6, authority: 2, kpi: -3 }
      },
      {
        id: 'decline',
        text: '东西退回去，把政策讲清楚',
        costAp: 0,
        effects: { popularity: -5, risk: -6, authority: 4 }
      },
      {
        id: 'report',
        text: '退礼之余，一并向纪委报备',
        costAp: 1,
        effects: { risk: -12, popularity: -12, authority: 8, mgmt: 5 }
      }
    ]
  },
  {
    id: 'evt_material',
    title: '书记要的材料',
    description:
      '书记明天上午要在全县大会上发言，晚上十点打电话："材料我看了，站位还不够高，你亲自改一改。"',
    options: [
      {
        id: 'overnight',
        text: '通宵亲自动手，明早呈上',
        costAp: 1,
        effects: { mgmt: 9, energy: -20, health: -8, ability: 3 }
      },
      {
        id: 'office',
        text: '转给办公室连夜改，自己把关',
        costAp: 0,
        // 转手改的材料终究隔一层，书记那篇讲话的分量要打折——所以政绩是负的。
        // 补上 kpi 这一项之前，它是净 +2 的免费向上管理。
        effects: { mgmt: 2, energy: -5, ability: -1, kpi: -4 }
      },
      {
        id: 'excuse',
        text: '推说自己在外地，明天赶不回来',
        costAp: 0,
        effects: { mgmt: -8, authority: -3, energy: 0 }
      }
    ]
  },
  {
    id: 'evt_gdp',
    title: '招商引资指标',
    description:
      '县里下达的季度招商到位资金指标还差三成。分管副县长在电话里说得直白：'
      + '"数据上先想想办法，年底再冲回来。"统计员拿着表格站在你桌前等你签字。',
    options: [
      {
        id: 'inflate',
        text: '签字，按口头要求报数',
        costAp: 0,
        effects: { kpi: 12, mgmt: 6, risk: 22, ability: -4 }
      },
      {
        id: 'honest',
        text: '如实上报，附情况说明',
        costAp: 1,
        effects: { kpi: -8, mgmt: -6, risk: -8, authority: 5, ability: 4 }
      },
      {
        id: 'push',
        text: '亲自跑一趟开发区，看能不能真拉来两个项目',
        costAp: 2,
        effects: { kpi: 6, ability: 6, mgmt: 4, energy: -18, health: -5, popularity: 2 }
      }
    ]
  },
  {
    id: 'evt_dinner',
    title: '民主推荐会前的饭局',
    description:
      '下周就是民主推荐会了。晚上有老板做东，在城郊会所摆了一桌，'
      + '说是"几个朋友聚聚"，在座的有两位是本届的推荐代表。',
    options: [
      {
        id: 'go',
        text: '去，多个朋友多条路',
        costAp: 1,
        effects: { popularity: 8, mgmt: 4, risk: 15, energy: -8 }
      },
      {
        id: 'skip',
        text: '婉言推掉，回家休息',
        costAp: 0,
        effects: { risk: -4, popularity: -4, energy: 6 }
      }
    ]
  },
  {
    id: 'evt_safety',
    title: '安全生产检查',
    description:
      '辖区一家化工厂的消防手续不全，检查通知已经下来了。'
      + '厂长是本地纳税大户，镇里不少事都要仰仗他。他连夜登门，说"给我三天时间补办"。',
    options: [
      {
        id: 'cover',
        text: '先不上报，给他三天',
        costAp: 0,
        effects: { risk: 20, popularity: 4, kpi: 2, authority: -3 }
      },
      {
        id: 'report',
        text: '照章上报，限期整改',
        costAp: 1,
        effects: { risk: -5, authority: 8, popularity: -6, kpi: 3 }
      },
      {
        id: 'inspect',
        text: '亲自带队蹲点，督着三天内补齐',
        costAp: 2,
        effects: { ability: 5, authority: 6, kpi: 5, energy: -16, health: -6, risk: -3 }
      }
    ]
  },
  {
    id: 'evt_quota',
    title: '推荐名额只有一个',
    description:
      '镇里这次只有一个副科级后备干部推荐名额。'
      + '另一位竞争者老李资历和你相当，昨天刚请全科室吃了顿饭。'
      + '书记让你俩各自准备一份述职材料。',
    options: [
      {
        id: 'hard',
        text: '拿出实绩，材料写透',
        costAp: 2,
        effects: { ability: 6, kpi: 8, energy: -14, popularity: -3 }
      },
      {
        id: 'network',
        text: '先挨个科室走动走动',
        costAp: 1,
        effects: { popularity: 9, mgmt: 3, energy: -10, ability: -2 }
      },
      {
        id: 'yield',
        text: '主动让贤，卖书记一个人情',
        costAp: 0,
        // 让贤是**放弃一次露脸的机会**，所以能力与政绩都要往下走。
        // 这两项必须真扣够：晋升门槛只认 ability / mgmt / popularity / kpi 四项，
        // authority（职务权威）不在其中——拿它垫背是垫不住的，
        // 这个选项原来的 mgmt+7 popularity+5 就是靠 authority 垫出净 +7 的免费午餐。
        effects: { mgmt: 1, popularity: 2, kpi: -5, authority: -4, ability: -5 }
      }
    ]
  }
]

export default MOCK_EVENTS
