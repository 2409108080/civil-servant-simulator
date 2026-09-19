const { defineConfig } = require('@vue/cli-service')

module.exports = defineConfig({
  transpileDependencies: true,
  lintOnSave: false,
  devServer: {
    port: 8080,
    // 前端 /api/* 直接打到 FastAPI，走代理避免跨域。
    // 生产构建（npm run build）没有 devServer，需由部署层把 /api 反代到后端，
    // 或改用绝对地址并依赖后端 ALLOW_ORIGINS。
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  }
})
