import type { ScheduledAction } from './schedule'

/**
 * Minimal RFC 5545 (iCalendar) writer: one event per action, each with a
 * reminder at its start time. Imports into Google Calendar, Apple Calendar
 * and Outlook.
 */

export interface IcsEvent {
  uid: string
  start: Date
  minutes: number
  summary: string
  description?: string
}

const pad = (n: number) => String(n).padStart(2, '0')

export function icsDate(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  )
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`)
}

/** Fold lines longer than 75 octets (UTF-8), without splitting a character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let bytes = 0
  for (const ch of line) {
    const size = enc.encode(ch).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += ch
    bytes += size
  }
  parts.push(current)
  return parts.join('\r\n ')
}

export function toIcs(events: IcsEvent[], calendarName: string, now = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Prozymi//Bake schedule//EL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(new Date(e.start.getTime() + Math.max(5, e.minutes) * 60_000))}`,
      `SUMMARY:${escapeText(e.summary)}`,
    )
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`)
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(e.summary)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

/** Turn schedule actions into calendar events. `label` supplies the (translated) title. */
export function actionsToEvents(
  actions: ScheduledAction[],
  label: (a: ScheduledAction) => string,
  idPrefix: string,
): IcsEvent[] {
  return actions.map((a, i) => ({
    uid: `${idPrefix}-${i}-${a.kind}@prozymi`,
    start: a.at,
    minutes: 10,
    summary: label(a),
  }))
}
