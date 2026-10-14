<script setup lang="ts">
import { shallowRef } from 'vue'
import { ElMessage, type UploadFile } from 'element-plus'
import { Icon } from '@iconify/vue'
import { api } from '../../api'
import { showError } from '../../ui'

const emit = defineEmits<{ migrated: [] }>()
const busy = shallowRef(false)
const inWeChat = /MicroMessenger/i.test(navigator.userAgent)

async function exportData() {
  busy.value = true
  try {
    const data = await api.exportMigration()
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `question-bank-${data.sourceId}-${new Date().toISOString().slice(0, 10)}.json`
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    ElMessage.success('数据已导出，请妥善保存文件')
  } catch (error) {
    showError((error as Error).message)
  } finally {
    busy.value = false
  }
}

async function importFile(file: UploadFile) {
  if (!file.raw) return
  busy.value = true
  try {
    const data: unknown = JSON.parse(await file.raw.text())
    const result = await api.importMigration(data)
    ElMessage.success(result.attempts || result.wrongQuestions
      ? `迁移完成：新增 ${result.attempts} 条记录、${result.wrongQuestions} 道错题`
      : '没有可新增的数据，原有数据未改变')
    emit('migrated')
  } catch (error) {
    showError(error instanceof SyntaxError ? '文件不是有效的 JSON 格式' : (error as Error).message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="migration-panel">
    <div class="migration-title"><Icon icon="mdi:file-transfer-outline" /><strong>离线迁移</strong></div>
    <p>导出本设备的全部历史记录与错题，再在另一台设备选择该 JSON 文件导入。</p>
    <p class="migration-notice">微信内打开的网页无法使用离线迁移：微信会阻止第三方网页上传和下载文件。请用系统浏览器打开，或使用在线迁移功能。</p>
    <div class="migration-actions">
      <el-button :loading="busy" :disabled="inWeChat" @click="exportData">导出数据</el-button>
      <el-upload :auto-upload="false" :show-file-list="false" accept=".json,application/json" :disabled="busy || inWeChat" :on-change="importFile">
        <el-button type="primary" plain :loading="busy" :disabled="inWeChat">选择文件导入</el-button>
      </el-upload>
    </div>
  </div>
</template>

<style scoped>
.migration-panel { padding: 18px; border: 1px solid #eef0f5; border-radius: 18px; background: #fff; }
.migration-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; }
.migration-title svg { width: 21px; height: 21px; color: #527bf6; }
.migration-panel p { margin: 0 0 12px; color: #8190a8; font-size: 12px; line-height: 1.7; }
.migration-panel .migration-notice { padding: 10px 12px; border-radius: 10px; color: #9c6c37; background: #fff7e9; }
.migration-actions { display: flex; flex-wrap: wrap; gap: 8px; }
</style>
