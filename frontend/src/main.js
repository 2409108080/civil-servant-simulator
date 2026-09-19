import Vue from 'vue'
import ElementUI from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'

// 顺序不能动，两条都是硬要求：
//   theme.css 定义设计令牌，排在 element-ui 之后才能盖住它的 :root；
//   element-override.css 是令牌的消费者，必须排在最后，
//   否则它那些同特异性的 .el-* 覆写会被 Element 的默认配色反盖回去。
import './styles/theme.css'
import './styles/element-override.css'

import App from './App.vue'
import router from './router'

Vue.use(ElementUI, { size: 'small' })
Vue.config.productionTip = false

new Vue({
  router,
  render: (h) => h(App)
}).$mount('#app')
