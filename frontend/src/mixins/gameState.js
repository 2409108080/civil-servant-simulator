/**
 * 游戏状态 mixin
 *
 * 组件里只需 `mixins: [gameState]`，即可获得完整的 data 结构与读档/存档/重开方法。
 * 之所以做成 mixin 而不是散在 App.vue 里，是为了后续拆子组件时状态来源唯一。
 *
 * 用法：
 *   import gameState from '@/mixins/gameState'
 *   export default { name: 'App', mixins: [gameState], ... }
 */

import { createInitialState } from '@/constants/gameConfig'
import {
  loadGame,
  saveGame,
  clearSave,
  resetGame,
  hasPendingEvent,
  LOAD_STATUS
} from '@/utils/storage'
import { dismissAll } from '@/utils/notice'

export default {
  data() {
    // 展开初始档案，player / resources / gameStatus 三个响应式根节点在此声明
    return {
      ...createInitialState(),

      // 仅存在于内存的界面态，不进存档（saveGame 走白名单），
      // 但必须在此声明，否则 Vue2 侦测不到后续变化
      loadResult: null
    }
  },

  created() {
    // 启动即读档；loadResult 留给界面判断是否弹"版本不符/存档损坏"提示
    this.loadResult = this.loadGame()
  },

  methods: {
    /** 读档。返回 { status, message, ... }，status 取值见 LOAD_STATUS */
    loadGame() {
      return loadGame(this.$data)
    },

    /** 存档。关键时刻（事件结算、季度推进、晋升）后调用 */
    saveGame() {
      return saveGame(this.$data)
    },

    /**
     * 重开。版本不符或存档损坏时，界面确认后调用。
     *
     * **顺带清空还在屏上的提示**，这一步不能省：
     * `resetGame` 换的是 $data，而 Element 的通知挂在 body 上、不在组件树里，
     * 只换数据碰不到它们。上一局的落马通报就是这么跟到新一局里的——
     * 它本该在结算画面撤掉时消失，结果一路跟到了报到页。
     *
     * 放在这里而不是各个调用点：凡是重开都得经过这个函数，
     * 靠调用方自己记得清，迟早会漏掉一条路径（`confirmRestart` 就差点漏了）。
     */
    resetGame() {
      dismissAll()
      const result = resetGame(this.$data)
      this.loadResult = result
      return result
    },

    /** 删档但不重开（例如玩家选择"暂不开始"） */
    clearSave() {
      return clearSave()
    },

    /**
     * 是否有待办事件。界面用它控制红点显示——
     * 读档后不强制弹窗，玩家主动点开，避免刷新重放事件导致属性被重复扣减。
     */
    hasPendingEvent() {
      return hasPendingEvent(this.$data)
    }

    // ── 自动存档调用时机（第二步接入游戏逻辑时补上）──
    //   1. 事件结算后：applyEventEffects() 末尾 → this.saveGame()
    //   2. 季度推进后：advanceQuarter() 末尾   → this.saveGame()
    //   3. 晋升裁定后：promote() 末尾          → this.saveGame()
  }
}

export { LOAD_STATUS }
