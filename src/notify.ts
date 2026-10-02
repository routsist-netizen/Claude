/**
 * In-app reminders using the browser Notification API. Timers live as long
 * as the tab is open; the .ics export is the reliable option for a phone.
 */
let timers: number[] = []
let armedKey: string | null = null

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export function armReminders(key: string, items: { at: Date; title: string; body?: string }[]): number {
  clearReminders()
  const now = Date.now()
  for (const item of items) {
    const delay = item.at.getTime() - now
    // setTimeout overflows past ~24.8 days; nobody plans a bake that far ahead.
    if (delay <= 0 || delay > 2 ** 31 - 1) continue
    timers.push(
      window.setTimeout(() => {
        try {
          new Notification(item.title, { body: item.body, icon: '/favicon.svg', tag: `${key}-${item.at.getTime()}` })
        } catch {
          /* some mobile browsers only allow notifications from a service worker */
        }
      }, delay),
    )
  }
  armedKey = timers.length ? key : null
  return timers.length
}

export function clearReminders(): void {
  timers.forEach((id) => clearTimeout(id))
  timers = []
  armedKey = null
}

export function armedFor(): string | null {
  return armedKey
}
