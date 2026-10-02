import { gramDigits } from '../domain/recipe'
import { el, type Messages } from './el'

/**
 * The active dictionary. Only Greek exists today; adding a language means
 * adding a file next to el.ts and choosing it here (e.g. from a setting).
 */
const messages: Messages = el

export function useT(): Messages {
  return messages
}

export const t = messages

const nf = new Map<number, Intl.NumberFormat>()
export function num(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '–'
  let f = nf.get(digits)
  if (!f) {
    f = new Intl.NumberFormat(messages.locale, { minimumFractionDigits: 0, maximumFractionDigits: digits })
    nf.set(digits, f)
  }
  return f.format(n)
}

export function grams(n: number): string {
  return num(n, gramDigits(n))
}

/** Parse a number typed with either a decimal comma or point. */
export function parseNum(s: string): number {
  const cleaned = s.replace(/\s/g, '').replace(',', '.')
  return cleaned === '' ? Number.NaN : Number(cleaned)
}

export function duration(minutes: number): string {
  const m = Math.round(minutes)
  return messages.units.hm(Math.floor(m / 60), m % 60)
}

const timeFmt = () => new Intl.DateTimeFormat(messages.locale, { hour: '2-digit', minute: '2-digit', hour12: false })
const dayFmt = () => new Intl.DateTimeFormat(messages.locale, { weekday: 'long', day: 'numeric', month: 'short' })
const dateFmt = () => new Intl.DateTimeFormat(messages.locale, { day: 'numeric', month: 'short', year: 'numeric' })

export const time = (d: Date) => timeFmt().format(d)
export const day = (d: Date) => dayFmt().format(d)
export const date = (d: Date) => dateFmt().format(d)

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** "Σήμερα", "Αύριο", or the weekday and date. */
export function relativeDay(d: Date, now = new Date()): string {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400_000)
  if (diff === 0) return messages.schedule.today
  if (diff === 1) return messages.schedule.tomorrow
  if (diff === -1) return messages.schedule.yesterday
  return day(d)
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fromLocalInput(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}
