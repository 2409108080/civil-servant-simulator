const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  devServer: {
    port: 8080
    // 这里原先有一条 '/api' → 127.0.0.1:8000 的代理，1.0.0 起撤掉了：
    // 考公整条链子搬进了前端（见 src/game/examPaper.js），事件本来就是本地题库，
    // **前端一个请求都不发**，代理留着只会让人以为哪里还在调后端。
    // 部署层也不用再反代任何东西——发出去的是一堆静态文件。
  }
})
