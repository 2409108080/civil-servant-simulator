<template>
  <div class="profile-page gov-paper-bg">
    <el-card class="gov-card gov-card--primary profile-card" shadow="never">
      <!-- 水印：泛黄档案纸的底纹。仅装饰，必须 pointer-events:none -->
      <div class="watermark">内部人事档案</div>

      <div class="head">
        <div class="title">干部录用登记表</div>
        <div class="sub">请填写姓名，该信息将录入人事档案，作为分配岗位的依据。</div>
      </div>

      <el-form @submit.native.prevent>
        <el-form-item label="姓名">
          <el-input
            v-model="name"
            maxlength="20"
            placeholder="请输入姓名，接受组织初步审查"
            @keyup.enter.native="onSubmit"
          />
        </el-form-item>
      </el-form>

      <el-button class="gov-btn gov-btn--block" :loading="submitting" @click="onSubmit">
        {{ submitting ? '正在将档案提交组织部…' : '提交档案，接受组织考核' }}
      </el-button>

      <!-- 已有档案时给一条退路，避免误点报名把人清空 -->
      <div v-if="existingName" class="resume">
        <span>检测到已有档案：{{ existingName }}</span>
        <el-button type="text" @click="onResume">继续上一局</el-button>
      </div>
    </el-card>
  </div>
</template>

<script>
import gameState from '@/mixins/gameState'
import { toast } from '@/utils/notice'

export default {
  name: 'Profile',

  mixins: [gameState],

  data() {
    return {
      name: '',
      submitting: false,
      existingName: ''
    }
  },

  created() {
    // 读档由 mixin 的 created 完成，这里只取姓名用于回填与"继续"入口
    if (this.player.name) {
      this.name = this.player.name
      this.existingName = this.player.name
    }
  },

  methods: {
    onSubmit() {
      const trimmed = (this.name || '').trim()
      if (!trimmed) {
        toast(this, { type: 'warning', message: '请先填写姓名。' })
        return
      }

      this.submitting = true

      // 报名即新开一局：清掉旧档案，避免上一局的单位与成绩串到本局
      this.resetGame()
      this.player.name = trimmed
      this.saveGame()

      // ↓↓↓ 本次唯一改动逻辑的两处：跳转延后 500ms，且不再把 loading 置回 ↓↓↓
      // 上面三步全是同步的，不延后的话 loading 只闪一帧，等于没有。
      // 跳转目标、清档与存档的顺序均未改动。
      setTimeout(() => {
        this.$router.push('/exam')
      }, 500)
      // 此处刻意不把 submitting 置回 false：跳转后本组件即销毁，
      // 置回反而会让按钮在跳转前那一瞬恢复成可点状态，能连点两次。
    },

    onResume() {
      this.$router.push('/dashboard')
    }
  }
}
</script>

<style scoped>
/* 色值来自 styles/theme.css，组件形态（卡片、红按钮、输入框）来自
   styles/element-override.css。这里只保留本页独有的：
   水印、标题排版、进页动画、继续上一局。 */

.profile-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.profile-card {
  position: relative;
  width: 420px;
  /* 进页面时向上淡入。页面级的动效不进主题文件——
     全局挂动画的话，Dashboard 上每张卡片都会跟着飘一下。 */
  animation: card-rise 0.45s cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes card-rise {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 动作敏感的玩家请系统设置里关掉动效，这里尊重该设置 */
@media (prefers-reduced-motion: reduce) {
  .profile-card {
    animation: none;
  }
}

.profile-card >>> .el-card__body {
  position: relative;
  padding: 34px 34px 28px;
  overflow: hidden;
}

/* 水印。
   z-index:-1 是刻意的：定位元素默认盖在正文之上，取负值才会沉到内容背后。
   它只能沉到最近的一个层叠上下文，也就是 .profile-card——
   而 .el-card__body 自己没有背景色，所以水印仍浮在卡片的纸色之上、正文之下。
   日后若给 card__body 加了 background，水印会被它盖住，届时改用 z-index:0 + 正文包裹层。 */
.watermark {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) rotate(-18deg);
  z-index: -1;
  font-family: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
  font-size: 34px;
  letter-spacing: 6px;
  white-space: nowrap;
  color: var(--gov-red);
  /* 0.06 是普通办公显示器上"看得见但不抢正文"的平衡点。
     低于 0.05 在低对比度屏上基本糊没，高于 0.08 就开始干扰读字了。 */
  opacity: 0.06;
  pointer-events: none;
  user-select: none;
}

.head {
  margin-bottom: 24px;
}

.title {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--gov-red);
}

.sub {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-sub);
}

.resume {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px dashed var(--line-warm);
  font-size: 12px;
  color: var(--ink-sub);
}

/* "继续上一局"是个纯文字按钮。红色由 element-override.css 统一给，
   本页只加下划线——它在整屏里是唯一的文字链接，需要一点"可以点"的暗示。 */
.resume >>> .el-button--text:hover {
  text-decoration: underline;
}

/* ───────────────────────── 窄屏（手机） ─────────────────────────
   断点 768px。桌面端一行不动。 */
@media (max-width: 768px) {
  /* 与考试页同理：卡片是 420px 死宽，窄屏改成满宽 + 上限。
     这里的上限永远够不着，等于只对手机生效。 */
  .profile-card {
    width: 100%;
    max-width: 420px;
  }

  /* align-items 从 center 改 flex-start：软键盘弹起时可视区只剩一半，
     center 会把标题推到屏幕上方之外。 */
  .profile-page {
    align-items: flex-start;
    padding: 10vh 12px 32px;
    box-sizing: border-box;
  }

  .profile-card >>> .el-card__body {
    padding: 26px 20px 22px;
  }

  .title {
    font-size: 19px;
    letter-spacing: 1px;
  }

  .sub {
    font-size: 12px;
  }

  /* 水印字号跟着卡片一起收，否则"内部人事档案"六个字会撑出卡片边界 */
  .watermark {
    font-size: 26px;
    letter-spacing: 4px;
  }

  /* 姓名输入框：16px 是 iOS Safari 的**硬线**——
     小于 16px 的输入框获得焦点时，Safari 会自动把整页放大，
     而 viewport 里锁了 user-scalable=no，玩家放大了却缩不回去。 */
  .profile-card >>> .el-input__inner {
    font-size: 16px;
    height: 44px;
    line-height: 44px;
  }

  .profile-card >>> .el-button.gov-btn--block {
    min-height: 44px;
  }

  .resume {
    flex-wrap: wrap;
    gap: 6px;
  }
}
</style>
