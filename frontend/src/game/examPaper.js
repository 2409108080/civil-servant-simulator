/**
 * 考务：组卷、判档、算分、分配。**全部在浏览器里跑，不发任何请求。**
 *
 * ── 这一份是怎么来的 ─────────────────────────────────────────
 * 1.0.0 封盘时从后端原样搬过来的：backend/services/exam.py 的组卷/判档/算分/
 * 分配，加 backend/services/question_bank.py 的题库加载与反查，加
 * backend/models.py 里的那几组常量。命题与阅卷本来就不调 AI 了，整条链子
 * 只有纯计算，搬进前端之后**删掉了整条网络通路**——不再有 fetch、不再有
 * 超时、不再有冷启动。发出去的成品是一个静态站，谁点开都能考。
 *
 * 后端那份（backend/）留着当本地开发工具，不动，两边各自可跑。
 * 代价是同一套规则有了两份实现，所以有一支探针（probe_exam_local.mjs）
 * 拿着同一张固定卷子，把 4^5 = 1024 种作答在 Python 与 JS 里各判一遍，
 * 逐项比对等级、分数、单位、评语。规则改动只要漏了一边，那支探针会红。
 *
 * ── 与后端那份**故意**不一致的两处 ──────────────────────────
 * ① **不内置兜底题库。** 后端从磁盘读 questions.json，"文件被删/读坏"是
 *    真实存在的运行时故障，且空题库等于开不了考（新玩家卡在第一关），
 *    所以它必须兜住，退化成 prompts.FALLBACK_EXAM_QUESTIONS 的 5 道题。
 *    前端这份是 import 进来的，**构建时就已经在包里了**，没有"读不到"这条
 *    路径；真走到"题库为空"，只可能是题库文件本身被改坏了——那是部署坏了，
 *    不是玩家的错。这时候再塞一张通用卷子给他，等于把部署故障伪装成正常游戏。
 *    所以这里**抛错**，让 Exam.vue 亮错误页，坏在明处。
 * ② 没有 ExamEvaluateRequest 那层 pydantic 校验。后端那层是 HTTP 契约的
 *    守门人（extra="forbid"，防脏请求），本地调用没有请求可防。但脏作答的
 *    **降级**保留了下来：选项对不上试卷就按未作答处理，与后端第二道防线同款。
 */

import BANK from '@/mock/questions.json'

// ══════════════════════════════════════════════════════════════════
// 考卷常量（原 models.py）
// ══════════════════════════════════════════════════════════════════

/** 题型：logic 行测逻辑 / eq 职场情商 / field 基层突发对策 */
export const EXAM_TYPES = ['logic', 'eq', 'field']

export const EXAM_TYPE_LABELS = {
  logic: '行测逻辑',
  eq: '职场情商',
  field: '基层对策'
}

/**
 * 题型配比与单题分值（策划案定稿，改这里就是改考卷）。
 *
 * 5 道题 × 20 分 = 100 分，**满分即全对**。所以伯乐加分退场了：
 * 它本来是为了在"基础分上限 95"的卷面上把最后那 5 分补出来，
 * 现在第 5 道题自己就把这个缺口填上了。
 *
 * 配比 2 逻辑 / 1 情商 / 2 对策，落到分项上正好是
 * 逻辑 40 / 情商 20 / 基层对策 40——成绩单上那三行就是这么来的。
 */
export const EXAM_COMPOSITION = [
  ['logic', 2, 20], // 2 题 × 20 分 = 40
  ['eq', 1, 20],    // 1 题 × 20 分 = 20
  ['field', 2, 20]  // 2 题 × 20 分 = 40
]

export const EXAM_QUESTION_COUNT = EXAM_COMPOSITION.reduce((n, [, c]) => n + c, 0) // 5
export const EXAM_BASE_MAX = EXAM_COMPOSITION.reduce((n, [, c, w]) => n + c * w, 0) // 100

/**
 * 伯乐加分上限。**故意是 0，不是漏填**（与后端同一条理由）。
 * 字段留着是契约问题：成绩单上那行按 `bonus > 0` 决定印不印，
 * 契约不动，那个分支就永远不会亮。
 */
export const EXAM_BONUS_MAX = 0
export const EXAM_MAX_SCORE = EXAM_BASE_MAX + EXAM_BONUS_MAX // 100

/**
 * 按题号展开的题型与权重。**下标即题号，题型由序号决定，不采信题库自报的 type**，
 * 否则一道题串位，后面所有题的题型与分值跟着串。
 */
export const EXAM_TYPE_BY_INDEX = EXAM_COMPOSITION.flatMap(([t, n]) => Array(n).fill(t))
export const EXAM_WEIGHT_BY_INDEX = EXAM_COMPOSITION.flatMap(([, n, w]) => Array(n).fill(w))

/** 判档 → 得分系数。只认这三档，出现别的值一律按 0 处理（safe default）。 */
export const EXAM_GRADE_FACTORS = { full: 1.0, half: 0.5, zero: 0.0 }

export const EXAM_GRADE_LABELS = { full: '满分', half: '半分', zero: '零分' }

/**
 * 分配红线（策划案定稿）。按分数从高到低匹配，第一个满足 score >= minScore 的即为结果。
 * position 是随单位走的初始职务——只改 unit 不改 position 会出现
 * 「市委办公室·副镇长」这种自相矛盾的档案。
 *
 * 三条线是 80 / 60 / 40，对着"答对几题"看就是 4 题 / 3 题 / 2 题
 * （每题 20 分，半分那道算 10 分，落在哪档按分算，不为半分单开规则）。
 */
export const EXAM_TIERS = [
  {
    minScore: 80,
    unitType: '核心部门',
    unit: '市委办公室',
    position: '市委办公室综合科副科长',
    comment: '笔试名列前茅。市委办要的就是能写、能熬、能扛的年轻人。',
    attributeBonus: { ability: 10, mgmt: 10, authority: 5 }
  },
  {
    minScore: 60,
    unitType: '常规局委',
    unit: '市财政局',
    position: '市财政局预算科副科长',
    comment: '成绩扎实。业务局委不求出彩，但求无过，正需要你这样稳当的人。',
    attributeBonus: { ability: 6, mgmt: 6, popularity: 6 }
  },
  {
    minScore: 40,
    unitType: '基层乡镇',
    unit: 'XX镇人民政府',
    position: '副镇长',
    comment: '分数中庸，但基层最缺肯干事的人。先下去摔打两年，未必是坏事。',
    attributeBonus: { popularity: 10, ability: 5, kpi: 5 }
  },
  {
    minScore: 0,
    unitType: '边缘部门',
    unit: '市档案局',
    position: '市档案局业务科副科长',
    comment: '成绩不理想。清水衙门事少人闲，倒也不失为一个养人的去处。',
    // 养生局的补偿要落在"不会被上限吃掉"的资源上：
    // 原来给的精力/健康初始值本就是上限 100，加了个寂寞。
    // 改成好人缘 + 低风险——远离权力中心，自然少是非。
    attributeBonus: { popularity: 10, risk: -10 }
  }
]

/** 选项 id 的固定顺序。与 scripts/gen_exam_bank.py 一致 */
const OPT_IDS = ['opt_a', 'opt_b', 'opt_c', 'opt_d']

/**
 * 按题型给的进补建议。挑失分率最高的那一条线来说。
 * 单题分值统一成 20 之后"更重的那条线"已经不存在了（三条线权重相同），
 * 并列时按题型在卷面上的先后取——这不是权衡，只是让结果确定下来。
 */
const WEAK_HINTS = {
  logic: '行测逻辑失分偏多。判断推理是硬功夫，回去把充分条件与必要条件再过一遍。',
  eq: '职场情商那几道答得太直。机关里的话，有时候得拐个弯说。',
  field: '基层对策题欠火候。这一类事下去之后会天天找上门，现在补还来得及。'
}

// ══════════════════════════════════════════════════════════════════
// 题库：加载、校验、抽样、按题干反查
// ══════════════════════════════════════════════════════════════════

/**
 * 题干归一化：抹掉全部空白。题库与作答两边的换行、空格习惯不稳定，
 * 比对前先抹平。
 */
export function normalizeStem(text) {
  return String(text || '').split(/\s+/).join('')
}

/**
 * 逐条校验。返回问题列表，空数组表示合格。
 *
 * 注意"题干唯一"这条是硬要求：判档靠题干当主键反查题库（见下），
 * 两条题干撞车会让反查拿错那一条的答案键。
 */
function checkEntry(entry, seenStems) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return ['不是对象']

  const problems = []

  if (!EXAM_TYPES.includes(entry.type)) {
    problems.push(`题型非法：${JSON.stringify(entry.type)}`)
  }

  const stem = String(entry.stem || '').trim()
  if (!stem) {
    problems.push('题干为空')
  } else if (seenStems.has(normalizeStem(stem))) {
    problems.push('题干与已有题目重复')
  }

  const options = entry.options
  if (!Array.isArray(options) || options.length !== 4) {
    problems.push(`选项数应为 4，实为 ${Array.isArray(options) ? options.length : '非数组'}`)
    return problems
  }

  const ids = options.map((o) => String((o || {}).id || ''))
  if (ids.join(',') !== OPT_IDS.join(',')) {
    problems.push(`选项 id 应依次为 ${OPT_IDS.join(',')}，实为 ${ids.join(',')}`)
  }
  options.forEach((opt, idx) => {
    if (!opt || typeof opt !== 'object' || !String(opt.text || '').trim()) {
      problems.push(`第 ${idx + 1} 个选项文案为空`)
    }
  })

  const best = String(entry.best || '')
  if (!ids.includes(best)) problems.push(`best=${JSON.stringify(best)} 不在选项内`)

  let half = entry.half
  if (half === undefined || half === null) half = []
  if (!Array.isArray(half)) {
    problems.push('half 不是数组')
    half = []
  }
  if (half.includes(best)) problems.push('best 同时出现在 half 里')
  const unknown = half.filter((h) => !ids.includes(h))
  if (unknown.length) problems.push(`half 含未知选项：${unknown.join(',')}`)

  const comments = entry.optionComments
  if (comments !== undefined && comments !== null
      && (typeof comments !== 'object' || Array.isArray(comments))) {
    problems.push('optionComments 不是对象')
  }

  return problems
}

/** 裁剪成固定结构。多余字段一律丢掉——题库是脚本产出，这里只认这几项。 */
function cleanEntry(entry) {
  const comments = entry.optionComments
  const half = entry.half
  return {
    id: String(entry.id || ''),
    type: String(entry.type),
    stem: String(entry.stem).trim(),
    options: entry.options.map((o) => ({ id: String(o.id), text: String(o.text).trim() })),
    best: String(entry.best || ''),
    half: (Array.isArray(half) ? half : []).map((h) => String(h)),
    optionComments: Object.fromEntries(
      (comments && typeof comments === 'object' && !Array.isArray(comments) ? Object.entries(comments) : [])
        .map(([k, v]) => [String(k), String(v)])
        .filter(([, v]) => v.trim())
    ),
    rationale: String(entry.rationale || '').trim()
  }
}

let BANK_CACHE = null
let BY_STEM = new Map()

/**
 * 加载并校验题库。结果缓存，只跑一次；**不合格的条目逐条丢掉，不牵连整库**。
 *
 * 一条坏题不该让整场考试开不了——所以是过滤而不是全盘拒绝。但过滤到
 * 一条不剩就是另一回事了：那说明题库文件本身是坏的，抛错（理由见文件头）。
 */
export function loadBank() {
  if (BANK_CACHE) return BANK_CACHE

  const raw = Array.isArray(BANK) ? BANK : (BANK && Array.isArray(BANK.questions) ? BANK.questions : [])
  const problems = []
  if (!raw.length) problems.push('题库里没有 questions 数组')

  const entries = []
  const seenStems = new Set()
  raw.forEach((item, idx) => {
    const why = checkEntry(item, seenStems)
    if (why.length) {
      problems.push(`第 ${idx + 1} 条：${why.join('；')}`)
      return
    }
    seenStems.add(normalizeStem(item.stem))
    entries.push(cleanEntry(item))
  })

  if (!entries.length) {
    throw new Error(
      `本地题库一道合格的题都没有，考卷组不出来。${problems.slice(0, 3).join('；')}`
      + `（共 ${raw.length} 条问题，完整清单见控制台）`
    )
  }
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.warn('[题库] 以下条目不合格，已跳过：\n' + problems.join('\n'))
  }

  BANK_CACHE = entries
  BY_STEM = new Map(entries.map((e) => [normalizeStem(e.stem), e]))
  return BANK_CACHE
}

/**
 * 按题干反查题库条目。查不到返回 null（调用方退化为"对错判定"）。
 *
 * 为什么反查而不是把答案直接发给前端：组好的卷子（normalizeQuestions 的产物）
 * 结构里**没有** best 之外的判档信息，half 与 optionComments 全靠题干取回。
 * 顺带一层好处——答案键以题库为准，不采信卷子上带的那份。
 */
export function findByStem(stem) {
  loadBank()
  return BY_STEM.get(normalizeStem(stem)) || null
}

/** 从数组里不放回地取 n 个（等价 Python 的 random.sample） */
function sampleWithoutReplacement(pool, need) {
  const rest = pool.slice()
  const out = []
  for (let i = 0; i < need; i += 1) {
    const j = Math.floor(Math.random() * rest.length)
    out.push(rest[j])
    rest.splice(j, 1)
  }
  return out
}

/**
 * 按 EXAM_COMPOSITION 抽一张卷子：题型顺序与题量严格对齐权重表。
 *
 * 题型必须按 2 逻辑 / 1 情商 / 2 对策的顺序拼，因为**分值是按题号绑定的**
 * （EXAM_WEIGHT_BY_INDEX），题型一旦串位，分值就跟着串。
 */
export function samplePaper() {
  const bank = loadBank()
  const pools = {}
  for (const entry of bank) {
    if (!pools[entry.type]) pools[entry.type] = []
    pools[entry.type].push(entry)
  }

  const picked = []
  for (const [qtype, need] of EXAM_COMPOSITION) {
    let pool = pools[qtype] || []
    if (!pool.length) {
      // 后端在这里是打日志 + 返回空卷，交给上层换兜底题库；
      // 前端没有兜底题库，直接抛错（理由见文件头）。
      throw new Error(`题库里「${EXAM_TYPE_LABELS[qtype] || qtype}」一道题都没有，无法组卷`)
    }
    if (pool.length < need) {
      // 存量不够时重复取用：同一道题在一张卷子里出现两次很别扭，
      // 但比"卷子结构不合法"好得多——后者会让整卷算分崩掉。
      // 该补的是 scripts/gen_exam_bank.py 的 BANK_QUOTA，不是抽样逻辑。
      // eslint-disable-next-line no-console
      console.warn(
        `[题库] 题型 ${EXAM_TYPE_LABELS[qtype]} 只有 ${pool.length} 道，`
        + `本卷需要 ${need} 道，将重复取用`
      )
      pool = pool.concat(Array.from({ length: need - pool.length }, (_, i) => pool[i % pool.length]))
    }
    picked.push(...sampleWithoutReplacement(pool, need))
  }

  return picked
}

// ══════════════════════════════════════════════════════════════════
// 组卷
// ══════════════════════════════════════════════════════════════════

/**
 * 校验并归一化题库抽出来的题。
 *
 * 这里卡得很死——题目数量、选项数量、选项 id、best 必须落在选项内，
 * 任何一项不合格就整卷作废。理由：这套卷子的分值权重是**按题号**绑定的，
 * 少一道题就会让后面所有题的题型与分值串位，与其将错就错，不如整卷重来。
 *
 * 产出**不含** half 与 optionComments，判档时靠题干反查题库取回（见 findByStem）。
 *
 * @returns {[Array|null, string]} [题目列表 或 null, 不合格的具体原因]
 */
export function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [null, `questions 不是数组（收到 ${typeof raw}）`]
  if (raw.length !== EXAM_QUESTION_COUNT) {
    return [null, `题目数量应为 ${EXAM_QUESTION_COUNT} 道，实收 ${raw.length} 道`]
  }

  const questions = []
  for (let idx = 0; idx < raw.length; idx += 1) {
    const item = raw[idx]
    const no = idx + 1
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [null, `第 ${no} 题不是对象`]
    }

    const options = item.options
    if (!Array.isArray(options)) return [null, `第 ${no} 题缺少 options 数组`]
    if (options.length !== 4) return [null, `第 ${no} 题应为 4 个选项，实为 ${options.length} 个`]

    const normOptions = []
    for (const opt of options) {
      if (!opt || typeof opt !== 'object' || !opt.id || !opt.text) {
        return [null, `第 ${no} 题有选项缺少 id 或 text`]
      }
      normOptions.push({ id: String(opt.id), text: String(opt.text).trim() })
    }

    const ids = normOptions.map((o) => o.id)
    if (new Set(ids).size !== 4) return [null, `第 ${no} 题的选项 id 有重复：${ids.join(',')}`]

    const best = item.best
    if (!ids.includes(best)) {
      return [null, `第 ${no} 题的 best=${JSON.stringify(best)} 不在选项 ${ids.join(',')} 内`]
    }

    const stem = String(item.stem || '').trim()
    if (!stem) return [null, `第 ${no} 题题干为空`]

    questions.push({
      id: `q${idx + 1}`,                 // 题号强制重排，不信题库里的编号
      type: EXAM_TYPE_BY_INDEX[idx],     // 题型按题号覆写，与权重表对齐
      stem,
      options: normOptions,
      best,
      rationale: String(item.rationale || '').trim()
    })
  }

  return [questions, '']
}

/**
 * 抽一套 5 道题的试卷。
 *
 * @returns {{questions: Array, source: string, reason: string}}
 *          source 恒为 'bank'——题库就在包里，没有第二种来源（理由见文件头）
 */
export function generateExamPaper() {
  const [questions, why] = normalizeQuestions(samplePaper())
  if (!questions) throw new Error(`本地题库组卷结果不符合试卷结构：${why}`)
  return { questions, source: 'bank', reason: '' }
}

// ══════════════════════════════════════════════════════════════════
// 判档
// ══════════════════════════════════════════════════════════════════

/**
 * 按题库判档。返回 { grades, comments }。
 *
 * 答案键以**题库**为准，不采信卷子上那份 best——卷子在玩家手里，是可以改的。
 * 查不到题库条目时退化为"对错判定"（选中 best 即满分，否则零分）：
 * 不会虚高，也不会冤枉人。未作答一律零分。
 */
function gradePaper(questions, choiceOf) {
  const grades = {}
  const comments = {}

  for (const q of questions) {
    const chosen = choiceOf[q.id] || ''
    const entry = findByStem(q.stem)
    const best = entry ? entry.best : q.best
    const half = entry ? entry.half : []

    // 未作答直接记零分并跳过：底下那段是给"答了"的人算的
    if (!chosen) {
      grades[q.id] = 'zero'
      continue
    }

    if (chosen === best) grades[q.id] = 'full'
    else if (half.includes(chosen)) grades[q.id] = 'half'
    else grades[q.id] = 'zero'

    if (entry) {
      const comment = (entry.optionComments || {})[chosen]
      if (comment) comments[q.id] = comment
    }
  }

  return { grades, comments }
}

/**
 * 组装阅卷人评语。
 *
 * 先报三档的分布，再指出拖后腿的那条线。玩家看完这一句，
 * 应当知道自己下一步该补什么。
 */
function buildGradeComment(questions, grades) {
  const tally = { full: 0, half: 0, zero: 0 }
  const stats = new Map()

  questions.forEach((q, idx) => {
    const grade = grades[q.id]
    tally[grade] += 1
    const qtype = EXAM_TYPE_BY_INDEX[idx]
    const bucket = stats.get(qtype) || { earned: 0, total: 0 }
    bucket.earned += EXAM_GRADE_FACTORS[grade]
    bucket.total += 1
    stats.set(qtype, bucket)
  })

  // 题数不写死在这里：卷子是几道题由 EXAM_COMPOSITION 决定，
  // 评语跟着实际发下去的那张卷子说话，改了配比不会留下"十道题"这种旧话
  const lines = [`共 ${questions.length} 道题，满分 ${tally.full} 道，半分 ${tally.half} 道，`
    + `零分 ${tally.zero} 道。`]

  // 失分率最高的那条线，并列时按卷面顺序取前一条（stats 的键序即卷面顺序）。
  //
  // 后端那份在并列时还比了一次单题分值（"丢 15 分的对策题比丢 5 分的逻辑题严重"），
  // 但那是单题分值还不相等时写的：现在三条线都是 20 分，那个比较恒不成立，
  // 等价于"取前一条"。这里不抄那句死代码——但配比若改回不等权重，
  // **两边都要把这条比较加回来**，否则同一张卷子的评语会不一样。
  let weakest = null
  let worst = 1.0
  for (const [qtype, bucket] of stats) {
    const rate = bucket.earned / bucket.total
    if (rate < worst - 1e-9) {
      weakest = qtype
      worst = rate
    }
  }
  // 全对则不点评
  if (weakest && worst < 1.0) lines.push(WEAK_HINTS[weakest])

  return lines.join('')
}

// ══════════════════════════════════════════════════════════════════
// 算分与分配
// ══════════════════════════════════════════════════════════════════

/**
 * 按硬编码红线分配单位。EXAM_TIERS 已按分数从高到低排列，取第一个满足的。
 *
 * @param score 原始分，**必须带小数一起传进来，不要先取整**。
 *              红线卡的是真实分值：84.5 进不了 85 那档的核心部门。
 */
export function assignTier(score) {
  for (const tier of EXAM_TIERS) {
    if (score >= tier.minScore) return tier
  }
  return EXAM_TIERS[EXAM_TIERS.length - 1] // 不可达：最后一条红线是 0
}

/** 把等级换算成分数，并组装成绩单。得分只在这里产生。 */
function buildResult(questions, choiceOf, grades, gradeComment, comments) {
  const review = []
  const breakdown = {}
  let baseScore = 0

  questions.forEach((q, idx) => {
    const qtype = EXAM_TYPE_BY_INDEX[idx]
    const weight = EXAM_WEIGHT_BY_INDEX[idx]
    const chosen = choiceOf[q.id] || ''
    const grade = grades[q.id]
    const earned = weight * EXAM_GRADE_FACTORS[grade]
    baseScore += earned

    const bucket = breakdown[qtype] || (
      breakdown[qtype] = {
        typeLabel: EXAM_TYPE_LABELS[qtype], count: 0, fullScore: 0, earned: 0
      }
    )
    bucket.count += 1
    bucket.fullScore += weight
    bucket.earned += earned

    const textOf = Object.fromEntries(q.options.map((o) => [o.id, o.text]))
    review.push({
      questionId: q.id,
      index: idx + 1,
      typeLabel: EXAM_TYPE_LABELS[qtype],
      stem: q.stem,
      yourChoice: chosen,
      yourChoiceText: textOf[chosen] || '（未作答）',
      bestChoice: q.best,
      bestChoiceText: textOf[q.best] || '',
      grade,
      gradeLabel: EXAM_GRADE_LABELS[grade],
      weight,
      earned,
      comment: comments[q.id] || '',
      rationale: q.rationale || ''
    })
  })

  // 总分 = 卷面分（伯乐加分恒为 0，见 EXAM_BONUS_MAX），夹到 [0, 100] 兜底。
  //
  // 原始分**不取整**，原样交给 assignTier，红线按真实分值卡。
  // 后端原先写的是 int(round(...))，而 Python 的 round() 是「银行家舍入」
  // （四舍六入五取偶），实测 59.5 会被舍成 60，于是一个 59.5 分的考生
  // 被抬进了常规局委——差这半分，去的是完全不同的单位。
  // JS 的 Math.round 是"四舍五入"，不是同一套规则，这里更要小心别顺手加上。
  // 改成每题 20 分之后分数只可能是 10 的倍数，X.5 从结构上消失了；
  // 保留"不取整"这条规矩是为了它不回来。
  const score = Math.round(Math.max(0, Math.min(EXAM_MAX_SCORE, baseScore + EXAM_BONUS_MAX)) * 10) / 10
  const tier = assignTier(score)

  return {
    score,
    baseScore: Math.round(baseScore * 10) / 10,
    // 契约字段，恒为 0。前端按 result.bonus > 0 决定印不印那一行，
    // 字段撤掉会连累成绩单，所以留着（理由见 EXAM_BONUS_MAX）
    bonus: EXAM_BONUS_MAX,
    maxScore: EXAM_MAX_SCORE,
    unitType: tier.unitType,
    unit: tier.unit,
    position: tier.position,
    comment: tier.comment,
    aiComment: gradeComment,
    attributeBonus: { ...tier.attributeBonus },
    breakdown: Object.values(breakdown),
    review
  }
}

/**
 * 阅卷并出具成绩单。
 *
 * @param questions generateExamPaper() 发下去的那张卷子
 * @param answers   { [questionId]: optionId }
 * @returns {{result: Object, source: string, reason: string}}
 */
export function evaluatePaper(questions, answers) {
  const choiceOf = { ...(answers || {}) }

  // 选项对不上试卷的作答按未作答处理。后端那道防线是 pydantic 校验，
  // 本地调用没有请求可防，但降级要留着：宁可判零分，
  // 也不要拿一个不存在的选项去查题库。
  for (const q of questions) {
    if (!q.options.some((o) => o.id === choiceOf[q.id])) delete choiceOf[q.id]
  }

  const { grades, comments } = gradePaper(questions, choiceOf)
  const gradeComment = buildGradeComment(questions, grades)
  const result = buildResult(questions, choiceOf, grades, gradeComment, comments)

  return { result, source: 'bank', reason: '' }
}
