/**
 * 路由。
 *
 * 用 hash 模式而非 history：本项目最终是一份静态 dist，
 * history 模式需要部署层配 try_files 回退到 index.html，否则刷新就 404。
 * hash 模式在 file:// 与任意静态服务器上都能直接跑。
 *
 * 流程：/ 报到 → /exam 考公 → /dashboard 上任
 */

import Vue from 'vue'
import VueRouter from 'vue-router'

import Profile from '@/views/Profile.vue'
import Exam from '@/views/Exam.vue'
import Dashboard from '@/views/Dashboard.vue'

Vue.use(VueRouter)

const routes = [
  { path: '/', name: 'profile', component: Profile },
  { path: '/exam', name: 'exam', component: Exam },
  { path: '/dashboard', name: 'dashboard', component: Dashboard },
  { path: '*', redirect: '/' }
]

export default new VueRouter({
  mode: 'hash',
  routes
})
