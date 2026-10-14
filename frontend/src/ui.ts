import { defineComponent, h } from 'vue'
import { Icon } from '@iconify/vue'
import { ElMessage } from 'element-plus'

const ErrorIcon = defineComponent({
  name: 'ErrorIcon',
  setup: () => () => h(Icon, { icon: 'mdi:alert-circle-outline' }),
})

export function showError(message: string) {
  ElMessage({ message, type: 'error', icon: ErrorIcon })
}
