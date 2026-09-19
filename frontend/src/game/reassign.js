/**
 * 组织调离（大额进账的当场后果）。
 *
 * ── 它解决的是什么问题 ──────────────────────────────────────
 * 在这之前，"第一次伸手"唯一的后果是下一次财产申报时的立案审查，
 * 而申报每 5 个季度一次。实测下来这中间隔着 1~2 次新的诱惑，
 * 于是"见钱就收"的玩家 90% 以上会伸第二次手——不是他胆子大，
 * 是**任何后果都赶不上第二次诱惑**。再伸手在这个模型里不是心理变量，是排期变量。
 *
 * 调离把后果提到了**当场**：一笔超过 50 万的钱进来，组织部当天就找你谈话。
 * 它不算纪委立案（那是另一条线，看的是账面差额），它是组织处理——
 * 现实里也确实是两条线：**大额资金异动先惊动的是组织部，不是纪委。**
 *
 * ── 为什么是确定性的，不是掷骰子 ──────────────────────────────
 * 概率学能凑出目标数字，但凑出来的东西玩家感觉不到。调动是**确定的**：
 * 单笔过线，一定调走。玩家第一次看到那纸通报，就知道那条路堵死了。
 * 恐惧要有形状，才算恐惧。
 *
 * ── 调走之后玩家还剩什么 ────────────────────────────────────
 * 边缘部门是清水衙门：`unitType` 一改，原来那批工程队、老板的专属事件
 * 就再也抽不到了（抽取链按 unitType 匹配，见 eventPool.buildChain）。
 * 于是大额贪腐路径被掐断，玩家只剩两条路：
 *   · 在边缘部门收小钱——慢，但安全；
 *   · 或者继续大贪——那就要顶着双开的风险，因为钱还在账上，
 *     下一次申报照样看得见差额。
 * 这正是设计想要的：**不是禁止你贪，是让你为继续贪付出可见的代价。**
 */

import { organFor, positionFor } from '@/constants/positions'

/** 触发线：单笔非法所得**超过**（严格大于）50 万 */
export const REASSIGN_THRESHOLD = 500000

/**
 * 发配的去处。用固定值而不是随机挑：
 * 触发是确定的，去处也该是确定的——玩家第二次看到"市档案局"时，
 * 应该立刻明白自己又走到了哪一步，而不是猜这次会去哪。
 */
export const REASSIGN_UNIT = '市档案局'
export const REASSIGN_UNIT_TYPE = '边缘部门'

/** 向上管理的损失。组织上已经注意到你了，这条线短期内不好走了 */
export const REASSIGN_MGMT_PENALTY = 10

/** 这笔钱够不够让组织部动你 */
export function shouldReassign(amount) {
  return (Number(amount) || 0) > REASSIGN_THRESHOLD
}

/**
 * 执行调离。改 unitType / unit / position 三样，扣向上管理。
 *
 * 已经是边缘部门的（遴选失败被发配过的、或者本来就是清水衙门的）：
 * **照样扣分、照样通报**，只是单位名不再变。
 * 直接 return 会让"大额进账"这件事在某些人身上完全没后果——
 * 而那恰恰是最容易被刷的路子。
 *
 * @returns {{message: string, notice: string, profile: Object|null}}
 */
export function reassign(state) {
  const player = state.player
  const from = { unit: player.unit, unitType: player.unitType, position: player.position }
  const alreadyEdge = player.unitType === REASSIGN_UNIT_TYPE

  player.unitType = REASSIGN_UNIT_TYPE
  // 去处按**职级**取：科级处级发配到市档案局，厅局级以上是省档案馆
  // ——职务（省档案馆副馆长）与单位必须是同一个地方，否则又是
  // "馆长在档案局上班"（见 constants/positions.js 的 ORGANS）。
  player.unit = organFor(REASSIGN_UNIT_TYPE, player.level) || REASSIGN_UNIT
  const next = positionFor(player.unit, REASSIGN_UNIT_TYPE, player.level)
  // 阶梯顶点的职级 positionFor 会返回 ''（见 positions.positionFor），
  // 那种情况保留原职务，不要把人改成空字符串
  if (next) player.position = next

  return {
    message: alreadyEdge
      ? '组织部还是找你谈了话：钱的事他们没提，但你的岗位不会再动了。'
      : `调令当天下午就下来了。你不再担任原职务，另有任用。`,
    notice: '因频繁涉及大额资金异动，已被调离核心岗位。',
    profile: {
      from,
      to: { unit: player.unit, unitType: player.unitType, position: player.position },
      reassigned: true
    }
  }
}
