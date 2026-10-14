import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import ExamView from './views/ExamView.vue'
import HistoryView from './views/HistoryView.vue'
import RecordView from './views/RecordView.vue'
import WrongView from './views/WrongView.vue'
import QuickView from './views/QuickView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: HomeView },
    { path: '/quick', component: QuickView },
    { path: '/exam/:id', component: ExamView },
    { path: '/records', component: HistoryView },
    { path: '/records/:id', component: RecordView },
    { path: '/wrong', component: WrongView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})
