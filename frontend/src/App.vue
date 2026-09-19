<template>
  <div id="app">
    <!--
      App 只做壳，具体页面交给路由：
      /          报到登记
      /exam      录用考试
      /dashboard 上任后的主界面（即原来的 GameMain）

      存档异常弹窗不放在这里：它需要读写游戏状态并调用 resetGame()，
      若此处再挂一次 gameState mixin，就会产生第二份互相独立的 $data，
      导致"重新开始"清的不是 GameMain 的那份状态。状态只能有一个归属。
      同理，路由每切换一次都会新建目标组件，mixin 的 $data 也就随之重建——
      存档是 localStorage 里的那份，不是内存里的那份。
    -->
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App'
}
</script>

<style>
/* 这里**不写 font-family**。
   字体是 styles/element-override.css 的事：本组件的全局样式在打包后
   排在它后面，两边都写的话，谁生效取决于 webpack 拼 CSS 的顺序——
   而那个顺序是构建细节，不该决定游戏是宋体还是黑体。
   全局字体只能有一个来源。 */
html,
body {
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}
</style>
