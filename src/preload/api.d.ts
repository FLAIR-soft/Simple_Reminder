import type { ReminderApi } from '../shared/api'

declare global {
  interface Window {
    reminder: ReminderApi
  }
}

export {}
