<script setup lang="ts">
import { shallowRef } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'
import { api, getVisitorId } from '../../api'
import { showError } from '../../ui'

const emit = defineEmits<{ migrated: [] }>()
const ownCode = shallowRef('')
const sourceCode = shallowRef('')
const busy = shallowRef(false)

async function showCode() {
  try {
    ownCode.value = await getVisitorId()
  } catch (error) {
    showError((error as Error).message)
  }
}

async function copyCode() {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(ownCode.value)
    } else {
      const input = document.createElement('textarea')
      input.value = ownCode.value
      input.style.position = 'fixed'
      input.style.opacity = '0'
      document.body.append(input)
      input.select()
      const copied = document.execCommand('copy')
      input.remove()
      if (!copied) throw new Error('复制失败')
    }
    ElMessage.success('口令已复制')
  } catch {
    showError('复制失败，请长按口令手动复制')
  }
}

async function migrate() {
  const sourceId = sourceCode.value.trim()
  if (!sourceId) {
    showError('请先输入迁移口令')
    return
  }
  busy.value = true
  try {
    const result = await api.importCode(sourceId)
    ElMessage.success(result.attempts || result.wrongQuestions
      ? `迁移完成：新增 ${result.attempts} 条记录、${result.wrongQuestions} 道错题`
      : '没有可新增的数据，原有数据未改变')
    emit('migrated')
  } catch (error) {
    showError((error as Error).message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="migration-panel">
    <div class="migration-title"><Icon icon="mdi:devices" /><strong>在线迁移</strong></div>
    <p>在旧设备获取口令，再到新设备输入该口令，即可追加旧设备的历史数据。口令可用于读取记录，请只在自己的设备间传递。</p>
    <div class="migration-row">
      <el-button @click="showCode">获取本设备口令</el-button>
      <el-button v-if="ownCode" type="primary" plain @click="copyCode">复制口令</el-button>
    </div>
    <code v-if="ownCode" class="migration-code">{{ ownCode }}</code>
    <div class="migration-row input-row">
      <el-input v-model="sourceCode" placeholder="粘贴旧设备的迁移口令" clearable aria-label="旧设备迁移口令" />
      <el-button type="primary" :loading="busy" @click="migrate">使用口令</el-button>
    </div>
  </div>
</template>

<style scoped>
.migration-panel { padding: 18px; border: 1px solid #eef0f5; border-radius: 18px; background: #fff; }
.migration-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 14px; }
.migration-title svg { width: 21px; height: 21px; color: #527bf6; }
.migration-panel p { margin: 0 0 12px; color: #8190a8; font-size: 12px; line-height: 1.7; }
.migration-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.migration-row .el-button + .el-button { margin-left: 0; }
.migration-code { display: block; margin-top: 10px; padding: 10px; border-radius: 9px; color: #42516c; background: #f5f7fc; font-size: 12px; overflow-wrap: anywhere; user-select: all; }
.input-row { margin-top: 15px; }
.input-row .el-input { flex: 1 1 180px; width: auto; }
</style>
