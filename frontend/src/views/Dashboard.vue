<template>
  <!--
    薄壳。上任后的主界面仍然是 GameMain.vue，这里只负责把它挂到 /dashboard 上。
    不把 GameMain 直接注册进路由，是为了让考公流程与主界面各自独立，
    主界面的逻辑一行都不用为"多了一个路由"而改动。
  -->
  <GameMain />
</template>

<script>
import GameMain from '@/views/GameMain.vue'

export default {
  name: 'Dashboard',
  components: { GameMain }
}
</script>
