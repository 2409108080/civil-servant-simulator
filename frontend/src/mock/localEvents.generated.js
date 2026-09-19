/**
 * 本地事件库（**机器生成，请勿手改**）
 *
 * 由 scripts/gen_events.py 产出。要增删改，改脚本再跑，或把手写的内容放进
 * localEvents.js 的 SEED_EVENTS 里——那个文件是人的地盘，这个是脚本的地盘。
 * 直接编辑本文件的话，下次跑脚本就没了。
 *
 * 字段分两拨：
 *   契约字段 id / title / description / options  —— 与 backend/models.py 的 GameEvent 一致
 *   本地标签 npcName / unitType / bands / theme   —— 只服务于本地抽取，
 *       上报后端前会被 api/event.js 的 stripLocalMeta() 剥掉，不进网络
 *
 * 共 107 条，覆盖 4 单位 × 4 职级档 + 廉政/健康两类强制题材 + 通用兜底。
 * @risk-damped: v1（正向风险已按 ×0.6 下调，勿重复运行 damp_risk.mjs）
 */

export default [
  {
    id: "evt_core_k_deepnight_draft",
    title: "深夜改稿",
    npcName: "分管副主任 老陈",
    unitType: "核心部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "晚上十一点，明早八点半全市大会上书记要讲话，稿子你已经改到第三稿。分管副主任老陈把你叫到办公室，说书记那边传话，第二部分要往对标对表上靠，去年那个没达标的数字，含糊处理一下就行。你心里清楚，那个数是督查室核过的，白纸黑字。老陈点上烟，说改完先给他看。",
    options: [
      {
        id: "opt_a",
        text: "连夜改，把数字含糊过去",
        costAp: 1,
        effects: {
          energy: -12,
          health: -6,
          mgmt: 8,
          risk: 5
        }
      },
      {
        id: "opt_b",
        text: "保留原数，另附情况说明",
        costAp: 1,
        effects: {
          authority: 6,
          ability: 8,
          mgmt: -8,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "先不动，明早再说",
        costAp: 0,
        effects: {
          risk: 6,
          energy: -5,
          mgmt: -3
        }
      }
    ]
  },
  {
    id: "evt_core_k_coordination_meeting",
    title: "协调会僵局",
    npcName: "某局科长 老李",
    unitType: "核心部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "主任交代你牵头协调一件事，会议室里两个局的科长谁也不肯先签字，都说不归自己管。你的级别和他们一样，说话没分量。会开了两个小时，纪要还空着分工那一栏。主任说，今天必须形成纪要，责任要压实到具体单位，明天他要用。窗外天已经擦黑。",
    options: [
      {
        id: "opt_a",
        text: "搬出主任，说这是他的意思",
        costAp: 1,
        effects: {
          authority: 6,
          mgmt: 4,
          popularity: -8,
          risk: 4,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "纪要写成分工待明确",
        costAp: 0,
        effects: {
          kpi: -6,
          authority: -4,
          risk: 5
        }
      },
      {
        id: "opt_c",
        text: "当场分工，自己单位兜底",
        costAp: 2,
        effects: {
          kpi: 10,
          authority: 8,
          risk: 6,
          energy: -12,
          health: -6
        }
      }
    ]
  },
  {
    id: "evt_core_k_cadre_review",
    title: "考察材料",
    npcName: "考察组同事 小郑",
    unitType: "核心部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "部里安排你参加一名拟提拔干部的考察。谈话中有人反映，这位同志上一摊工作里有一笔经费去向不太清楚，说得很含糊，末了加一句，你心里有数就行。考察材料明天上会。这位同志平时对你不错，他的分管领导也打过招呼，说组织上会考虑的。",
    options: [
      {
        id: "opt_a",
        text: "如实写，不给结论只列事实",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          popularity: -10,
          mgmt: -6,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "材料不写，口头向部长汇报",
        costAp: 1,
        effects: {
          mgmt: 6,
          popularity: 4,
          risk: 6,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "线索转分管副部长，自己退",
        costAp: 0,
        effects: {
          risk: 5,
          ability: -4,
          popularity: -2
        }
      }
    ]
  },
  {
    id: "evt_core_k_inspection_reception",
    title: "接待方案",
    npcName: "办公室副主任 老周",
    unitType: "核心部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "上级调研组后天到，一行六人。办公室拟的接待方案里，住宿和用餐都比规定高了一档，老周说这是惯例，兄弟单位都这么办，走会议费科目就行。方案上有一栏要科室负责人签字报批。你只是个科室负责人，签了字，这笔账就挂在你名下。",
    options: [
      {
        id: "opt_a",
        text: "按惯例签，方案报上去",
        costAp: 1,
        effects: {
          mgmt: 8,
          popularity: 6,
          risk: 7,
          energy: -4
        }
      },
      {
        id: "opt_b",
        text: "压回规定标准，得罪人",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 4,
          popularity: -8,
          mgmt: -6
        }
      },
      {
        id: "opt_c",
        text: "方案退回，让他们自己签",
        costAp: 0,
        effects: {
          risk: 5,
          popularity: -6,
          mgmt: -4
        }
      }
    ]
  },
  {
    id: "evt_core_k_duty_call",
    title: "夜班电话",
    npcName: "值班员 老刘",
    unitType: "核心部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "夜里两点，你值夜班，电话响了。下面报上来一件事，暂时没有人员伤亡，但情况还在发展。对方说，先口头跟您报一声，等天亮了、情况明朗了再正式上报，免得惊动上面。你打主任的电话，关机。值班日志摊在桌上，落笔就是留痕。",
    options: [
      {
        id: "opt_a",
        text: "按程序立即上报，不等",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          mgmt: -4,
          energy: -8,
          risk: -6
        }
      },
      {
        id: "opt_b",
        text: "先电话告知副主任，等天亮",
        costAp: 1,
        effects: {
          mgmt: 4,
          popularity: 4,
          risk: 6,
          energy: -4
        }
      },
      {
        id: "opt_c",
        text: "先压着，自己盯着，天亮再说",
        costAp: 0,
        effects: {
          risk: 8,
          energy: -8,
          health: -4
        }
      }
    ]
  },
  {
    id: "evt_core_c_gdp_ledger_night",
    title: "口径里的三个点",
    npcName: "统计局副局长 老陈",
    unitType: "核心部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "季度数据出来，增速比预期低了0.3个百分点。老陈坐在你对面，烟灰堆了半缸：「几个县报上来的口径不太一样，统一按规上算，数字能好看点。这个事，原则上可以协调。」上会材料明天一早就要送到市里。你手里这支笔，写的是全市的脸面，也是你自己那份考核表。",
    options: [
      {
        id: "opt_a",
        text: "让老陈统一口径，重算一版",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 6,
          risk: 6,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "原数上报，后面附一段说明",
        costAp: 0,
        effects: {
          authority: 6,
          mgmt: -7,
          kpi: -5
        }
      },
      {
        id: "opt_c",
        text: "先压一压，等书记过目再定",
        costAp: 1,
        effects: {
          mgmt: 4,
          kpi: -4,
          risk: 4,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_core_c_inspection_route_swap",
    title: "调研线路上的那个点",
    npcName: "市委办副主任 老韩",
    unitType: "核心部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "市长下周调研现代服务业，行程初稿里有个园区，去年立了项，到现在还是一片空地。老韩把稿子推过来：「要不换到城东那个，包装一下，好看。」主任出差在外，行程今天得定。如实报，领导到了看见荒地，谁都不好过；换点位，上下都得打个招呼，将来有人翻出来，落笔的人跑不掉。",
    options: [
      {
        id: "opt_a",
        text: "换成城东那个点，重新包装",
        costAp: 2,
        effects: {
          mgmt: 8,
          kpi: 6,
          risk: 7,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "如实报，一个字都不动",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 4,
          popularity: -8,
          mgmt: -6
        }
      },
      {
        id: "opt_c",
        text: "两个都排上，让领导自己挑",
        costAp: 0,
        effects: {
          energy: -5,
          risk: 8,
          mgmt: 2,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_core_c_ball_passing_meeting",
    title: "协调会上的皮球",
    npcName: "财政局副局长 老刘",
    unitType: "核心部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "你牵头开跨部门协调会，一个产业配套政策卡在资金拨付上。财政局说指标要等人大，工信说企业的机器已经转起来了，谁都不肯先在会签单上落笔。老刘端着茶杯：「这个事，是不是请分管市长定一下？」会议室静得能听见空调声。责任压实了，今天就得罪人；签个字往上报，将来倒查，第一个名字是你。",
    options: [
      {
        id: "opt_a",
        text: "当场定分工，责任到人",
        costAp: 2,
        effects: {
          authority: 10,
          ability: 6,
          popularity: -10,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "写个请示，报分管市长定",
        costAp: 1,
        effects: {
          mgmt: 6,
          risk: 3,
          kpi: -4,
          ability: -4
        }
      },
      {
        id: "opt_c",
        text: "先散会，会后单独协调一下",
        costAp: 0,
        effects: {
          energy: -4,
          risk: 8,
          popularity: 3,
          kpi: -4
        }
      }
    ]
  },
  {
    id: "evt_core_c_cadre_slot_note",
    title: "递进来的那份简历",
    npcName: "原副部长 老郑",
    unitType: "核心部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "干部考察进入酝酿阶段，一个空缺岗位有三个人选。中午，已经退休的老郑在食堂跟你坐了一会儿，话没说透：「小周那个孩子是我看着长大的，条件也够，组织上会考虑的。」照程序走，就是拿条件一比一过筛；卖个顺水人情，往后考察组那边还得再去打招呼。你在这个位子上，才半年。",
    options: [
      {
        id: "opt_a",
        text: "按程序办，一个字不加",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 5,
          popularity: -8,
          mgmt: -5
        }
      },
      {
        id: "opt_b",
        text: "给老郑面子，简历递进考察组",
        costAp: 2,
        effects: {
          popularity: 7,
          mgmt: 5,
          risk: 8,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "这个事先放一放，下次再说",
        costAp: 0,
        effects: {
          energy: -4,
          risk: 5,
          popularity: -2,
          kpi: -4
        }
      }
    ]
  },
  {
    id: "evt_core_c_speech_draft_seven",
    title: "第七稿的落点",
    npcName: "综合处处长 小林",
    unitType: "核心部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "书记明天在全市大会上的讲话稿，已经改到第七稿。小林凌晨两点把稿子发过来，附了一句：「书记昨天提了一嘴，要有点新提法。」新提法这东西，说重了收不住，说轻了没分量。稿子最后是你签字送审。你在办公室里，把前三段又读了一遍，窗外天快亮了。",
    options: [
      {
        id: "opt_a",
        text: "自己动手改，通宵也要磨出来",
        costAp: 2,
        effects: {
          kpi: 8,
          ability: 7,
          energy: -12,
          health: -8
        }
      },
      {
        id: "opt_b",
        text: "让小林再改一版，先报个初稿",
        costAp: 1,
        effects: {
          mgmt: 5,
          popularity: -5,
          energy: -5,
          kpi: -3
        }
      },
      {
        id: "opt_c",
        text: "维持原稿，把提法压一压",
        costAp: 0,
        effects: {
          authority: 4,
          mgmt: -6,
          kpi: -5,
          energy: -3
        }
      }
    ]
  },
  {
    id: "evt_core_c_special_fund_queue",
    title: "专项资金的那张表",
    npcName: "县发改委主任 老赵",
    unitType: "核心部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "一笔产业专项资金下到市里，两个县都在争。老赵下午来过，坐立不安，说他们的项目就等这笔钱开工，末了还带了一句你老家那边领导的话。资金分配方案明天上会，表格上只差你签字。按申报材料排队，老赵的县排在后面；真要照顾，材料也可以微调。这是你手上第一笔能拍的钱。",
    options: [
      {
        id: "opt_a",
        text: "按申报排序，一个字不动",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 5,
          popularity: -8,
          mgmt: -6
        }
      },
      {
        id: "opt_b",
        text: "给老赵的县往前调一格",
        costAp: 2,
        effects: {
          popularity: 6,
          mgmt: 6,
          risk: 8,
          energy: -5
        }
      },
      {
        id: "opt_c",
        text: "把方案报上去，让上面去定",
        costAp: 0,
        effects: {
          mgmt: -3,
          kpi: -4,
          energy: -4,
          risk: 4
        }
      }
    ]
  },
  {
    id: "evt_core_t_midnight_figures",
    title: "汇报材料上的两个数",
    npcName: "分管副市长 老郑",
    unitType: "核心部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "省里明天上午听取全市经济运行汇报，材料已经过了三遍。分管副市长坐到你对面的沙发上，指着规上工业增加值说，这个数和统计口径对不上，原则上可以再核一核。你心里清楚，调平了省里好交差，窟窿得留到明年。窗外这一层楼还亮着灯，都在等你点头。",
    options: [
      {
        id: "opt_a",
        text: "按领导意思把数调平",
        costAp: 1,
        effects: {
          mgmt: 10,
          kpi: 5,
          risk: 7,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "据实上报，另附口径说明",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 5,
          kpi: -6,
          mgmt: -8,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "推说口径待核，先压一天",
        costAp: 0,
        effects: {
          mgmt: -6,
          kpi: -3,
          energy: -3
        }
      }
    ]
  },
  {
    id: "evt_core_t_cross_dept_meeting",
    title: "协调会上的皮球",
    npcName: "财政局长 老马",
    unitType: "核心部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "你牵头开重点民生工程协调会，已经第三轮。财政局说没有资金来源，住建局说方案还没定，两边都在念自己的文件，皮球踢得滴水不漏。领导撂下话，月底见结果。会议纪要由你落笔，责任往谁身上写重一点，谁就会记你一笔。",
    options: [
      {
        id: "opt_a",
        text: "纪要写明清财政局先拨付",
        costAp: 1,
        effects: {
          mgmt: 6,
          kpi: 5,
          popularity: -8,
          risk: 3
        }
      },
      {
        id: "opt_b",
        text: "两家各打五十大板都写上",
        costAp: 1,
        effects: {
          authority: 6,
          kpi: 3,
          popularity: -6,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "纪要暂不定责，提请再议",
        costAp: 0,
        effects: {
          kpi: -5,
          mgmt: -5,
          popularity: -4
        }
      }
    ]
  },
  {
    id: "evt_core_t_quota_breakdown",
    title: "指标分不下去",
    npcName: "常务副市长 老韩",
    unitType: "核心部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "省里下达全年固定资产投资增速目标，市里要分解到各县区。几个大县私下打了招呼，说基数太高，实在接不住。常务副市长让你把会开了，灵活把握，既要数字好看，又要落到人头。签下去，就是年底考核的账。",
    options: [
      {
        id: "opt_a",
        text: "按省里口径均摊到各县区",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 5,
          popularity: -8,
          risk: 4
        }
      },
      {
        id: "opt_b",
        text: "给大县调低，小县补上",
        costAp: 1,
        effects: {
          popularity: 6,
          kpi: 2,
          risk: 6,
          mgmt: -4
        }
      },
      {
        id: "opt_c",
        text: "先不下文，等对口核实",
        costAp: 0,
        effects: {
          kpi: -6,
          mgmt: -6,
          ability: -2
        }
      }
    ]
  },
  {
    id: "evt_core_t_instruction_docket",
    title: "压了十七天的批示件",
    npcName: "市委办副主任 老徐",
    unitType: "核心部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "书记在省里会上的一份材料上批了话，转到你手上已经压了十七天。承办局回话说，这条政策口径没定，不敢动。批示件办理时限马上到，督查通报会上要点名。副主任说这个事先放一放也来得及，可台账上的痕，抹不掉。",
    options: [
      {
        id: "opt_a",
        text: "约谈承办局，限期报结果",
        costAp: 1,
        effects: {
          kpi: 6,
          mgmt: 5,
          popularity: -6,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "自己先拿出办理意见",
        costAp: 2,
        effects: {
          ability: 6,
          mgmt: 8,
          energy: -12,
          risk: 3,
          health: -5
        }
      },
      {
        id: "opt_c",
        text: "按程序挂账，续办",
        costAp: 0,
        effects: {
          risk: 5,
          mgmt: -5,
          kpi: -4
        }
      }
    ]
  },
  {
    id: "evt_core_t_inspection_report",
    title: "整改报告怎么写",
    npcName: "整改专班 老陈",
    unitType: "核心部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "巡视反馈意见的整改报告到了期限。初稿把六项问题并成四项，措辞从违规改成了不够规范。领导签字前让你再核一遍，说顾全大局，留痕要全。你清楚，省里回头看的时候，这份报告就是白纸黑字的依据。",
    options: [
      {
        id: "opt_a",
        text: "照初稿报，措辞不留口实",
        costAp: 1,
        effects: {
          mgmt: 8,
          kpi: 4,
          risk: 7,
          popularity: -5
        }
      },
      {
        id: "opt_b",
        text: "六项如实补齐再报",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 6,
          mgmt: -8,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "退回承办处重新核实",
        costAp: 0,
        effects: {
          kpi: -5,
          mgmt: -5,
          energy: -4,
          ability: -2
        }
      }
    ]
  },
  {
    id: "evt_core_s_midnight_data_check",
    title: "深夜的增速差",
    npcName: "省委副秘书长 老陈",
    unitType: "核心部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "夜里十一点，办公厅的灯还亮着。副秘书长把明天全省经济工作会的讲话稿放到你桌上：两个市上报的规上工业增速，与统计口径差了近一个百分点。一把手明早要拿这份材料对上汇报。老陈说，原则上以统计局的数据为准，可那样某个市今年的成绩单就不好看，要不要请统计局再协调一下。",
    options: [
      {
        id: "opt_a",
        text: "按统计口径报，谁难看谁难看",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 5,
          popularity: -8,
          kpi: -4
        }
      },
      {
        id: "opt_b",
        text: "请统计局协调一下口径",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 8,
          risk: 9,
          ability: -4
        }
      },
      {
        id: "opt_c",
        text: "先放一放，会上口头说明",
        costAp: 0,
        effects: {
          energy: 5,
          mgmt: -8,
          kpi: -6,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_core_s_cadre_battle",
    title: "市委书记人选",
    npcName: "组织部副部长 老韩",
    unitType: "核心部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "组织部把市委书记人选的比选材料送上来。一位在省里多年，敢碰硬，前年处置一起群体事件时得罪了几位老同志；另一位履历干净、口碑温和，上面有人打过招呼。老韩把两份材料并排摆在桌上，说材料都按程序做了，剩下的是组织上的考虑。",
    options: [
      {
        id: "opt_a",
        text: "用敢碰硬的那一个",
        costAp: 2,
        effects: {
          authority: 10,
          ability: 6,
          mgmt: -10,
          popularity: -6
        }
      },
      {
        id: "opt_b",
        text: "用上面打过招呼的那个",
        costAp: 1,
        effects: {
          mgmt: 10,
          popularity: 6,
          risk: 6,
          ability: -6
        }
      },
      {
        id: "opt_c",
        text: "让组织部再考察一轮",
        costAp: 0,
        effects: {
          energy: 5,
          mgmt: -6,
          kpi: -5,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_core_s_project_tug_of_war",
    title: "项目落哪个市",
    npcName: "省发改委主任 老周",
    unitType: "核心部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "一个新能源整车项目要在全省布点，两个市都递了申请。一个配套齐全但地方债务压力大，一个书记刚在会上表过态、地价便宜，产业链却是空的。国家给的能耗指标只够一家。发改委主任说，原则上按产业布局规划办，可规划本身也是可以灵活把握的。",
    options: [
      {
        id: "opt_a",
        text: "按产业配套，落在甲市",
        costAp: 2,
        effects: {
          ability: 8,
          authority: 6,
          popularity: -8,
          kpi: 6
        }
      },
      {
        id: "opt_b",
        text: "给在会上表过态的那个市",
        costAp: 1,
        effects: {
          mgmt: 10,
          kpi: 6,
          risk: 7,
          popularity: -4
        }
      },
      {
        id: "opt_c",
        text: "报请上会，集体研究",
        costAp: 0,
        effects: {
          kpi: -8,
          mgmt: -5,
          ability: -3,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_core_s_inspection_rectify",
    title: "巡视反馈之后",
    npcName: "巡视组联络员 老赵",
    unitType: "核心部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "中央巡视组反馈的问题清单里有一条，指向你分管领域的专项资金闲置两年未动。办公厅报上来的整改方案写着要见人见事，可责任只落到两个处级干部头上。联络人临走时提醒一句：这一条，是要列入回头看范围的。",
    options: [
      {
        id: "opt_a",
        text: "整改到底，把厅局的问题翻透",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 5,
          risk: -10,
          popularity: -10,
          mgmt: -5
        }
      },
      {
        id: "opt_b",
        text: "就按现有稿子，处分到处级",
        costAp: 1,
        effects: {
          mgmt: 6,
          popularity: 5,
          risk: 11,
          authority: -5
        }
      },
      {
        id: "opt_c",
        text: "先约谈厅局主要负责人",
        costAp: 0,
        effects: {
          popularity: -6,
          ability: -4,
          energy: -4,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_core_s_debt_vs_growth",
    title: "稳增长还是化债",
    npcName: "省财政厅厅长 老李",
    unitType: "核心部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "中央要求严控新增隐性债务，可省里几个市的平台公司正等着新开工项目续命。财政厅长把两套口径摆在你面前：一套对得上中央要求，一套保得住今年的投资增速。主要领导要你拿个意见，下周一上常委会。",
    options: [
      {
        id: "opt_a",
        text: "严格按化债口径上报",
        costAp: 2,
        effects: {
          ability: 8,
          risk: -10,
          kpi: -8,
          popularity: -8
        }
      },
      {
        id: "opt_b",
        text: "保投资增速，先开工后规范",
        costAp: 1,
        effects: {
          kpi: 10,
          mgmt: 8,
          risk: 12,
          ability: -5
        }
      },
      {
        id: "opt_c",
        text: "建议分市施策，不下统一口径",
        costAp: 0,
        effects: {
          authority: -5,
          kpi: -4,
          mgmt: -3,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_core_s_blast_public_opinion",
    title: "爆燃之后",
    npcName: "省委宣传部长 老吴",
    unitType: "核心部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "省内一化工园区爆燃的视频在外面传开了，伤亡数字还没最终核定。宣传部长拿着三套口径来请示：一套据实发布，一套只说正在核实，一套先压热度等调查组结论。你分管安全生产，明天上午省里要对外发声。",
    options: [
      {
        id: "opt_a",
        text: "据实发布，同步启动问责",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 5,
          risk: -8,
          kpi: -6,
          popularity: -6
        }
      },
      {
        id: "opt_b",
        text: "只说正在核实，先拖一拖",
        costAp: 1,
        effects: {
          mgmt: 6,
          kpi: 5,
          risk: 9,
          popularity: -5
        }
      },
      {
        id: "opt_c",
        text: "压热度，等调查组结论",
        costAp: 0,
        effects: {
          risk: 11,
          authority: -8,
          popularity: -5,
          energy: 5
        }
      }
    ]
  },
  {
    id: "evt_town_k_gate_blockade",
    title: "大门被堵了",
    npcName: "村民 老赵",
    unitType: "基层乡镇",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "早上七点，二十几个村民把镇政府大门堵了，说征地补偿款拖了三个月没到位。分管的副镇长在市里出差，现场只有你。派出所打来电话，问要不要带人清场。信访台账上，这已经是第三次了。",
    options: [
      {
        id: "opt_a",
        text: "我下去见群众，先承诺一周内答复",
        costAp: 1,
        effects: {
          popularity: 8,
          energy: -8,
          risk: 3,
          authority: -5
        }
      },
      {
        id: "opt_b",
        text: "让派出所按程序办，清场",
        costAp: 0,
        effects: {
          risk: 8,
          popularity: -10,
          energy: -5,
          mgmt: 3
        }
      },
      {
        id: "opt_c",
        text: "从镇账先垫两户的钱，把火压下来",
        costAp: 2,
        effects: {
          popularity: 10,
          risk: 9,
          authority: -8,
          energy: -10
        }
      }
    ]
  },
  {
    id: "evt_town_k_inspection_tomorrow",
    title: "明天省里来人",
    npcName: "副镇长 老陈",
    unitType: "基层乡镇",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "县里傍晚通知，明天上午省里来人抽查人居环境，随机抽村。你包的村，主干道两侧还有几堆陈年垃圾没清完。老陈说，这是当前的一把手工程，层层压实责任，不能出岔子，让你今晚自己想办法。",
    options: [
      {
        id: "opt_a",
        text: "连夜雇车清运，工钱先欠着",
        costAp: 2,
        effects: {
          kpi: 8,
          energy: -15,
          health: -8,
          risk: 3
        }
      },
      {
        id: "opt_b",
        text: "沿路拉绿网把垃圾堆遮起来",
        costAp: 1,
        effects: {
          kpi: 6,
          risk: 7,
          ability: -5,
          mgmt: 5
        }
      },
      {
        id: "opt_c",
        text: "如实报告书记，请镇上统一安排",
        costAp: 0,
        effects: {
          mgmt: 2,
          authority: -5,
          kpi: -5,
          energy: -3
        }
      }
    ]
  },
  {
    id: "evt_town_k_old_petitioner",
    title: "三楼的常客",
    npcName: "信访户 老周",
    unitType: "基层乡镇",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "老周为十年前一桩宅基地纠纷，上访了八年。今天他又来了，坐在你办公室不走。县里刚开完会，要求两会前零进京上访。分管领导说，这个事先放一放，让你先把人稳住，不要有思想包袱。",
    options: [
      {
        id: "opt_a",
        text: "陪他翻一遍当年卷宗，找化解口子",
        costAp: 2,
        effects: {
          ability: 8,
          popularity: 5,
          energy: -12,
          health: -8
        }
      },
      {
        id: "opt_b",
        text: "按稳控办法，安排人送他回村",
        costAp: 1,
        effects: {
          mgmt: 8,
          kpi: 5,
          popularity: -6,
          risk: 3
        }
      },
      {
        id: "opt_c",
        text: "告知他案子已终结，不再受理",
        costAp: 0,
        effects: {
          authority: 5,
          popularity: -10,
          risk: 6
        }
      }
    ]
  },
  {
    id: "evt_town_c_toilet_ledger",
    title: "改厕台账对不上",
    npcName: "县农业农村局 老郑",
    unitType: "基层乡镇",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "省里下周来验收农村改厕，局里催你报完成数。台账上写着1200户，你心里清楚，真正能用的不到800。老郑在电话里说，原则上按台账报，剩下的下周补上。镇里的干部都在等你签字，明早检查组就到。签下去是数字，不签是全镇的排名。",
    options: [
      {
        id: "opt_a",
        text: "按台账报，连夜补材料",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 6,
          risk: 7,
          energy: -12
        }
      },
      {
        id: "opt_b",
        text: "如实上报，认下这个数字",
        costAp: 2,
        effects: {
          ability: 6,
          authority: 5,
          mgmt: -12,
          kpi: -10
        }
      },
      {
        id: "opt_c",
        text: "压着报表，等检查组走",
        costAp: 0,
        effects: {
          risk: 6,
          kpi: -8,
          mgmt: -6
        }
      }
    ]
  },
  {
    id: "evt_town_c_sand_pit_boss",
    title: "砂石场老板的饭局",
    npcName: "砂石场 王老板",
    unitType: "基层乡镇",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "汛期将至，县里要求限期完成河道清障，你辖区里有三家采砂场。王老板是老熟人，饭桌上把一张卡推到桌角：河道的事按惯例来，手续后面补。清障是硬任务，压着时间节点；可这家砂石场每年给镇里缴税，还养着几十号人。这杯酒，喝还是不喝。",
    options: [
      {
        id: "opt_a",
        text: "卡退回去，限期清障",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 6,
          risk: -8,
          popularity: -8,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "先收下，清障缓一缓",
        costAp: 1,
        effects: {
          risk: 11,
          popularity: 6,
          kpi: -5,
          authority: -4
        }
      },
      {
        id: "opt_c",
        text: "让他自行整改，我不表态",
        costAp: 0,
        effects: {
          risk: 6,
          kpi: -8,
          authority: -6
        }
      }
    ]
  },
  {
    id: "evt_town_c_flood_relocate",
    title: "地质灾害点转移",
    npcName: "村支书 老陈",
    unitType: "基层乡镇",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "暴雨红色预警，山脚下十几户必须当晚转移。老陈说有两户老人死活不走，住了一辈子，塌不了。上级要求不漏一户、不落一人，还要拍照留痕。硬抬人走，群众骂你作秀；签字画押留在原地，真出了事，责任全在你头上。雨已经开始下了。",
    options: [
      {
        id: "opt_a",
        text: "连夜组织干部背人下山",
        costAp: 2,
        effects: {
          authority: 8,
          kpi: 6,
          popularity: -6,
          energy: -15,
          health: -8
        }
      },
      {
        id: "opt_b",
        text: "让老陈签保证书，留下值守",
        costAp: 1,
        effects: {
          risk: 9,
          kpi: 5,
          popularity: 5,
          energy: -4
        }
      },
      {
        id: "opt_c",
        text: "上报已全部转移",
        costAp: 0,
        effects: {
          risk: 7,
          authority: -8,
          kpi: -6
        }
      }
    ]
  },
  {
    id: "evt_town_c_gate_protest",
    title: "村民堵了大门",
    npcName: "镇信访办 老李",
    unitType: "基层乡镇",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "一个村的征地补偿款卡在县财政，四十多个村民堵了镇政府大门，拉起横幅要说法。县里电话问稳控情况，要求半小时内把人劝回去。村民要的是现钱，你手上没有；许一个兑现不了的日子，明天人就到市里。老李在边上小声说：先答应着，把人劝走再说。",
    options: [
      {
        id: "opt_a",
        text: "当面应下，去县里协调拨款",
        costAp: 2,
        effects: {
          popularity: 10,
          mgmt: -8,
          risk: 6,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "请代表进来，按程序办",
        costAp: 1,
        effects: {
          ability: 6,
          authority: 6,
          popularity: -8,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "陪着等县里答复",
        costAp: 0,
        effects: {
          popularity: -8,
          kpi: -8,
          mgmt: -6,
          authority: -6
        }
      }
    ]
  },
  {
    id: "evt_town_c_petition_rate",
    title: "信访化解率排名",
    npcName: "县信访局 老吴",
    unitType: "基层乡镇",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "县里通报排名，你镇积案化解率倒数第三。老吴私下说，签个承诺书就算化解，签字率上去了，年终考核就好看。名单上那个老上访户，为一口机井告了八年，签完字转身就去了省城。报表上的数字和心里的账，只能选一个。",
    options: [
      {
        id: "opt_a",
        text: "逐户上门，能解一个是一个",
        costAp: 2,
        effects: {
          ability: 8,
          popularity: 6,
          kpi: 4,
          energy: -14,
          health: -6
        }
      },
      {
        id: "opt_b",
        text: "让村干部代签承诺书",
        costAp: 1,
        effects: {
          kpi: 10,
          mgmt: 6,
          risk: 8,
          authority: -6
        }
      },
      {
        id: "opt_c",
        text: "报表照报，不签不查",
        costAp: 0,
        effects: {
          risk: 7,
          kpi: -6,
          mgmt: -6,
          ability: -5
        }
      }
    ]
  },
  {
    id: "evt_town_c_village_quota",
    title: "低保名单里的名字",
    npcName: "镇纪委书记 老郭",
    unitType: "基层乡镇",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "有群众实名举报，某村低保名单里有村主任的弟媳。老郭把材料放在你桌上：查下去，年底换届这个村就散了；不查，举报材料已经寄到了市里。名单上十来户，确实有两三家不该有。可村里正修路，离不开这个主任张罗。",
    options: [
      {
        id: "opt_a",
        text: "交纪委按程序查办",
        costAp: 2,
        effects: {
          authority: 8,
          mgmt: 5,
          ability: 6,
          popularity: -10,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "让老郭先谈话，调名单",
        costAp: 1,
        effects: {
          risk: 7,
          popularity: 6,
          kpi: 5,
          authority: -5
        }
      },
      {
        id: "opt_c",
        text: "先压一压，等换届后再说",
        costAp: 0,
        effects: {
          risk: 8,
          authority: -8,
          mgmt: -6
        }
      }
    ]
  },
  {
    id: "evt_town_t_petition_case",
    title: "包案的老上访户",
    npcName: "镇党委书记 老陈",
    unitType: "基层乡镇",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "你包案的这个信访件，已经是第三个年头。老上访户周某把铺盖卷搬到镇政府门口，镇党委书记老陈站在旁边低声说：领导，这个事原则上不好办，您只要点个头，救助资金我们走民政口子想办法。你手上这份卷宗事实清楚，责任并不在镇里，可明天市里就要报化解率，报不上去挨批的是你这一摊。",
    options: [
      {
        id: "opt_a",
        text: "点头，让镇里按特事特办处理",
        costAp: 2,
        effects: {
          kpi: 8,
          popularity: 6,
          risk: 7,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "维持原结论，把政策讲透",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          popularity: -8,
          kpi: -6,
          energy: -10
        }
      },
      {
        id: "opt_c",
        text: "让镇里先稳住，等市里会研究",
        costAp: 0,
        effects: {
          risk: 6,
          kpi: -5,
          authority: -4,
          mgmt: -4
        }
      }
    ]
  },
  {
    id: "evt_town_t_flood_dike",
    title: "汛前的两处险工",
    npcName: "镇长 老周",
    unitType: "基层乡镇",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "汛期还有半个月，镇里那段民堤有两处险工，镇长把报告递到你手上，开口就是五百万。今年防汛资金已经切块下达，临时调剂要走追加程序，财政那边未必肯认。镇长搓着手说：领导，这段堤真出了事，上面追责第一个追的是您。你分管这一摊，这个字签不签、怎么签。",
    options: [
      {
        id: "opt_a",
        text: "当场打电话，让财政先拨一半",
        costAp: 2,
        effects: {
          kpi: 6,
          popularity: 8,
          risk: 6,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "压实乡镇主体责任，自筹加固",
        costAp: 1,
        effects: {
          authority: 6,
          mgmt: 6,
          popularity: -10,
          kpi: -5
        }
      },
      {
        id: "opt_c",
        text: "列入明年计划，汛期加强巡查",
        costAp: 0,
        effects: {
          risk: 6,
          kpi: -5,
          popularity: -6,
          authority: -4
        }
      }
    ]
  },
  {
    id: "evt_town_t_model_village",
    title: "示范点的台账",
    npcName: "镇党委副书记 老孙",
    unitType: "基层乡镇",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "省里下周来检查乡村振兴示范创建。镇党委副书记把材料递上来，两个自然村的墙面刷了，三年的台账补齐了。他压着嗓子说，别的镇都这么弄，咱们不注水就排在后头，年底考核是要对标对表的。你翻到村集体收入那一栏，几个数字明显是凑出来的，明天这份材料要由你签字上报。",
    options: [
      {
        id: "opt_a",
        text: "按这个版本报，先把场面撑住",
        costAp: 1,
        effects: {
          kpi: 10,
          mgmt: 6,
          risk: 8,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "打回去重做，数据要经得起查",
        costAp: 1,
        effects: {
          ability: 8,
          authority: 6,
          kpi: -8,
          popularity: -8,
          energy: -12
        }
      },
      {
        id: "opt_c",
        text: "不表态，让他们自己灵活把握",
        costAp: 0,
        effects: {
          risk: 6,
          authority: -5,
          mgmt: -4,
          kpi: -4
        }
      }
    ]
  },
  {
    id: "evt_town_t_factory_land",
    title: "老板要的那块地",
    npcName: "镇招商办主任 老吴",
    unitType: "基层乡镇",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "一个在外闯了多年的老板回乡办加工厂，开口就是年税收三百万、用工一百二十人。地块在镇界边上，一半是基本农田，一半是村集体建设用地，手续卡在国土。饭桌上老板端着杯子说，您在省里熟，帮着协调一下，你懂的。镇里等米下锅，可这块地经不起翻。",
    options: [
      {
        id: "opt_a",
        text: "给国土打个招呼，先开工后补",
        costAp: 2,
        effects: {
          kpi: 12,
          popularity: 8,
          risk: 11,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "要求先落规划，一律按程序办",
        costAp: 1,
        effects: {
          ability: 8,
          authority: 6,
          risk: -8,
          kpi: -6,
          popularity: -8
        }
      },
      {
        id: "opt_c",
        text: "让镇里再研究，这个事先放一放",
        costAp: 0,
        effects: {
          kpi: -8,
          popularity: -6,
          mgmt: -4,
          authority: -4
        }
      }
    ]
  },
  {
    id: "evt_town_t_village_election",
    title: "换届前的一句话",
    npcName: "镇组织委员 小郑",
    unitType: "基层乡镇",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "村两委换届在即，镇里那个大村的支书位子有两家在争。晚上组织委员到驻地汇报：一家托长辈带话，只要你顾全大局，换届保证不出乱子；另一家的儿子在县直部门。话说到一半，他停下来看你。你一句话，可能就定了这个村往后三年谁说了算。",
    options: [
      {
        id: "opt_a",
        text: "明确按程序办，谁打招呼都不行",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          risk: -8,
          popularity: -10,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "让他们先了解了解，别有思想包袱",
        costAp: 0,
        effects: {
          risk: 5,
          authority: -6,
          mgmt: -4,
          kpi: -4
        }
      },
      {
        id: "opt_c",
        text: "跟县里分管通个气，请他们平衡",
        costAp: 2,
        effects: {
          mgmt: 6,
          popularity: 5,
          risk: 9,
          authority: -6
        }
      }
    ]
  },
  {
    id: "evt_town_t_water_project",
    title: "半截子饮水工程",
    npcName: "村支书 老赵",
    unitType: "基层乡镇",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "你蹲点住在镇里，夜里有人敲门。村民说村里的集中供水工程修了一半就停了，管子铺到门口两年没通水，冬天还得去两里外挑水。镇里的汇报材料写的是工程已完工、群众满意度高，明天要由你签字上报。桌上那支笔，你拿了又放下。",
    options: [
      {
        id: "opt_a",
        text: "先签字上报，回头再督促整改",
        costAp: 0,
        effects: {
          risk: 6,
          kpi: -5,
          popularity: -6,
          authority: -4
        }
      },
      {
        id: "opt_b",
        text: "如实改，写明未完工和整改时限",
        costAp: 1,
        effects: {
          ability: 8,
          authority: 6,
          kpi: -8,
          mgmt: -6,
          energy: -10
        }
      },
      {
        id: "opt_c",
        text: "现场办公，逼镇里两周内通水",
        costAp: 2,
        effects: {
          kpi: 8,
          popularity: 10,
          risk: 5,
          energy: -14,
          health: -6
        }
      }
    ]
  },
  {
    id: "evt_town_s_model_village_visit",
    title: "示范村的院墙",
    npcName: "乡镇党委书记 老韩",
    unitType: "基层乡镇",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "你挂点联系的乡镇，今天看的是乡村振兴示范点。进村的路两侧新刷了白墙，花箱摆得齐整，广场上音响放着曲子。可你记得上次暗访，这个村东头还有三户吃水靠拉。老韩一路介绍，说这是对标对表打造的样板。随行的市里同志等着你点评，记者在后面举着机器。要不要当场把话挑明？",
    options: [
      {
        id: "opt_a",
        text: "让车拐进东头，先看看那三户人家",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 5,
          popularity: -8,
          kpi: -5,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "按安排走完，回来让办公厅督办整改",
        costAp: 0,
        effects: {
          mgmt: 1,
          popularity: 1,
          kpi: -6,
          energy: -4
        }
      },
      {
        id: "opt_c",
        text: "留下吃工作餐，席间跟老韩点一句",
        costAp: 1,
        effects: {
          popularity: 6,
          mgmt: 5,
          risk: 6,
          energy: -5
        }
      }
    ]
  },
  {
    id: "evt_town_s_petition_case",
    title: "包案的老上访户",
    npcName: "县信访局长 老胡",
    unitType: "基层乡镇",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "你包的信访案子，老周为十年前的征地补偿上访了七年，前两天又进了京。县里打来电话，说人已经接回来，条件是省里给一笔专项资金一次性了结，钱一到账就签息访协议。老胡在电话里说，这件事原则上可以办，只等你点头。你也清楚，这笔钱一开口子，后面排队的还有几十户。",
    options: [
      {
        id: "opt_a",
        text: "专项资金不开口子，交办回去依法办",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          popularity: -8,
          kpi: -6,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "先把这笔钱批了，这个事先放一放",
        costAp: 2,
        effects: {
          kpi: 6,
          popularity: 5,
          mgmt: 4,
          risk: 10,
          energy: -5
        }
      },
      {
        id: "opt_c",
        text: "让县里先稳住人，年后再议",
        costAp: 0,
        effects: {
          risk: 6,
          kpi: -5,
          popularity: -3,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_town_s_data_water",
    title: "报上来的数字",
    npcName: "分管副厅长 老陈",
    unitType: "基层乡镇",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "乡村振兴考核在即，市里报上来的材料里，你挂点的县高标准农田完成率是百分之一百零三。你到乡镇一看，有几百亩还泡在水里，村支书说，上面要数，我们先填上，年底再补。老陈劝你：口径是对标部里定的，改一个数，全省排名就往后掉。签字的日子定在明天上午。",
    options: [
      {
        id: "opt_a",
        text: "剔除水分，通报填报单位",
        costAp: 2,
        effects: {
          ability: 10,
          authority: 8,
          mgmt: -12,
          kpi: -12,
          popularity: -6
        }
      },
      {
        id: "opt_b",
        text: "按上报数字签字上报",
        costAp: 1,
        effects: {
          kpi: 12,
          mgmt: 8,
          risk: 10,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "先组织抽查核实，暂不签字",
        costAp: 0,
        effects: {
          energy: -8,
          kpi: -4,
          ability: 2
        }
      }
    ]
  },
  {
    id: "evt_town_s_flood_evacuation",
    title: "暴雨夜的转移令",
    npcName: "县委书记 老吴",
    unitType: "基层乡镇",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "后半夜的雨下得像倒水。你正在县里蹲点，镇里报来险情：山脚下的两个村在滑坡隐患点上，还有一百多口人没走。老吴说，转移要挨家挨户敲门，老百姓骂人，安置点也挤。气象部门说雨带还在往这边压。留下，可能出事；转移，明天镇里就要背一堆投诉。省防指的调度电话已经打到你手机上。",
    options: [
      {
        id: "opt_a",
        text: "立刻下令两个村整体转移",
        costAp: 2,
        effects: {
          authority: 8,
          kpi: 6,
          energy: -15,
          popularity: -8,
          health: -5
        }
      },
      {
        id: "opt_b",
        text: "按预案先转地灾点，其余盯守",
        costAp: 1,
        effects: {
          ability: 6,
          kpi: 4,
          energy: -10,
          risk: 4,
          popularity: -3
        }
      },
      {
        id: "opt_c",
        text: "等市里统一指令再动",
        costAp: 0,
        effects: {
          risk: 7,
          authority: -8,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_town_s_project_backdoor",
    title: "老板是熟人",
    npcName: "副县长 老崔",
    unitType: "基层乡镇",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "你牵线引进的农产品加工项目落在挂点乡镇，占了三十亩基本农田，环评没批就先动了土。老板姓郑，是省里一位老领导的远亲，昨天托人带话，说手续上的事请领导帮着协调一下。老崔说，项目投产能给县里带来两千万产值，年底观摩会正好用得上。国土那边已经发了责令停工通知书。",
    options: [
      {
        id: "opt_a",
        text: "立即停工，手续补齐再谈",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 6,
          mgmt: -12,
          kpi: -10,
          popularity: -6
        }
      },
      {
        id: "opt_b",
        text: "打招呼让国土缓一缓，先投产",
        costAp: 1,
        effects: {
          kpi: 12,
          mgmt: 8,
          risk: 11,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "让县里按程序办，自己不表态",
        costAp: 0,
        effects: {
          risk: 5,
          ability: -5,
          kpi: -3,
          popularity: -4
        }
      }
    ]
  },
  {
    id: "evt_town_s_burden_relief",
    title: "座谈会上的实话",
    npcName: "镇党政办主任 小郑",
    unitType: "基层乡镇",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "你在乡镇开减负座谈会，本意是听听实话。小郑站起来说，去年一年填了一百八十多份报表，其中三分之一是省里各条线要的留痕材料，有的表一个月报三次。话说到一半，市里陪同的同志脸色就变了。会议室里没人接话，只有笔尖划过纸的声音。你要表态，可这些表恰恰是你分管部门压下去的。",
    options: [
      {
        id: "opt_a",
        text: "当场拍板砍掉一半报表，责任我担",
        costAp: 2,
        effects: {
          authority: 10,
          popularity: 10,
          ability: 5,
          mgmt: -10,
          kpi: -6
        }
      },
      {
        id: "opt_b",
        text: "让办公厅回去梳理，先听意见",
        costAp: 0,
        effects: {
          energy: -5,
          popularity: -4,
          kpi: -3,
          ability: 2
        }
      },
      {
        id: "opt_c",
        text: "肯定基层辛苦，要求抓好落实",
        costAp: 1,
        effects: {
          mgmt: 6,
          kpi: 4,
          popularity: -8,
          energy: -5
        }
      }
    ]
  },
  {
    id: "evt_marg_k_water_cooler_broke",
    title: "饮水机坏了三天",
    npcName: "办公室主任 老陈",
    unitType: "边缘部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "四楼那台饮水机坏了三天，没人来修。老陈拿着采购单上来，说走政府采购程序，快则一个月，慢则过了年。可这几层楼的人都端着杯子来你们这儿接水，话里话外都是抱怨。老陈压低声音：要不我先去楼下商场买一台，几百块钱，回头寻个名目报了，你懂的。",
    options: [
      {
        id: "opt_a",
        text: "按程序报，等采购走完",
        costAp: 1,
        effects: {
          ability: 5,
          popularity: -5,
          energy: -5,
          mgmt: -2
        }
      },
      {
        id: "opt_b",
        text: "先垫钱买，回头再想办法",
        costAp: 1,
        effects: {
          popularity: 6,
          energy: -6,
          risk: 6
        }
      },
      {
        id: "opt_c",
        text: "这个事先放一放",
        costAp: 0,
        effects: {
          popularity: -5,
          authority: -2,
          energy: 3
        }
      }
    ]
  },
  {
    id: "evt_marg_k_choir_practice",
    title: "合唱比赛要凑人数",
    npcName: "党办副主任 老周",
    unitType: "边缘部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "系统里办庆祝活动，各单位组队合唱，人数不够的在通报里点名。老周来商量：你们在编十几个人，能开口的就五个。要么从下属单位借几个，要么把退休的老同志请回来，排练占的是下午。日常那些事，只能你自己加班补。老周说，这事得顾全大局。",
    options: [
      {
        id: "opt_a",
        text: "从下属单位借人凑齐",
        costAp: 1,
        effects: {
          kpi: 6,
          popularity: -4,
          risk: 3,
          energy: -4
        }
      },
      {
        id: "opt_b",
        text: "如实报名，就这五个人上",
        costAp: 1,
        effects: {
          authority: 5,
          ability: 3,
          kpi: -8,
          mgmt: -5
        }
      },
      {
        id: "opt_c",
        text: "这个事先放一放",
        costAp: 0,
        effects: {
          kpi: -7,
          popularity: 3,
          energy: 3
        }
      }
    ]
  },
  {
    id: "evt_marg_k_yearbook_deadline",
    title: "年鉴稿子还差一半",
    npcName: "史志办编辑 小郑",
    unitType: "边缘部门",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "年鉴下厂印刷就剩十天，八个单位还没交稿。小郑说，那几个单位年年拖，要不他从往年的本子和网上补一补，凑够字数先印出来，反正没人逐字看。领导说这是「一把手工程」，年底要交账。真打电话硬催，得罪的是平级的兄弟单位；不催，这书就出不来。",
    options: [
      {
        id: "opt_a",
        text: "挨个打电话催，催不动就通报",
        costAp: 2,
        effects: {
          authority: 5,
          ability: 4,
          popularity: -8,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "让小郑先补上，回头再补正",
        costAp: 1,
        effects: {
          kpi: 6,
          risk: 6,
          energy: -4
        }
      },
      {
        id: "opt_c",
        text: "如实报进度，缺的留白",
        costAp: 0,
        effects: {
          kpi: -6,
          mgmt: -5,
          energy: 3
        }
      }
    ]
  },
  {
    id: "evt_marg_c_gazetteer_review",
    title: "志稿里那句话",
    npcName: "总纂 郑老",
    unitType: "边缘部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "市志清样送到你手上，三百多万字，只差付印。第四卷有一处，记的是某位现任领导早年在厂里任职时的一桩旧事，当年的结论是「待查」。郑老坚持原文照录，说志书讲的就是一个「实」字；宣传部的同志私下提醒，这一段最好处理一下。付印在即，谁都等你拍板。",
    options: [
      {
        id: "opt_a",
        text: "照郑老的意见，原文付印",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          mgmt: -10,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "删去这一段，稳妥为上",
        costAp: 1,
        effects: {
          mgmt: 8,
          authority: -8,
          ability: -6,
          energy: -5
        }
      },
      {
        id: "opt_c",
        text: "写个请示，报宣传部审定",
        costAp: 0,
        effects: {
          mgmt: -4,
          kpi: -4,
          ability: -4,
          energy: -6
        }
      }
    ]
  },
  {
    id: "evt_marg_c_quota_call",
    title: "空出来的编制",
    npcName: "府办副主任 老李",
    unitType: "边缘部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "机关一个参公编制空了半年，遴选公告挂出去两周，报名二十六人。本单位的老周干了九年，材料是他写的，会是他开的，大家都看着。上周府办老李来电话，说有个年轻人想调过来，「组织上会考虑的」，让你先把公告往后放放。老周这两天见你，话比平时少。",
    options: [
      {
        id: "opt_a",
        text: "按公告走，公开遴选",
        costAp: 1,
        effects: {
          authority: 10,
          popularity: 6,
          mgmt: -12,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "给老李这个面子",
        costAp: 1,
        effects: {
          mgmt: 12,
          risk: 7,
          popularity: -10,
          authority: -8
        }
      },
      {
        id: "opt_c",
        text: "公告继续挂，人选以后再说",
        costAp: 0,
        effects: {
          mgmt: -6,
          popularity: -5,
          kpi: -4,
          energy: -5
        }
      }
    ]
  },
  {
    id: "evt_marg_c_inspection_refund",
    title: "一笔评审费",
    npcName: "纪检组长 老方",
    unitType: "边缘部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "巡察反馈意见下来了，第三条是前几年发放的评审费、讲课费不规范，要逐人清退，一共四十多万，涉及在职的、退休的，还有两位已经提拔走的前任领导。老方把名单放在你桌上，问清退的口径怎么定。名单最上面那几个人，电话得你自己打。",
    options: [
      {
        id: "opt_a",
        text: "一个不漏，全额清退",
        costAp: 2,
        effects: {
          authority: 10,
          ability: 6,
          popularity: -14,
          risk: -10,
          energy: -12
        }
      },
      {
        id: "opt_b",
        text: "在职的退，退休的写说明",
        costAp: 1,
        effects: {
          popularity: 6,
          risk: 8,
          mgmt: 6,
          authority: -8
        }
      },
      {
        id: "opt_c",
        text: "先开个会吹吹风，看看反应",
        costAp: 0,
        effects: {
          energy: -6,
          kpi: -5,
          ability: -4,
          mgmt: -4
        }
      }
    ]
  },
  {
    id: "evt_marg_c_idle_property",
    title: "楼下那间临街房",
    npcName: "承租老板 老潘",
    unitType: "边缘部门",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "单位楼下三间临街房空了两年，落灰、招贼，消防检查次次点名。老潘找上门，想租下来开个培训点，一年给九万，说「不用走那么麻烦的程序，先签个协议，钱按月打过来」。国有资产出租要报批、要评估、要公开招租，走完至少半年。办公室主任把这个事端到你面前。",
    options: [
      {
        id: "opt_a",
        text: "按规定报批，公开招租",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          kpi: -8,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "先签个短期协议，边租边报",
        costAp: 1,
        effects: {
          kpi: 10,
          popularity: 5,
          risk: 11,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "锁上门，谁也别用",
        costAp: 0,
        effects: {
          kpi: -6,
          ability: -5,
          popularity: -4,
          mgmt: -4,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_marg_t_archive_digitization",
    title: "巡视组要销号",
    npcName: "整改办 老陈",
    unitType: "边缘部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "巡视反馈的问题清单里，你单位挂了一条：馆藏档案数字化率长期不达标，前年立项的专项经费年末被财政收回。整改办要求月底销号，老陈一天来三趟。你翻开台账，真正没扫的是民国那批虫蛀霉变的卷宗，外包公司报价翻了一倍，还撂话说这批纸一碰就碎。业务处报了个方案：先把好扫的补扫一遍，数字凑上去。会议室里几个人都看你。",
    options: [
      {
        id: "opt_a",
        text: "按方案报，先把数字凑够",
        costAp: 1,
        effects: {
          kpi: 8,
          risk: 8,
          ability: -6,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "如实报延期，附霉变卷宗的照片",
        costAp: 2,
        effects: {
          authority: 8,
          mgmt: -8,
          kpi: -6,
          energy: -10
        }
      },
      {
        id: "opt_c",
        text: "任务分解给二级单位认领",
        costAp: 0,
        effects: {
          risk: 6,
          popularity: -8,
          ability: -3
        }
      }
    ]
  },
  {
    id: "evt_marg_t_society_fee_rebate",
    title: "学会的收费单",
    npcName: "学会理事长 郑老",
    unitType: "边缘部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "举报信转到你案头：下属某学会以\"科技成果评价\"名义向二十几家企业收费，每份三万，出具的意见盖着学会的章。理事长是刚退下来的老厅长，电话里说得轻松——都是惯例，协调一下就行，你懂的。学会账上还挂着一笔没走完的评审费，票据不全。纪检的同志问你什么时候方便过去谈一谈。窗外走廊上，学会的秘书长已经站了半个钟头。",
    options: [
      {
        id: "opt_a",
        text: "约谈学会，限期清退并书面说明",
        costAp: 2,
        effects: {
          authority: 10,
          popularity: -10,
          risk: -12,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "批回学会自行处理，报个结果",
        costAp: 0,
        effects: {
          risk: 8,
          ability: -4,
          popularity: 2
        }
      },
      {
        id: "opt_c",
        text: "登门请郑老出面退一部分",
        costAp: 1,
        effects: {
          risk: 6,
          popularity: 6,
          authority: -8
        }
      }
    ]
  },
  {
    id: "evt_marg_t_gazetteer_fee",
    title: "八年的一部志",
    npcName: "返聘老同志 老方",
    unitType: "边缘部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "志书编了八年，还差最后两卷。审计翻账时发现，几位退休返聘的老同志稿费按季度照发，近两年交上来的稿子却不多，其中一位是当年把你从县里提上来的老领导。财务处长把单子放在你桌上，说按程序办也行，您签个字也行。这部志书是省里的重点文化工程，年底要报进度和成果。老方上午还来问过下半年的费用。",
    options: [
      {
        id: "opt_a",
        text: "签字照发，先把进度保住",
        costAp: 1,
        effects: {
          kpi: 6,
          risk: 7,
          mgmt: 4,
          authority: -6
        }
      },
      {
        id: "opt_b",
        text: "停发稿费，改按字数签劳务合同",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 6,
          popularity: -12,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "让财务先挂账，等出版再说",
        costAp: 0,
        effects: {
          risk: 8,
          ability: -5,
          popularity: 2
        }
      }
    ]
  },
  {
    id: "evt_marg_t_inspector_quota",
    title: "只有一个名额",
    npcName: "人事处长 老韩",
    unitType: "边缘部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "组织部给了单位一个二级巡视员的名额。两位老处长都到线上了：一位干了三十年，业务上没出过差错，人缘扎实；一位这几年抓数字化和场馆改造，材料写得漂亮，跟省里的口径对得上。老韩把两份简历摊开，说民主推荐、组织考察、上会研究，程序一步不能少，可结果只能是一个人。这几天的走廊，比平时安静。",
    options: [
      {
        id: "opt_a",
        text: "按任职年限和推荐，给老资历那位",
        costAp: 1,
        effects: {
          popularity: 5,
          authority: 5,
          kpi: -6,
          mgmt: -5
        }
      },
      {
        id: "opt_b",
        text: "给抓工作那一位，立个导向",
        costAp: 1,
        effects: {
          kpi: 6,
          mgmt: 6,
          popularity: -12,
          authority: -5
        }
      },
      {
        id: "opt_c",
        text: "暂不上会，报请上级一并考虑",
        costAp: 0,
        effects: {
          risk: 6,
          ability: -4,
          mgmt: -6
        }
      }
    ]
  },
  {
    id: "evt_marg_t_secondment_request",
    title: "借调两个人的函",
    npcName: "省委办 王处长",
    unitType: "边缘部门",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "省委办公厅来了函，借调你单位两个年轻骨干去写材料，为期一年，说是重大任务，要顾全大局。在编的年轻人本来只有四个，一个刚休产假，志书、年鉴、数字化全压在他们身上。王处长在电话里语气很客气：人还是你的，就是用一用，回头组织上会考虑的。放下电话，业务处长已经堵在门口了。",
    options: [
      {
        id: "opt_a",
        text: "痛快放人，手续当天办完",
        costAp: 1,
        effects: {
          mgmt: 10,
          ability: -6,
          kpi: -6,
          popularity: -4
        }
      },
      {
        id: "opt_b",
        text: "讨价还价，只给一个并提替换方案",
        costAp: 2,
        effects: {
          mgmt: -6,
          ability: 5,
          authority: 6,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "以工作压头为由，暂缓办理",
        costAp: 0,
        effects: {
          mgmt: -10,
          risk: 5,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_marg_s_science_funding",
    title: "科普经费怎么分",
    npcName: "省科协副主席老马",
    unitType: "边缘部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "你分管省科协。一笔年度科普专项经费要下拨，某市科协打报告申请追加，理由是要办「一把手工程」式的科技节。但你知道该市去年刚因违规搞活动被通报。老马说该市领导打过招呼，建议「协调一下」。经费盘子就那么大，给了它，其他市就得压缩。",
    options: [
      {
        id: "opt_a",
        text: "按申报程序评审，不打招呼",
        costAp: 1,
        effects: {
          authority: 6,
          ability: 5,
          popularity: -10,
          mgmt: -5
        }
      },
      {
        id: "opt_b",
        text: "给该市追加，卖个人情",
        costAp: 2,
        effects: {
          mgmt: 8,
          popularity: 6,
          risk: 9,
          kpi: -5
        }
      },
      {
        id: "opt_c",
        text: "暂缓下拨，等领导定",
        costAp: 0,
        effects: {
          risk: 5,
          mgmt: -3,
          kpi: -5,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_marg_s_chronicle_revise",
    title: "地方志里的数字",
    npcName: "史志办老主任老陈",
    unitType: "边缘部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "省史志办正在编纂新一辑地方志。某市送来修订稿，把上世纪某次重大灾害的死亡人数改小了，理由是要「顾全大局，避免引发不必要的联想」。老陈说该市领导是省委常委，亲自过问。志书是要存史的，但你也得考虑现实。",
    options: [
      {
        id: "opt_a",
        text: "坚持原稿，按史实记载",
        costAp: 1,
        effects: {
          authority: 10,
          ability: 6,
          popularity: -12,
          mgmt: -8
        }
      },
      {
        id: "opt_b",
        text: "同意修改，留个说明",
        costAp: 2,
        effects: {
          mgmt: 8,
          popularity: 5,
          risk: 7,
          authority: -8
        }
      },
      {
        id: "opt_c",
        text: "搁置争议，先印其他部分",
        costAp: 0,
        effects: {
          risk: 5,
          kpi: -5,
          ability: -3,
          mgmt: -3
        }
      }
    ]
  },
  {
    id: "evt_marg_s_academician_recommend",
    title: "院士推荐名单",
    npcName: "院士候选人周教授",
    unitType: "边缘部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "省科协负责组织院士候选人推荐。周教授是某高校的资深学者，学术一般，但活动能力强，上面有人打过招呼。评审会上，有评委提出「要综合考虑省里的面子」。你手里有投票权，也有一票否决权。选他，省里能多一个院士名额；不选，得罪人。",
    options: [
      {
        id: "opt_a",
        text: "按学术标准投票，不选",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 5,
          popularity: -12,
          mgmt: -6
        }
      },
      {
        id: "opt_b",
        text: "投赞成票，给省里争名额",
        costAp: 2,
        effects: {
          mgmt: 10,
          kpi: 8,
          risk: 9,
          authority: -10
        }
      },
      {
        id: "opt_c",
        text: "弃权，不表态",
        costAp: 0,
        effects: {
          risk: 5,
          popularity: -5,
          ability: -3,
          mgmt: -3
        }
      }
    ]
  },
  {
    id: "evt_marg_s_archive_purchase",
    title: "档案采购的招呼",
    npcName: "老部下赵经理",
    unitType: "边缘部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "省档案馆要采购一批档案数字化扫描设备。你兼任馆长，虽然不直接管采购，但老部下赵经理找到你，说他的公司想参与投标，希望「打个招呼」，并暗示「你懂的」。采购金额不大，关注度也不高，但一旦出事就是你的责任。你签不签这个条子？",
    options: [
      {
        id: "opt_a",
        text: "不打招呼，让他按程序投标",
        costAp: 1,
        effects: {
          authority: 6,
          ability: 4,
          popularity: -10,
          risk: -5
        }
      },
      {
        id: "opt_b",
        text: "给采购办打个电话，协调一下",
        costAp: 2,
        effects: {
          mgmt: 5,
          popularity: 8,
          risk: 11,
          authority: -10
        }
      },
      {
        id: "opt_c",
        text: "推说不管具体事，让他找别人",
        costAp: 0,
        effects: {
          risk: 5,
          popularity: -5,
          mgmt: -3,
          ability: -2
        }
      }
    ]
  },
  {
    id: "evt_marg_s_retiree_checkup",
    title: "老干部体检名额",
    npcName: "退休老领导钱老",
    unitType: "边缘部门",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "省科协组织年度老干部体检，按级别分配名额。钱老是退休的省科协老主席，身体不好，但名额已满。他秘书打电话来，说钱老「为科协奉献一辈子」，希望「特事特办」。你手头还有一个机动名额，本来是留给在职干部突发情况的。给，坏了规矩；不给，老同志寒心。",
    options: [
      {
        id: "opt_a",
        text: "按规定办，机动名额不动",
        costAp: 1,
        effects: {
          authority: 6,
          ability: 4,
          popularity: -10,
          mgmt: -3
        }
      },
      {
        id: "opt_b",
        text: "给钱老特批一个",
        costAp: 2,
        effects: {
          popularity: 8,
          mgmt: 5,
          risk: 7,
          authority: -8
        }
      },
      {
        id: "opt_c",
        text: "让办公室再协调一个名额",
        costAp: 0,
        effects: {
          risk: 5,
          kpi: -3,
          ability: -3,
          popularity: -2
        }
      }
    ]
  },
  {
    id: "evt_bureau_k_window_complaint",
    title: "窗口前的手机",
    npcName: "窗口科员 小陈",
    unitType: "常规局委",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "月底的服务窗口前，一位老人举着手机录像，说材料退了三回，每次讲的清单都不一样。小陈红着眼辩解，说清单上写得清楚，自己不敢灵活把握。大厅里围了七八个人，有人也在拍。局里正在抓「一网通办」考核，每一件投诉都直接计入月度排名，分管领导上午刚在会上说，这个月不能再出岔子。",
    options: [
      {
        id: "opt_a",
        text: "当场道歉，重新受理，今天办完",
        costAp: 1,
        effects: {
          popularity: 8,
          kpi: 6,
          energy: -8,
          authority: -5
        }
      },
      {
        id: "opt_b",
        text: "请到接待室，先安抚再说",
        costAp: 1,
        effects: {
          popularity: 4,
          risk: 4,
          mgmt: 3,
          authority: -4
        }
      },
      {
        id: "opt_c",
        text: "照清单办，投诉走流程",
        costAp: 0,
        effects: {
          ability: 4,
          popularity: -6,
          kpi: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_k_joint_doc_shirk",
    title: "空着的那一条",
    npcName: "邻局科长 老赵",
    unitType: "常规局委",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "县里要报一份联合整治方案，牵头的是你们局。征求意见稿发出去，两家回「无意见」，第三家把涉及自己的职责条款整段划掉，电话里说这项该你们主责，我们配合。分管副县长后天听汇报，方案里空着的那一块还没人认领。会上讲一句顾全大局容易，落到纸上签字的却是你。",
    options: [
      {
        id: "opt_a",
        text: "把空着的那块先揽下来",
        costAp: 1,
        effects: {
          mgmt: 7,
          kpi: 5,
          energy: -10,
          risk: 3
        }
      },
      {
        id: "opt_b",
        text: "拿文件去当面请示县领导",
        costAp: 2,
        effects: {
          mgmt: 8,
          authority: 4,
          popularity: -7,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "按原分工上报，附分歧说明",
        costAp: 0,
        effects: {
          ability: 4,
          mgmt: -3,
          popularity: -4,
          kpi: -2
        }
      }
    ]
  },
  {
    id: "evt_bureau_k_approval_favor",
    title: "先拨后补",
    npcName: "高中同学 张总",
    unitType: "常规局委",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "一笔惠农补贴卡在你这一环，材料只差一份现场核验单。打电话的是你高中同学，说先拨后补，年底指标压着，办成了也算帮你们冲进度。分管副局长在走廊里提了一句，这个项目是「一把手工程」，别卡脖子。你签下去，责任就落在你头上；不签，以后的饭桌上也难见面。",
    options: [
      {
        id: "opt_a",
        text: "先拨后补，限他三天补齐",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 5,
          risk: 7,
          health: -5
        }
      },
      {
        id: "opt_b",
        text: "退回，材料齐全再签",
        costAp: 1,
        effects: {
          ability: 6,
          authority: 5,
          mgmt: -5,
          popularity: -6
        }
      },
      {
        id: "opt_c",
        text: "把材料搁着，等他自己来问",
        costAp: 0,
        effects: {
          risk: 5,
          energy: 3,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_k_ledger_inspection",
    title: "检查组要看台账",
    npcName: "检查组 王处长",
    unitType: "常规局委",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "市局检查组下周到，要抽查近三年的工作台账。你翻了一遍，发现前年两次活动只有通知，没有签到、没有照片，经办的人早调走了。科长说，补几张现场照片、做一份签到表，留痕的事大家都懂，只要时间逻辑对得上，就过得去。检查组进门先握手，翻本子的时候可不握手。",
    options: [
      {
        id: "opt_a",
        text: "补齐台账，签到表做扎实",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 4,
          risk: 6,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "如实写情况说明报上去",
        costAp: 1,
        effects: {
          ability: 6,
          authority: 5,
          kpi: -8,
          popularity: -4
        }
      },
      {
        id: "opt_c",
        text: "只报查得到的部分",
        costAp: 0,
        effects: {
          risk: 5,
          mgmt: -4,
          popularity: -2
        }
      }
    ]
  },
  {
    id: "evt_bureau_k_staff_borrow",
    title: "股室里少两个人",
    npcName: "分管副局长 老马",
    unitType: "常规局委",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "你的股室四个人，一个被市局借调半年，一个请了产假，局办又来通知，说巡察组要抽人，让再出一个。审批件已经堆到桌角。你去找分管领导说困难，领导说各单位都紧，让我先统筹一下，实在不行就加班。窗口不能空，件不能压，人是得从你这里出。",
    options: [
      {
        id: "opt_a",
        text: "自己顶上去，件不积压",
        costAp: 1,
        effects: {
          kpi: 6,
          ability: 4,
          health: -12,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "找局长当面汇报，争取留人",
        costAp: 2,
        effects: {
          mgmt: 7,
          authority: 4,
          popularity: -6,
          risk: 3
        }
      },
      {
        id: "opt_c",
        text: "谁在谁干，按现有分工硬扛",
        costAp: 0,
        effects: {
          popularity: -7,
          kpi: -3,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_bureau_k_hotline_order",
    title: "二十四小时工单",
    npcName: "热线办 小李",
    unitType: "常规局委",
    bands: [
      "科级"
    ],
    theme: "daily",
    description: "政务热线转来一张工单，群众投诉你们局审批超期，实际是隔壁局压着意见没回。工单要求24小时办结并回访满意。热线办小李在电话里说，你们先认下来，把满意率保住，至于责任是谁的，以后再协调。你点了「属实」，这件事就写进你们局的记录里了。",
    options: [
      {
        id: "opt_a",
        text: "先认下来，把工单办结",
        costAp: 1,
        effects: {
          kpi: 6,
          mgmt: 5,
          risk: 4,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "如实回复，非本单位职责",
        costAp: 1,
        effects: {
          ability: 6,
          authority: 4,
          kpi: -7,
          popularity: -3
        }
      },
      {
        id: "opt_c",
        text: "催对方补意见，先不回单",
        costAp: 0,
        effects: {
          risk: 5,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_bureau_c_fund_request",
    title: "专项资金的招呼",
    npcName: "分管副县长 老韩",
    unitType: "常规局委",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "一笔三百万的专项资金只剩最后两个名额，分管副县长把你叫到办公室，说某镇的产业项目「原则上可以支持一下」，那个镇的书记是他老同学。财政评审的意见是该项目材料不全。你手里那张表，今晚必须报上去。",
    options: [
      {
        id: "opt_a",
        text: "按评审意见报，材料补齐再说",
        costAp: 1,
        effects: {
          authority: 6,
          ability: 4,
          mgmt: -8,
          energy: -5
        }
      },
      {
        id: "opt_b",
        text: "给老韩面子，调剂一个名额",
        costAp: 1,
        effects: {
          mgmt: 8,
          kpi: 5,
          risk: 8,
          authority: -5
        }
      },
      {
        id: "opt_c",
        text: "先把材料退回去，让镇里补",
        costAp: 0,
        effects: {
          ability: 2,
          popularity: -4,
          kpi: -2,
          risk: 8,
          energy: -5
        }
      }
    ]
  },
  {
    id: "evt_bureau_c_hall_surveillance",
    title: "大厅里的暗访",
    npcName: "大厅主任 老陈",
    unitType: "常规局委",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "办事大厅的视频在网上传开，一个老人跑了三趟没办成事，窗口的年轻人说话冲了。市里的暗访通报明天下发，分管领导的意思是把口径统一到「系统故障」，再让窗口写份检查。你手上还有一份群众的实名投诉。",
    options: [
      {
        id: "opt_a",
        text: "如实上报，窗口停职整改",
        costAp: 1,
        effects: {
          authority: 6,
          ability: 4,
          mgmt: -10,
          kpi: -4
        }
      },
      {
        id: "opt_b",
        text: "按统一口径压下去，内部处理",
        costAp: 1,
        effects: {
          mgmt: 8,
          popularity: 3,
          risk: 8,
          authority: -6
        }
      },
      {
        id: "opt_c",
        text: "先登门道歉，通报的事等一等",
        costAp: 0,
        effects: {
          ability: 2,
          popularity: -2,
          kpi: -3,
          energy: -8,
          risk: 8
        }
      }
    ]
  },
  {
    id: "evt_bureau_c_school_seat_note",
    title: "一张条子",
    npcName: "局办主任 小郑",
    unitType: "常规局委",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "开学前三天，重点小学的空余学位只剩十一个，你桌上压着七张条子，其中一张是某位领导秘书送来的，孩子户口不在片区内。校长说他那边真的塞不下了，家长已经在门口排队登记，有人把手机举起来录像。",
    options: [
      {
        id: "opt_a",
        text: "按片区政策一刀切，条子全退",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 5,
          mgmt: -12,
          popularity: -6
        }
      },
      {
        id: "opt_b",
        text: "留个机动名额，把最上面那张办了",
        costAp: 2,
        effects: {
          mgmt: 10,
          kpi: 3,
          risk: 10,
          authority: -8,
          popularity: -4
        }
      },
      {
        id: "opt_c",
        text: "公开摇号，谁也别再找",
        costAp: 0,
        effects: {
          popularity: 4,
          mgmt: -5,
          kpi: -2,
          energy: -8,
          risk: 8
        }
      }
    ]
  },
  {
    id: "evt_bureau_c_year_end_data",
    title: "年末那张表",
    npcName: "统计科长 老吴",
    unitType: "常规局委",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "市里要求报今年的指标完成数，你手里的实际数字差两个百分点到考核线上。统计科长把改过的表放在你桌上，说可以对标去年口径，注一句「含预计」，历年都是这么报的。明天上午报送，市局那边已经打过电话催。",
    options: [
      {
        id: "opt_a",
        text: "按实际数报，考评分低就低",
        costAp: 1,
        effects: {
          authority: 7,
          ability: 5,
          mgmt: -12,
          kpi: -8
        }
      },
      {
        id: "opt_b",
        text: "按对表口径报，注明预计",
        costAp: 1,
        effects: {
          kpi: 8,
          mgmt: 8,
          risk: 10,
          authority: -5
        }
      },
      {
        id: "opt_c",
        text: "先报初步数，正式数下周补",
        costAp: 0,
        effects: {
          mgmt: -3,
          popularity: -3,
          energy: -5,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_bureau_c_subordinate_case",
    title: "老部下的一顿饭",
    npcName: "纪检组长 老孙",
    unitType: "常规局委",
    bands: [
      "处级"
    ],
    theme: "daily",
    description: "有人反映你手下一个科长在某项目验收前，和承包方一起吃了饭，还收了张两千的卡。纪检组长把线索摆到你面前，说可以作谈话提醒，也可以按程序上报。这个科长跟你干了八年，去年他父亲住院还找你借过钱。",
    options: [
      {
        id: "opt_a",
        text: "按程序上报，谁也别打招呼",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 4,
          risk: -6,
          popularity: -8
        }
      },
      {
        id: "opt_b",
        text: "谈话提醒，把卡退了就算了结",
        costAp: 1,
        effects: {
          popularity: 6,
          mgmt: 3,
          risk: 8,
          authority: -8
        }
      },
      {
        id: "opt_c",
        text: "这个事先放一放，再了解了解",
        costAp: 0,
        effects: {
          energy: -5,
          mgmt: -2,
          risk: 7
        }
      }
    ]
  },
  {
    id: "evt_bureau_t_special_fund_split",
    title: "专项资金切块",
    npcName: "市财政局长 老罗",
    unitType: "常规局委",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "六个市的专项资金分配方案摆在桌上，其中两亿的现代产业引导资金，你手上这版是按申报质量排的。晚饭前，你大学同窗、某市财政局长老罗打来电话，说他们市书记明天要来汇报，希望那个排名「再斟酌斟酌」。处里随后送来的第二版方案里，他们已经进了前三。窗外省府大楼的灯还亮着，方案明天上会。",
    options: [
      {
        id: "opt_a",
        text: "退回去，仍按专家评分排序",
        costAp: 1,
        effects: {
          authority: 10,
          ability: 5,
          mgmt: -8,
          popularity: -8,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "我不表态，让处里再完善一版",
        costAp: 0,
        effects: {
          mgmt: -3,
          ability: -3,
          popularity: -2,
          energy: -4
        }
      },
      {
        id: "opt_c",
        text: "给老罗打个招呼，提两位",
        costAp: 2,
        effects: {
          mgmt: 8,
          popularity: 6,
          kpi: 5,
          risk: 11,
          energy: -10
        }
      }
    ]
  },
  {
    id: "evt_bureau_t_joint_document_stall",
    title: "会签文件卡住了",
    npcName: "协作厅处长 老周",
    unitType: "常规局委",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "一份关于政务数据共享的联合发文，会签单在你桌上压了九天。协作厅的处长每次都客气，说「正在走流程」，可你心里清楚，他们是怕数据口子一开，责任落到自己头上。下月全省推进会要用这份文件，分管副省长已经问过两次。今晚老周约了饭，说是叙叙旧。",
    options: [
      {
        id: "opt_a",
        text: "饭照吃，字照催，不越界",
        costAp: 1,
        effects: {
          popularity: 5,
          mgmt: 5,
          energy: -8,
          risk: 4
        }
      },
      {
        id: "opt_b",
        text: "请分管副省长出面协调",
        costAp: 2,
        effects: {
          mgmt: 10,
          kpi: 8,
          popularity: -8,
          risk: 3,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "先放一放，等对方主动",
        costAp: 0,
        effects: {
          energy: -2,
          mgmt: -5,
          kpi: -4,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_t_hall_expose_video",
    title: "大厅视频上了热搜",
    npcName: "某市副局长 老秦",
    unitType: "常规局委",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "某市政务大厅一段视频传开了：老人跑了三趟，窗口之间来回推。播放量已经过百万。宣传处问要不要主动回应，网信那边说再观察观察，别自己点火。你分管这条线，厅里年度考核里正好有政务服务满意度这一项。手机里，那个市的局长已经连发三条微信，说「是我们的问题，请厅里给个口径」。",
    options: [
      {
        id: "opt_a",
        text: "当天派工作组下去，公开回应",
        costAp: 2,
        effects: {
          authority: 8,
          ability: 6,
          kpi: 5,
          energy: -15,
          risk: 3
        }
      },
      {
        id: "opt_b",
        text: "让市里自查，报个情况上来",
        costAp: 1,
        effects: {
          mgmt: 4,
          popularity: 3,
          energy: -6,
          risk: 6
        }
      },
      {
        id: "opt_c",
        text: "先不表态，等热度自己下去",
        costAp: 0,
        effects: {
          risk: 7,
          mgmt: -4,
          popularity: -3,
          kpi: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_t_approval_signature",
    title: "这个字签不签",
    npcName: "企业老板 老陈",
    unitType: "常规局委",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "一家企业的生产资质审批卡在最后一道：环评的补充材料没补齐。老板老陈是外地来的投资商，市里为了这个项目，两位副市长都出过面。交办单上写着「请予支持」。处长把材料放到你面前，说实质条件都够了，就差个形式。按程序，这份材料缺一不可；按人情，全省都在拼招商。",
    options: [
      {
        id: "opt_a",
        text: "材料补齐再签，一个不落",
        costAp: 1,
        effects: {
          authority: 10,
          ability: 5,
          mgmt: -8,
          popularity: -8,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "先签，限期补交",
        costAp: 2,
        effects: {
          kpi: 10,
          mgmt: 8,
          popularity: 5,
          risk: 12,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "让处里再核一遍，我不签也不退",
        costAp: 0,
        effects: {
          mgmt: -5,
          kpi: -3,
          ability: -3,
          energy: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_t_inspection_legacy",
    title: "巡视整改里的旧账",
    npcName: "巡视联络员 老韩",
    unitType: "常规局委",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "巡视反馈的问题清单里有一条：三年前的一笔培训经费，去向说得不清楚，当时是前任签的字。整改方案明天要报。联络员老韩提醒你，写「制度不健全、已完善」，材料上过得去；写「资金去向不明、移交核查」，那就是另一回事了。前任如今在省里还有位置，逢年过节还通电话。",
    options: [
      {
        id: "opt_a",
        text: "如实写，移交核查",
        costAp: 2,
        effects: {
          authority: 12,
          risk: -10,
          popularity: -12,
          mgmt: -8,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "按制度不健全的表述上报",
        costAp: 1,
        effects: {
          mgmt: 6,
          popularity: 6,
          risk: 7,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "先搁一搁，等初稿汇总再说",
        costAp: 0,
        effects: {
          mgmt: -4,
          kpi: -3,
          popularity: -2,
          risk: 5,
          energy: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_t_data_water",
    title: "报上来的数字",
    npcName: "统计处长 老吴",
    unitType: "常规局委",
    bands: [
      "厅级"
    ],
    theme: "daily",
    description: "全省年度指标汇总出来了，各市报的增速加总，比厅里监测的口径高出不少。统计处长说，惯例是「对标对表」，把口径调一调，报上去好看，省里考核市里，市里也考核我们。可今年是数据质量核查年，上个月刚开过会，强调不得层层注水。材料明天要报省府。",
    options: [
      {
        id: "opt_a",
        text: "要求各市核减重报",
        costAp: 2,
        effects: {
          authority: 10,
          ability: 8,
          kpi: -10,
          popularity: -12,
          energy: -12
        }
      },
      {
        id: "opt_b",
        text: "按惯例调口径上报",
        costAp: 1,
        effects: {
          kpi: 10,
          mgmt: 8,
          risk: 11,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "按原数据报，附个说明",
        costAp: 0,
        effects: {
          kpi: -5,
          mgmt: -5,
          popularity: -3,
          energy: -3
        }
      }
    ]
  },
  {
    id: "evt_bureau_s_special_fund_split",
    title: "十亿专项怎么切",
    npcName: "财政厅副厅长 老郑",
    unitType: "常规局委",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "省财政厅把今年的产业专项转移支付方案报到你桌上，盘子十个亿。两个市同时打了报告：一个市是省里定了要重点扶持的，另一个市的分管副市长托人打过招呼。方案上写着「按因素法测算，统筹兼顾」，老郑说，原则上可以按因素法走，也可以灵活把握。你签，还是不签。",
    options: [
      {
        id: "opt_a",
        text: "按因素法签，谁打招呼也没用",
        costAp: 1,
        effects: {
          authority: 10,
          ability: 6,
          popularity: -12,
          kpi: -4
        }
      },
      {
        id: "opt_b",
        text: "重点市倾斜，另一市协调一下",
        costAp: 2,
        effects: {
          kpi: 12,
          mgmt: 8,
          risk: 8,
          popularity: -6
        }
      },
      {
        id: "opt_c",
        text: "先放一放，让厅里再核一遍数",
        costAp: 0,
        effects: {
          energy: -5,
          kpi: -6,
          mgmt: -5,
          risk: 3
        }
      }
    ]
  },
  {
    id: "evt_bureau_s_two_bureaus_shirk",
    title: "两个厅都不认账",
    npcName: "省政府副秘书长 老吴",
    unitType: "常规局委",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "一件群众反映了七八年的事，卡在两个厅的职责边界上，谁也不肯认领。协调会开了三次，两次的结论都是「再研究」。今天省政府副秘书长老吴又把两家叫来，会议室里的人都看着你。事情本身不难，难的是签下这个字，就等于认下一份责任。",
    options: [
      {
        id: "opt_a",
        text: "当场定一家主办，写进会议纪要",
        costAp: 2,
        effects: {
          authority: 12,
          ability: 6,
          kpi: 5,
          popularity: -12
        }
      },
      {
        id: "opt_b",
        text: "两家组专班共办，先干起来再说",
        costAp: 1,
        effects: {
          popularity: 6,
          mgmt: 5,
          kpi: -5,
          energy: -10
        }
      },
      {
        id: "opt_c",
        text: "报常务会，请主要领导来定",
        costAp: 0,
        effects: {
          mgmt: -6,
          kpi: -5,
          energy: -5,
          popularity: 3
        }
      }
    ]
  },
  {
    id: "evt_bureau_s_window_meltdown",
    title: "窗口视频上了热搜",
    npcName: "省局信访处长 老田",
    unitType: "常规局委",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "一段某市政务大厅的视频在网上传开，办一个证要跑四个窗口，群众在镜头前说了句「你们省里就这水平」。网信办要求两小时内给出回应口径。老田说，业务系统确实是省局这边的，可窗口上的人是市里管的。评论区已经几十万条了。",
    options: [
      {
        id: "opt_a",
        text: "连夜全省排查，明天开发布会",
        costAp: 2,
        effects: {
          popularity: 12,
          kpi: 6,
          ability: 5,
          energy: -18,
          health: -10
        }
      },
      {
        id: "opt_b",
        text: "就个案回应，压实市里整改",
        costAp: 1,
        effects: {
          mgmt: 6,
          kpi: 4,
          risk: 5,
          popularity: -8
        }
      },
      {
        id: "opt_c",
        text: "按程序办，等舆情自己消退",
        costAp: 0,
        effects: {
          risk: 7,
          popularity: -10,
          kpi: -6,
          mgmt: -4
        }
      }
    ]
  },
  {
    id: "evt_bureau_s_inflated_report",
    title: "报表上的数字",
    npcName: "省局统计处长 老袁",
    unitType: "常规局委",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "半年报要汇总上报，几个市的数字明显高于同期的用电量和税收增幅。厅里解释说「口径就这样，历年如此」，省里正准备拿这套数往上汇报。你签了，数字好看；你核了，全省盘子往下掉一截，还得罪一串人。",
    options: [
      {
        id: "opt_a",
        text: "退回重核，宁可难看也不带水分",
        costAp: 2,
        effects: {
          ability: 10,
          authority: 8,
          kpi: -12,
          popularity: -10
        }
      },
      {
        id: "opt_b",
        text: "照签，附个说明，留痕",
        costAp: 1,
        effects: {
          kpi: 12,
          mgmt: 8,
          risk: 8,
          energy: -6
        }
      },
      {
        id: "opt_c",
        text: "让厅里再核，你先不表态",
        costAp: 0,
        effects: {
          kpi: -5,
          mgmt: -6,
          energy: -4,
          risk: 3
        }
      }
    ]
  },
  {
    id: "evt_bureau_s_inspection_rectify",
    title: "巡视反馈的整改台账",
    npcName: "省厅纪检组长 老方",
    unitType: "常规局委",
    bands: [
      "省部级"
    ],
    theme: "daily",
    description: "巡视组反馈了一条：某项审批「重前置、轻事后」，点到了你分管的两个厅。整改台账三天后要报。两条路：一是追责到具体处室和个人，通报全省；二是写「建章立制、长期坚持」，先把台账交上去。老方说，怎么定，你拿主意。",
    options: [
      {
        id: "opt_a",
        text: "追责到人，全省通报，不留余地",
        costAp: 2,
        effects: {
          authority: 12,
          ability: 6,
          kpi: 5,
          popularity: -15,
          energy: -8
        }
      },
      {
        id: "opt_b",
        text: "建章立制把制度补上，人不动",
        costAp: 1,
        effects: {
          mgmt: 6,
          popularity: 5,
          kpi: -4,
          risk: 5
        }
      },
      {
        id: "opt_c",
        text: "台账先写正在整改，分期消化",
        costAp: 0,
        effects: {
          risk: 7,
          kpi: -6,
          mgmt: -5,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_common_k_unannounced_inspection",
    title: "暗访组进了服务大厅",
    npcName: "纪委暗访组 老陈",
    unitType: "通用",
    bands: [
      "科级"
    ],
    theme: "risk",
    description: "周五下午，纪委暗访组两名同志没打招呼就进了你分管的服务大厅，手机里存着三段视频：窗口空岗、群众排队无人引导、公示栏还挂着去年的内容。带队的只说了一句，按程序办，你先写个情况说明。你清楚那三天你人在县里开会，可排班表上签的是你的名字。是把话说到前头，还是先找人协调一下？",
    options: [
      {
        id: "opt_a",
        text: "连夜写说明，附上会议签到和排班表",
        costAp: 2,
        effects: {
          energy: -16,
          risk: -12,
          ability: 6,
          authority: 5,
          mgmt: -4
        }
      },
      {
        id: "opt_b",
        text: "先给老陈的老领导打个电话协调一下",
        costAp: 1,
        effects: {
          risk: 7,
          mgmt: 6,
          popularity: 4,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "这个事先放一放，等等风头",
        costAp: 0,
        effects: {
          risk: 5,
          mgmt: -5,
          popularity: -4,
          energy: -4
        }
      }
    ]
  },
  {
    id: "evt_common_k_inquiry_letter",
    title: "一封函询通知书",
    npcName: "纪委 张副书记",
    unitType: "通用",
    bands: [
      "科级"
    ],
    theme: "risk",
    description: "一份函询通知书摆在桌上，红头编号，要求十五个工作日内书面回复。问的是三年前你经手那笔经费里两张餐饮发票的用途。项目扫尾那年饭确实吃了，票是后补的，你签了字就翻篇了。张副书记找你谈话时只说，不要有思想包袱，如实说明就行。可你明白，如实这两个字往下写，就是一条线。",
    options: [
      {
        id: "opt_a",
        text: "逐条如实回复，把当年的经手人列清楚",
        costAp: 2,
        effects: {
          energy: -15,
          risk: -11,
          ability: 7,
          mgmt: -5
        }
      },
      {
        id: "opt_b",
        text: "托人递句话，请组织上会考虑的",
        costAp: 1,
        effects: {
          risk: 8,
          mgmt: 7,
          popularity: 5,
          energy: -10
        }
      },
      {
        id: "opt_c",
        text: "拖着，先答复个模棱两可的说明",
        costAp: 0,
        effects: {
          risk: 6,
          mgmt: -6,
          authority: -4
        }
      }
    ]
  },
  {
    id: "evt_common_k_colleague_ambush",
    title: "汇报会上的冷箭",
    npcName: "同僚 老赵",
    unitType: "通用",
    bands: [
      "科级"
    ],
    theme: "risk",
    description: "巡视组下沉到你们单位第三天，汇报会上，一直与你不睦的老赵忽然开口，说你分管的那块有个项目，验收材料的时间比开工还早。屋里静了两秒，巡视组那位同志把笔停住了。主要领导看了你一眼，说回头再说。散会时老赵从你身边过去，拍了拍你的肩，什么也没说。",
    options: [
      {
        id: "opt_a",
        text: "当场认下，会后三天内补齐台账",
        costAp: 2,
        effects: {
          energy: -18,
          authority: 6,
          ability: 5,
          risk: -9,
          popularity: -5
        }
      },
      {
        id: "opt_b",
        text: "顺手把老赵那块的老账也提一提",
        costAp: 1,
        effects: {
          risk: 7,
          authority: 4,
          popularity: -9,
          energy: -11
        }
      },
      {
        id: "opt_c",
        text: "会后单独找领导，请这个事先放一放",
        costAp: 0,
        effects: {
          risk: 5,
          mgmt: -5,
          popularity: -3
        }
      }
    ]
  },
  {
    id: "evt_common_k_checkup_abnormal",
    title: "体检单上的箭头",
    npcName: "接诊医生 老张",
    unitType: "通用",
    bands: [
      "科级"
    ],
    theme: "health",
    description: "体检报告下午送到办公室，谷丙转氨酶、血压、心电图三项都标了箭头。老张把笔一搁：这个数，原则上得住院观察一周。可下周就是市里检查，材料还没定稿，分管领导刚在会上说要对标对表、压实责任。住院，摊子没人接；不住，你自己心里清楚这身子到底什么成色。",
    options: [
      {
        id: "opt_a",
        text: "当天办住院，工作书面交办出去",
        costAp: 2,
        effects: {
          health: 20,
          energy: 12,
          kpi: -10,
          mgmt: -6
        }
      },
      {
        id: "opt_b",
        text: "白天上班，晚上回医院输液",
        costAp: 1,
        effects: {
          health: -14,
          energy: -12,
          kpi: 6,
          mgmt: 5
        }
      },
      {
        id: "opt_c",
        text: "先压一压，把报告塞进抽屉",
        costAp: 0,
        effects: {
          health: -20,
          energy: -6,
          risk: 5
        }
      }
    ]
  },
  {
    id: "evt_common_k_family_transfer_push",
    title: "她说去找了组织部",
    npcName: "妻子 林芳",
    unitType: "通用",
    bands: [
      "科级"
    ],
    theme: "health",
    description: "住院第三天，林芳拿着体检报告去了组织部，找的是她的大学同学。晚上她坐在床边：调个清闲点的岗，少挣点就少挣点。第二天分管领导把你叫到走廊，说组织上会考虑，但这话说出去就收不回来了。留下，等于驳了她的面子；走，等于自己认了这身子扛不住。",
    options: [
      {
        id: "opt_a",
        text: "顺水推舟，找领导提调岗",
        costAp: 2,
        effects: {
          health: 16,
          energy: 10,
          authority: -12,
          mgmt: -8,
          kpi: -6
        }
      },
      {
        id: "opt_b",
        text: "让妻子别再跑，岗我自己扛",
        costAp: 1,
        effects: {
          authority: 8,
          ability: 6,
          health: -15,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "先含糊应下，说组织上会考虑",
        costAp: 0,
        effects: {
          health: -8,
          popularity: -5,
          mgmt: -3
        }
      }
    ]
  },
  {
    id: "evt_common_c_hanxun_notice",
    title: "函询通知书",
    npcName: "市纪委 陈主任",
    unitType: "通用",
    bands: [
      "处级"
    ],
    theme: "risk",
    description: "市纪委的函询通知书是机要员送来的，牛皮纸信封，落款监督室，要你一个月内就三年前那笔企业赞助的赴外考察作出书面说明。陈主任电话里语气客气：「按程序办，说清楚就行。」可那几张发票是怎么凑的，你比谁都清楚。笔记本摊在面前，第一个字写了半个钟头没落下去。说到哪一步，你得掂量。",
    options: [
      {
        id: "opt_a",
        text: "如实写清发票的来龙去脉",
        costAp: 2,
        effects: {
          risk: -15,
          authority: -5,
          mgmt: -8,
          energy: -10
        }
      },
      {
        id: "opt_b",
        text: "托老陈私下摸摸底，先探口风",
        costAp: 1,
        effects: {
          risk: 6,
          popularity: 5,
          mgmt: 3,
          energy: -5
        }
      },
      {
        id: "opt_c",
        text: "书面回复，措辞模糊带过",
        costAp: 0,
        effects: {
          risk: 7,
          energy: -5,
          authority: -3,
          mgmt: -3
        }
      }
    ]
  },
  {
    id: "evt_common_c_checkup_arrows",
    title: "体检单上的三个箭头",
    npcName: "县医院体检科 老周",
    unitType: "通用",
    bands: [
      "处级"
    ],
    theme: "health",
    description: "体检报告出来，谷丙转氨酶一百二，血压一百六，心电图那栏写着「建议复查」。签字的主任是你老同学，他把诊室门掩上：「再这么扛，就不是住院的事了。」下周全市现场会要在你这儿开，一笔专项资金也卡在这个节点上。手机在桌面上震，办公室催你定参观点位。老周看着你，等你一句话。",
    options: [
      {
        id: "opt_a",
        text: "让医院先挂着床，白天回去上班",
        costAp: 0,
        effects: {
          risk: 8,
          kpi: 6,
          health: -12,
          energy: -6
        }
      },
      {
        id: "opt_b",
        text: "当天办住院，让副职去顶现场会",
        costAp: 2,
        effects: {
          health: 14,
          kpi: -8,
          mgmt: -5,
          energy: 6
        }
      },
      {
        id: "opt_c",
        text: "先开药扛过去，会开完再说",
        costAp: 1,
        effects: {
          kpi: 10,
          mgmt: 6,
          health: -15,
          energy: -8
        }
      }
    ]
  },
  {
    id: "evt_common_c_ward_transfer_request",
    title: "病房里的调岗申请",
    npcName: "你的妻子 老林",
    unitType: "通用",
    bands: [
      "处级"
    ],
    theme: "health",
    description: "住院第三天上午，妻子把一份调岗申请放在床头，说已经替你问过组织部的口风，原则上可以考虑。手机响了，主要领导要你定一个数字，明天上会。门又被推开，分管口上的老板提着两个牛皮纸袋进来，说只是来看看老领导。三件事挤在一间病房里，你躺着，谁也没法先打发。",
    options: [
      {
        id: "opt_a",
        text: "把申请签了，回组织上正式提",
        costAp: 1,
        effects: {
          health: 14,
          kpi: -8,
          mgmt: -6,
          authority: -4
        }
      },
      {
        id: "opt_b",
        text: "让家里别管，明天就办出院",
        costAp: 2,
        effects: {
          kpi: 12,
          mgmt: 8,
          health: -16,
          energy: -10
        }
      },
      {
        id: "opt_c",
        text: "东西退回去，事项按程序办",
        costAp: 0,
        effects: {
          risk: -6,
          kpi: -5,
          mgmt: -5,
          popularity: -3,
          health: 4
        }
      }
    ]
  },
  {
    id: "evt_common_t_letter_inquiry",
    title: "函询到案头",
    npcName: "省纪委 李处长",
    unitType: "通用",
    bands: [
      "厅级"
    ],
    theme: "risk",
    description: "深夜，机要室送来一份省纪委的函询通知书——就三年前某市政工程招投标、你表弟公司中标一事，要求你十个工作日内如实回复。措辞平平，只有一句「请按程序办」。你清楚，这份函一旦入了卷，就再没有收回的余地；更何况你上周刚在会上被点了名，这阵风的来头不小。",
    options: [
      {
        id: "opt_a",
        text: "如实说明，附上全部往来凭证",
        costAp: 2,
        effects: {
          risk: -20,
          authority: 5,
          mgmt: -8,
          energy: -12
        }
      },
      {
        id: "opt_b",
        text: "托老关系打听来头，先拖一拖",
        costAp: 1,
        effects: {
          risk: 7,
          mgmt: 6,
          authority: -5,
          energy: -8
        }
      },
      {
        id: "opt_c",
        text: "交秘书拟稿，避重就轻地回",
        costAp: 0,
        effects: {
          risk: 6,
          authority: -6,
          energy: -5
        }
      }
    ]
  },
  {
    id: "evt_common_t_inspection_landing",
    title: "巡视组约谈",
    npcName: "常务副市长 老周",
    unitType: "通用",
    bands: [
      "厅级"
    ],
    theme: "risk",
    description: "巡视组进驻第三天，通知你下午单独谈话，谈的是你分管园区里那三百亩闲置土地。可你刚得到消息，举报材料是常务副市长老周递上去的——去年那块地本该给他引的项目，被你拦了下来。秘书问，要不要先去老周那里「沟通沟通」。你盯着墙上的产业规划图，明白这一谈，谈的是地，也是位子。",
    options: [
      {
        id: "opt_a",
        text: "向巡视组交底，把地的事讲透",
        costAp: 2,
        effects: {
          risk: -16,
          authority: 6,
          mgmt: -8,
          energy: -12
        }
      },
      {
        id: "opt_b",
        text: "请老周吃个饭，让一步换个安生",
        costAp: 1,
        effects: {
          risk: 8,
          mgmt: 6,
          popularity: 6,
          authority: -6
        }
      },
      {
        id: "opt_c",
        text: "只谈政策口径，个人的事不接",
        costAp: 0,
        effects: {
          risk: 6,
          mgmt: -4,
          authority: -3
        }
      }
    ]
  },
  {
    id: "evt_common_t_night_banquet",
    title: "暗访组的镜头",
    npcName: "秘书 小郑",
    unitType: "通用",
    bands: [
      "厅级"
    ],
    theme: "risk",
    description: "周五晚，你陪外地投资商在定点酒店吃饭，包厢是对方订的，酒是对方带的。散席时，秘书小郑压低声音：门口有两张生面孔，像是纪委暗访组的，正拿镜头对着车牌拍照。投资商还在里面等着签那份框架协议。你想起上周刚传达的违规吃喝专项整治，后背一层汗。",
    options: [
      {
        id: "opt_a",
        text: "当场向暗访组说明，主动登记",
        costAp: 2,
        effects: {
          risk: -14,
          authority: 5,
          mgmt: -8,
          popularity: -5
        }
      },
      {
        id: "opt_b",
        text: "让小郑去协调一下，把痕迹清了",
        costAp: 1,
        effects: {
          risk: 10,
          popularity: 5,
          mgmt: 5,
          authority: -8
        }
      },
      {
        id: "opt_c",
        text: "不多说，照常离场，回头再说",
        costAp: 0,
        effects: {
          risk: 6,
          mgmt: -5,
          authority: -4
        }
      }
    ]
  },
  {
    id: "evt_common_t_checkup_redlines",
    title: "体检单上的红箭头",
    npcName: "保健办主任 老康",
    unitType: "通用",
    bands: [
      "厅级"
    ],
    theme: "health",
    description: "年度体检报告出来，肝上三项、血糖、血压，红箭头排了半页。保健办主任把住院单推到你面前，说这个情况不能拖，先把床位留着。可下周三省里来考核组，周五还有一场招商签约，主要领导点名要你到场。他把笔搁在单子上，补了一句：这个事，你自己把握。",
    options: [
      {
        id: "opt_a",
        text: "住院单压进抽屉，晚上输液白天开会",
        costAp: 1,
        effects: {
          energy: -12,
          health: -15,
          kpi: 8,
          mgmt: 6,
          risk: 3
        }
      },
      {
        id: "opt_b",
        text: "请假两周住院，分管的事交出去",
        costAp: 0,
        effects: {
          health: 18,
          energy: 12,
          kpi: -10,
          mgmt: -8,
          authority: -4
        }
      },
      {
        id: "opt_c",
        text: "住特需病房，病历写成肠胃炎，会照开",
        costAp: 2,
        effects: {
          health: -6,
          energy: -8,
          kpi: 8,
          mgmt: 5,
          risk: 7
        }
      }
    ]
  },
  {
    id: "evt_common_t_family_pressure_transfer",
    title: "爱人去了趟组织部",
    npcName: "常务副部长 老方",
    unitType: "通用",
    bands: [
      "厅级"
    ],
    theme: "health",
    description: "妻子拿着你的体检报告，去了市委组织部，找的是她大学同学。当天下午，常务副部长老方打来电话，语气客气：家里有困难，组织上会考虑的，但也要尊重本人的意愿。挂了电话，你桌上还压着明早上会的产业规划方案，窗外已经黑透了。",
    options: [
      {
        id: "opt_a",
        text: "回话老方，家里的事不用组织操心",
        costAp: 1,
        effects: {
          authority: 6,
          energy: -6,
          popularity: -6,
          mgmt: -3
        }
      },
      {
        id: "opt_b",
        text: "默认妻子的做法，补一份个人情况说明",
        costAp: 1,
        effects: {
          mgmt: 6,
          popularity: 3,
          kpi: -8,
          authority: -6,
          risk: 6
        }
      },
      {
        id: "opt_c",
        text: "向市委请一个月病假，工作全权交常务",
        costAp: 0,
        effects: {
          health: 16,
          energy: 10,
          kpi: -10,
          mgmt: -8,
          authority: -5
        }
      }
    ]
  },
  {
    id: "evt_common_s_letter_inquiry",
    title: "函询通知书",
    npcName: "省纪委 韩副书记",
    unitType: "通用",
    bands: [
      "省部级"
    ],
    theme: "risk",
    description: "省纪委的函询通知书摆在案头，要你就三年前那笔专项资金的审批过程作出书面说明。当年那笔钱，是常务副职打过招呼的，你在签批单上落了名字。老韩在电话里语气平和：「按程序办，如实讲清楚就行，不要有思想包袱。」可你清楚，材料一旦落纸，牵出的不止你一个。书面说明，三日内报。",
    options: [
      {
        id: "opt_a",
        text: "如实写，把当年签批的来龙去脉讲透",
        costAp: 1,
        effects: {
          ability: 8,
          authority: 6,
          risk: -18,
          mgmt: -10,
          energy: -12
        }
      },
      {
        id: "opt_b",
        text: "先找老韩协调，争取谈一次话了结",
        costAp: 2,
        effects: {
          risk: 7,
          mgmt: 8,
          popularity: 6,
          authority: -8,
          energy: -15
        }
      },
      {
        id: "opt_c",
        text: "只按文件表面答复，不提打招呼一节",
        costAp: 0,
        effects: {
          risk: 7,
          ability: -6,
          mgmt: -6,
          energy: -8
        }
      }
    ]
  },
  {
    id: "evt_common_s_standing_committee",
    title: "常委会上的发难",
    npcName: "常务副职 老周",
    unitType: "通用",
    bands: [
      "省部级"
    ],
    theme: "risk",
    description: "常委会讨论明年投资盘子，老周忽然话锋一转，提起半年前那桩国企重组的传言：「有些事，组织上总得有个说法。」满座无声。你听得出这是他递的信号——考察组下月就下来，他在给自己铺路，也想在你的考察材料上留一笔。会议纪要是要留痕的，这句话你接不接，怎么接。",
    options: [
      {
        id: "opt_a",
        text: "当场请组织核实，把话摆到桌面上",
        costAp: 2,
        effects: {
          authority: 12,
          ability: 6,
          risk: -10,
          popularity: -12,
          energy: -15
        }
      },
      {
        id: "opt_b",
        text: "会后单独找老周谈，各让一步",
        costAp: 1,
        effects: {
          popularity: 8,
          mgmt: 6,
          risk: 7,
          authority: -10
        }
      },
      {
        id: "opt_c",
        text: "顺着他说，这个事先放一放",
        costAp: 0,
        effects: {
          risk: 5,
          authority: -8,
          kpi: -5
        }
      }
    ]
  },
  {
    id: "evt_common_s_undercover_visit",
    title: "暗访组进了接待点",
    npcName: "纪委暗访组 老陈",
    unitType: "通用",
    bands: [
      "省部级"
    ],
    theme: "risk",
    description: "省纪委暗访组在你的联系点待了两天，走的当晚，办公室主任来电：暗访组拍了照，一次接待超了标准，签单的是你分管口子上的处长。老陈还没找你，但按规定，谈话笔录很快就会到。那处长跟了你六年，材料一交，他先折进去。留给你的，只有这一晚。",
    options: [
      {
        id: "opt_a",
        text: "主动向组织报告，把处长一并说清",
        costAp: 2,
        effects: {
          risk: -20,
          authority: 8,
          ability: 6,
          popularity: -12,
          energy: -15
        }
      },
      {
        id: "opt_b",
        text: "让处长自己写检讨，先顶上去",
        costAp: 1,
        effects: {
          risk: 5,
          mgmt: 5,
          ability: -6,
          popularity: -12
        }
      },
      {
        id: "opt_c",
        text: "先按程序核实，暂不表态",
        costAp: 0,
        effects: {
          risk: 5,
          energy: -8,
          popularity: -5
        }
      }
    ]
  },
  {
    id: "evt_common_s_health_report_held",
    title: "体检报告压在抽屉里",
    npcName: "保健办医生 老陈",
    unitType: "通用",
    bands: [
      "省部级"
    ],
    theme: "health",
    description: "你已经连着两周靠含片和小针撑着。保健办老陈把体检报告单独送到办公室，没走流程——按程序本该先报保健办备案。几项指标标红，他建议立刻住院做进一步检查。秘书提醒，下周是全省经济形势分析会，报告一旦归档，外面就该有说法了。家属的电话一晚来了三个，说再这么下去要去找组织。报告就在你手边，抽屉的钥匙在你自己兜里。",
    options: [
      {
        id: "opt_a",
        text: "当晚住院，分析会请副省长代讲",
        costAp: 1,
        effects: {
          health: 15,
          energy: 10,
          kpi: -8,
          mgmt: -10,
          authority: -5
        }
      },
      {
        id: "opt_b",
        text: "报告压住，会议开完再说",
        costAp: 0,
        effects: {
          health: -12,
          kpi: 8,
          mgmt: 5,
          risk: 8
        }
      },
      {
        id: "opt_c",
        text: "先向主要领导报告，请组织安排",
        costAp: 2,
        effects: {
          mgmt: 8,
          health: 6,
          authority: -10,
          popularity: -6,
          kpi: -5
        }
      }
    ]
  },
  {
    id: "evt_common_any_late_night_draft",
    title: "明早要报的材料",
    npcName: "同科室 老陈",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "晚上十点，明天一早的汇报材料还差一大块。老陈端着杯子过来，说孩子发烧还在医院，问你能否把他分管那部分也带上，「你笔头比我快」。你自己那部分也才开了个头，整层楼就剩你们这一间亮着灯。分工本来是清楚的，可明天误了事，板子是一起挨的，材料上又不写谁写哪一段。",
    options: [
      {
        id: "opt_a",
        text: "全接下，通宵赶出来",
        costAp: 2,
        effects: {
          energy: -22,
          health: -12,
          kpi: 8,
          ability: 5,
          popularity: 4
        }
      },
      {
        id: "opt_b",
        text: "只写自己那份，到点就走",
        costAp: 1,
        effects: {
          energy: -6,
          popularity: -10,
          authority: 4,
          ability: 3
        }
      },
      {
        id: "opt_c",
        text: "把提纲给他，让他照着填",
        costAp: 0,
        effects: {
          energy: -4,
          popularity: -6,
          kpi: -4,
          mgmt: -2
        }
      }
    ]
  },
  {
    id: "evt_common_any_night_duty_call",
    title: "凌晨两点的电话",
    npcName: "值班室 老周",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "你值夜班，凌晨两点电话响了。下面报上来一件事，不大不小，有人家里出了状况，情绪激动，说要在网上发。对方问要不要往上报。报早了怕惊动领导，明天挨一句小题大做；压下来万一发酵，责任全在你身上。老周在旁边搓着手，说这种事「你懂的」，他不好替你拿主意。",
    options: [
      {
        id: "opt_a",
        text: "按程序上报值班领导和分管领导",
        costAp: 1,
        effects: {
          energy: -10,
          mgmt: 3,
          authority: 4,
          kpi: -3,
          risk: -6
        }
      },
      {
        id: "opt_b",
        text: "先稳住下面，天亮再报",
        costAp: 1,
        effects: {
          energy: -6,
          popularity: 4,
          mgmt: 2,
          authority: -3,
          risk: 6
        }
      },
      {
        id: "opt_c",
        text: "让下面按老规矩先处置",
        costAp: 0,
        effects: {
          energy: -2,
          mgmt: -4,
          popularity: 3,
          risk: 8
        }
      }
    ]
  },
  {
    id: "evt_common_any_banquet_envelope",
    title: "散场时的信封",
    npcName: "老同学 老赵",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "老同学做东，饭桌上还坐着一个面生的老板，全程没提正事，只说交个朋友。散场时老赵把一个信封塞进你外套口袋，说是过节的意思，别见外。你手插在兜里，摸得出厚度。这事不上台面，收了也未必有人知道，可万一哪天被人翻出来，谁也保不了你。",
    options: [
      {
        id: "opt_a",
        text: "当场退回去，把话说透",
        costAp: 1,
        effects: {
          energy: -6,
          popularity: -8,
          authority: 6,
          mgmt: -3,
          risk: -8
        }
      },
      {
        id: "opt_b",
        text: "收下，人情以后再说",
        costAp: 1,
        effects: {
          popularity: 6,
          mgmt: 2,
          authority: -4,
          risk: 11
        }
      },
      {
        id: "opt_c",
        text: "借口有事先走，不做表态",
        costAp: 0,
        effects: {
          energy: -4,
          popularity: -6,
          mgmt: -2
        }
      }
    ]
  },
  {
    id: "evt_common_any_sign_the_form",
    title: "这张票我先签了",
    npcName: "隔壁科室 小刘",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "小刘抱来一沓票据，说领导催得急，先走流程，「你把字签了，后面的我来补」。里面有两张不合规，你一眼就看得出来。按程序办，是退回去重开；特事特办，是替他担着。真出了事，签字的是你，追责追不到他头上。",
    options: [
      {
        id: "opt_a",
        text: "退回，让他按规矩补齐",
        costAp: 1,
        effects: {
          energy: -5,
          popularity: -6,
          authority: 6,
          kpi: -2,
          risk: -8
        }
      },
      {
        id: "opt_b",
        text: "先签了，让他赶紧去办",
        costAp: 1,
        effects: {
          energy: -3,
          popularity: 6,
          mgmt: 3,
          authority: -4,
          risk: 8
        }
      },
      {
        id: "opt_c",
        text: "拿不准，让他去问领导",
        costAp: 0,
        effects: {
          energy: -3,
          popularity: -5,
          mgmt: -3,
          ability: -3
        }
      }
    ]
  },
  {
    id: "evt_common_any_appraisal_vote",
    title: "测评表上的名字",
    npcName: "老同事 王姐",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "年度测评前，王姐端着茶杯在你工位边站了一会儿，说今年是她最后一次机会，退了就再没下一回，「老弟你手里的笔，心里有数就行」。测评虽说无记名，科室就这么几个人，谁打了谁，明眼人看得出来。照实填，她多半评不上；顺着人情，别人也就这么顺着你。",
    options: [
      {
        id: "opt_a",
        text: "按实际表现填",
        costAp: 1,
        effects: {
          energy: -4,
          popularity: -8,
          authority: 5,
          mgmt: -2
        }
      },
      {
        id: "opt_b",
        text: "顺手给她打个高分",
        costAp: 1,
        effects: {
          popularity: 6,
          authority: -5,
          kpi: -2,
          risk: 6
        }
      },
      {
        id: "opt_c",
        text: "把表压着，等别人先交",
        costAp: 0,
        effects: {
          energy: -2,
          popularity: -3,
          mgmt: -3,
          authority: -4
        }
      }
    ]
  },
  {
    id: "evt_common_any_inspection_ledger",
    title: "台账还差三本",
    npcName: "分管领导 老李",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "检查组后天到，台账还差三本，其中一本去年根本没做过。老李把门带上，说补一补，把时间往前挪，面上的东西得过得去。补台账不难，难的是这是个坑——补上去的日期和会议记录对不上，一旦被翻出来，性质就变了。可要是不补，检查组当场点出来，丢的是全单位的脸。",
    options: [
      {
        id: "opt_a",
        text: "缺就缺，照实说明",
        costAp: 1,
        effects: {
          energy: -6,
          mgmt: -8,
          kpi: -6,
          authority: 6
        }
      },
      {
        id: "opt_b",
        text: "连夜补齐，做得像样",
        costAp: 2,
        effects: {
          energy: -18,
          health: -8,
          kpi: 8,
          mgmt: 6,
          risk: 10
        }
      },
      {
        id: "opt_c",
        text: "补一部分，关键处留空",
        costAp: 0,
        effects: {
          energy: -4,
          mgmt: -2,
          risk: 6
        }
      }
    ]
  },
  {
    id: "evt_common_any_urgent_supervision",
    title: "点名要你回的件",
    npcName: "办公室 小郑",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "上级下来一件督办件，点名要本部门今天下班前书面回复，还抄送了主要领导。按规矩，该处长签字后再报，可处长在外地开会，电话里只说「你先拟着，顾全大局」。今天不回，明天的通报里就有你；自己回了，越了口，处长回来未必认这个账。",
    options: [
      {
        id: "opt_a",
        text: "等处长回来签字再报",
        costAp: 1,
        effects: {
          energy: -4,
          mgmt: -6,
          kpi: -5,
          authority: 4,
          risk: -5
        }
      },
      {
        id: "opt_b",
        text: "先拟好报上去，事后补签",
        costAp: 1,
        effects: {
          energy: -8,
          mgmt: 6,
          kpi: 5,
          risk: 7
        }
      },
      {
        id: "opt_c",
        text: "只回一句正在核实办理",
        costAp: 0,
        effects: {
          energy: -3,
          mgmt: -4,
          kpi: -5
        }
      }
    ]
  },
  {
    id: "evt_common_any_talk_with_discipline",
    title: "有人来问你两句话",
    npcName: "纪委 老康",
    unitType: "通用",
    bands: [
      "科级",
      "处级",
      "厅级",
      "省部级"
    ],
    theme: "daily",
    description: "隔壁科室的老孙被叫去谈话已经三天。今天下午来了两位同志，先聊了些家常，然后问起去年那笔费用是怎么经手的，说你经手过其中一两个环节，问你知道些什么。你确实知道一点，可话说出去，老孙一家就难了；你要是咬死不知道，将来对不上口，你自己也说不清。临走人家说，不要有思想包袱。",
    options: [
      {
        id: "opt_a",
        text: "知道的照实说",
        costAp: 1,
        effects: {
          energy: -8,
          popularity: -12,
          authority: 4,
          risk: -10
        }
      },
      {
        id: "opt_b",
        text: "说记不清，含糊过去",
        costAp: 1,
        effects: {
          energy: -6,
          popularity: 4,
          authority: -5,
          risk: 10
        }
      },
      {
        id: "opt_c",
        text: "问什么答什么，不多说",
        costAp: 0,
        effects: {
          energy: -5,
          popularity: -3,
          mgmt: -3,
          authority: -2
        }
      }
    ]
  }
]
