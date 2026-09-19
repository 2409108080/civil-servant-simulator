/**
 * 职务映射：**单位类型 + 职级 → 职务**。
 *
 * ── 为什么必须废掉"职级 → 职务" ────────────────────────────────
 * 原先职务挂在 LEVEL_LADDER 上（`typicalPosition`），一张表管到底。
 * 那套写法默认了"所有干部的仕途都是同一条线"，于是出现了玩家实测的那个笑话：
 * 分到市档案局的人升到乡科级正职，职务变成了**镇长**。
 * 档案局里不可能有镇长——这不是文案瑕疵，是模型错了：职务由"你在哪个系统的
 * 哪一级"共同决定，只给职级一个维度，永远算不出自洽的结果。
 *
 * ── 表怎么读 ──────────────────────────────────────────────
 * 四条流派（TRACKS 的四个键），每条一套八级阶梯：
 *   基层乡镇  乡镇 → 县 → 市 → 省      （属地线，职务就是属地政府的职务）
 *   核心部门  市委办 → 市委            （党委机关线）
 *   常规局委  市财政局 → 省财政厅       （业务厅局线）
 *   边缘部门  市档案局 → 省档案馆       （清水衙门线）
 *
 * ── 为什么厅局级以上四条线会合流 ─────────────────────────────
 * 到了厅局级及以上，"你原来在哪个局"不再决定职务：组织上安排的是
 * 属地党政领导职务（副市长、市长、副省长、省长）。硬要给档案局编一条
 * "省档案馆馆长→……"的独立通道，反而会造出并不存在的职级。
 * 所以 省部级副职/正职 四行完全相同，这是**有意为之**，不是漏改。
 *
 * ── 与后端的对齐 ───────────────────────────────────────────
 * backend/models.py 的 EXAM_TIERS 里也有各单位的初始职务（录用通知书上那份）。
 * 本表在乡科级副职一档上**与它逐字相同**（市委办公室综合科副科长 /
 * 市财政局预算科副科长 / 副镇长 / 市档案局业务科副科长），
 * 所以考公报到时前端算出来的职务与通知书上写的不会打架。
 * 改这里的任何一行，都要回头看 EXAM_TIERS 一眼。
 */

import { LEVEL_LADDER } from './promotion'
import { UNIT_TYPES } from './gameConfig'

/**
 * 每条流派的八级职务。值是 **(unit) => string** 而不是字符串，
 * 因为职务里要嵌单位的名字：同一个"科长"，在财政局是预算科科长，
 * 在档案局是业务科科长。写成纯字符串就只能靠查表，单位一改就串味。
 *
 * 单位名从 player.unit 取，可能带"XX镇人民政府"这种全称，
 * 所以模板一律拼在后面，不去猜简称。
 */
/**
 * 基层乡镇要再分一层：乡镇和街道办虽然同属"基层"，一把手却不叫同一个名字。
 * 「街道办事处」在 prompts.py 里归在基层乡镇，所以这条分支是真会被走到的。
 *
 * 判序必须是 街道 → 乡 → 镇：写成 indexOf('乡') 先判的话，
 * 「城乡街道办事处」会先命中"乡"，算出个"乡长"来。
 */
function grassrootsTitle(unit, kind) {
  const name = String(unit || '')
  if (name.indexOf('街道') >= 0) return kind === '正' ? '主任' : '副主任'
  if (name.indexOf('乡') >= 0) return kind === '正' ? '乡长' : '副乡长'
  return kind === '正' ? '镇长' : '副镇长'
}

const TRACKS = {
  基层乡镇: {
    ladder: {
      乡科级副职: (u) => grassrootsTitle(u, '副'),
      乡科级正职: (u) => grassrootsTitle(u, '正'),
      县处级副职: () => '副县长',
      县处级正职: () => '县长',
      厅局级副职: () => '副市长',
      厅局级正职: () => '市长',
      省部级副职: () => '副省长',
      省部级正职: () => '省长'
    }
  },

  核心部门: {
    ladder: {
      乡科级副职: (u) => `${u}综合科副科长`,
      乡科级正职: (u) => `${u}综合科科长`,
      县处级副职: (u) => `${u}副主任`,
      县处级正职: (u) => `${u}主任`,
      厅局级副职: () => '市委副秘书长',
      厅局级正职: () => '市委秘书长',
      省部级副职: () => '副省长',
      省部级正职: () => '省长'
    }
  },

  常规局委: {
    ladder: {
      乡科级副职: (u) => `${u}预算科副科长`,
      乡科级正职: (u) => `${u}预算科科长`,
      县处级副职: (u) => `${u}副局长`,
      县处级正职: (u) => `${u}局长`,
      厅局级副职: () => '省财政厅副厅长',
      厅局级正职: () => '省财政厅厅长',
      省部级副职: () => '副省长',
      省部级正职: () => '省长'
    }
  },

  边缘部门: {
    ladder: {
      乡科级副职: (u) => `${u}业务科副科长`,
      乡科级正职: (u) => `${u}业务科科长`,
      县处级副职: (u) => `${u}副局长`,
      县处级正职: (u) => `${u}局长`,
      厅局级副职: () => '省档案馆副馆长',
      厅局级正职: () => '省档案馆馆长',
      省部级副职: () => '副省长',
      省部级正职: () => '省长'
    }
  }
}

/**
 * 单位随职级上行的那一列：**升到这一级时，人已经不在原来那个衙门了**。
 *
 * ── 它补的是哪一半 ──────────────────────────────────────────
 * 上面那张职务表解决的是"职务不能瞎配"（市档案局里没有镇长），
 * 但职务换了、**单位没换**，于是出现了另一半笑话：职务写着「省长」，
 * 单位还挂着「市档案局」——玩家一局跑到底，最后看见的是"省长在档案局上班"。
 * 单位名不是装饰：它在人物卡上、在给每一条事件做背景的自述里。
 *
 * ── 为什么只写"会变"的那几级 ────────────────────────────────
 * 科级、处级（以及核心部门的处级）的职务模板**自带单位名**
 * （`${u}预算科科长`），单位本来就该是原样，没有第二处要写。
 * 到了上面几级，职务模板不再嵌单位（副县长、市委秘书长、省档案馆馆长），
 * 单位就必须自己跟上去。
 * 所以这张表只列**需要改写单位**的那几格，其余返回 ''（见 organFor），
 * 而不是把八级全铺一遍——铺满的话，`乡科级正职: '市财政局'` 这种"不变"
 * 的行也要有人记得它是故意的，改动一处真实变化时反而看不见。
 *
 * ── 为什么是通用名，不是带地名的全称 ────────────────────────
 * 前端不知道玩家在哪个市、哪个县（考公时只写「XX镇人民政府」）。
 * 硬要把 'XX镇人民政府' 拆出个县名来拼'XX县人民政府'，是在猜；
 * 猜错的表现是通报里出现一个不存在的地名。'县人民政府' 这种通用称谓
 * 现实里也这么说（"调任县政府"），够用。
 *
 * ── 厅局级以上四条线为什么会写出同一个值 ────────────────────
 * 与职务表同理（见文件头）：省部级只安排属地党政领导职务，
 * 四行相同是**有意为之**。而厅局级那一格，业务局委与清水衙门
 * 各自升级到本系统的省级单位（市财政局→省财政厅），
 * 与它们的职务（省财政厅厅长、省档案馆馆长）对得上。
 */
const ORGANS = {
  基层乡镇: {
    县处级副职: '县人民政府',
    县处级正职: '县人民政府',
    厅局级副职: '市人民政府',
    厅局级正职: '市人民政府',
    省部级副职: '省人民政府',
    省部级正职: '省人民政府'
  },
  核心部门: {
    厅局级副职: '市委',
    厅局级正职: '市委',
    省部级副职: '省人民政府',
    省部级正职: '省人民政府'
  },
  常规局委: {
    厅局级副职: '省财政厅',
    厅局级正职: '省财政厅',
    省部级副职: '省人民政府',
    省部级正职: '省人民政府'
  },
  边缘部门: {
    厅局级副职: '省档案馆',
    厅局级正职: '省档案馆',
    省部级副职: '省人民政府',
    省部级正职: '省人民政府'
  }
}

/** 单位名兜底。取不到名字时用它顶位，总比拼出"undefined综合科科长"强 */
const FALLBACK_ORGAN = '本单位'

/** 职级不认识（数据异常）时的兜底，退回老表的值 */
function legacyFallback(level) {
  const entry = LEVEL_LADDER.find((item) => item.level === level)
  return (entry && entry.typicalPosition) || ''
}

/**
 * 取职务。**这是全流程唯一的职务来源**：提任、遴选、读档修复都调它。
 *
 * @param {string} unit     单位全称，如 '市财政局'
 * @param {string} unitType UNIT_TYPES 之一
 * @param {string} level    职级
 * @returns {string} 职务；两个维度任一不认识时返回 ''（调用方自己决定怎么兜）
 */
export function positionFor(unit, unitType, level) {
  const track = TRACKS[unitType]
  if (!track) return legacyFallback(level)

  const cell = track.ladder[level]
  // 阶梯顶点那一行在 promotion.js 里是占位（门槛全 0），本表没有它，
  // 到了顶点的人仍该保留当前职务，所以返回 ''，由调用方保持原值
  if (typeof cell !== 'function') return ''

  const organ = String(unit || '').trim() || FALLBACK_ORGAN
  return cell(organ)
}

/**
 * 升到这一级之后，人在哪个单位。**与 positionFor 成对使用**：
 * 只换职务不换单位，就会写出"省长在档案局上班"。
 *
 * @returns {string} 新的单位名；'' 表示这一级不该动单位（原样保留）
 */
export function organFor(unitType, level) {
  const row = ORGANS[unitType]
  if (!row) return ''
  return row[level] || ''
}

/**
 * 这个职务是不是 (单位, 职级) 该有的样子。
 *
 * 读档时用它做一次修复：1.4.0 之前升上来的存档里可能存着"市档案局的镇长"，
 * 那不是玩家做过什么，是旧模型的错，不该逼玩家重开一局来消除它。
 * 只认得出才修——两个维度任一不认识就返回 true（放着不动），
 * 免得把来历不明但未必错的职务改坏。
 */
export function isPositionConsistent(unit, unitType, level, position) {
  const expected = positionFor(unit, unitType, level)
  if (!expected) return true
  return String(position || '') === expected
}

/** 四条流派的键，供界面/调试列举 */
export const TRACK_NAMES = Object.keys(TRACKS)

// 自检：四条流派的阶梯必须覆盖同一个职级集合，缺一格就会出现
// "某单位升到某级时职务算不出来"——而且只在玩家真的升到那一级时才暴露。
if (process.env.NODE_ENV !== 'production') {
  const missing = []
  TRACK_NAMES.forEach((name) => {
    LEVEL_LADDER.forEach((item) => {
      if (item.level === LEVEL_LADDER[LEVEL_LADDER.length - 1].level) return
      const cell = TRACKS[name].ladder[item.level]
      if (typeof cell !== 'function') missing.push(`${name}·${item.level}`)
    })
  })
  if (missing.length) {
    console.error(`[职务表] 以下格子缺配置，升到该级时职务会算空：\n${missing.join('\n')}`)
  }
  const unknown = TRACK_NAMES.filter((name) => !UNIT_TYPES.includes(name))
  if (unknown.length) {
    console.error(`[职务表] 流派名不在 UNIT_TYPES 里：${unknown.join('、')}`)
  }

  // 单位表的两条自检。写错一格的后果都不是报错，而是某一级上
  // 单位的名字突然跳回原样（玩家看到的是"省长又在档案局了"），
  // 只在有人真的升到那一级时才暴露——所以在这里先算一遍。
  const organProblems = []
  Object.keys(ORGANS).forEach((name) => {
    if (!TRACK_NAMES.includes(name)) {
      organProblems.push(`单位表里的流派「${name}」不在职务表里`)
      return
    }
    Object.keys(ORGANS[name]).forEach((level) => {
      if (!LEVEL_LADDER.some((item) => item.level === level)) {
        organProblems.push(`${name}·${level}：不是职级阶梯上的一级，这一格永远不会生效`)
      }
    })
  })
  // 顶点那一级**必须**有单位：那是"到顶即退休"的结算点，
  // 缺了这一格，一局跑到底的人物卡上就是一个省长挂着原单位。
  TRACK_NAMES.forEach((name) => {
    const top = LEVEL_LADDER[LEVEL_LADDER.length - 1].level
    if (!ORGANS[name] || !ORGANS[name][top]) {
      organProblems.push(`${name}·${top}：顶点缺单位配置，登顶时单位不会跟着升级`)
    }
  })
  if (organProblems.length) {
    console.error(`[职务表] 单位表有以下问题：\n${organProblems.join('\n')}`)
  }
}
