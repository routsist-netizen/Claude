import { useEffect, useId, useState, type ReactNode } from 'react'
import { num, parseNum, useT } from '../i18n'
import { findFlourKind } from '../domain/flours'
import type { FlourPart } from '../domain/types'
import { Icon } from './Icon'

interface NumberFieldProps {
  label?: ReactNode
  value: number
  onChange: (n: number) => void
  unit?: string
  step?: number
  min?: number
  max?: number
  digits?: number
  help?: ReactNode
  id?: string
  invalid?: boolean
}

/**
 * Big −/+ stepper around a number input. Accepts a decimal comma or point,
 * and keeps whatever the user is typing (e.g. "2,") until it's a number.
 */
export function NumberField({
  label,
  value,
  onChange,
  unit,
  step = 1,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  digits = 1,
  help,
  id,
  invalid,
}: NumberFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const [text, setText] = useState(() => (Number.isFinite(value) ? num(value, digits).replace(/\./g, '') : ''))

  // Follow outside changes (e.g. a suggestion was applied) unless they match what's typed.
  useEffect(() => {
    if (parseNum(text) !== value) setText(Number.isFinite(value) ? num(value, digits).replace(/\./g, '') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const bump = (dir: 1 | -1) => {
    const base = Number.isFinite(value) ? value : 0
    const next = clamp(Math.round((base + dir * step) / step) * step)
    onChange(Number(next.toFixed(4)))
  }

  return (
    <div className="field">
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="stepper">
        <button type="button" className="icon-btn" onClick={() => bump(-1)} aria-label="−">
          <Icon name="minus" />
        </button>
        <div className="value">
          <input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={text}
            className={invalid ? 'invalid' : undefined}
            onChange={(e) => {
              setText(e.target.value)
              const n = parseNum(e.target.value)
              onChange(Number.isFinite(n) ? n : Number.NaN)
            }}
            onFocus={(e) => e.target.select()}
          />
          {unit && <span className="unit">{unit}</span>}
        </div>
        <button type="button" className="icon-btn" onClick={() => bump(1)} aria-label="+">
          <Icon name="plus" />
        </button>
      </div>
      {help && <div className="help">{help}</div>}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stars({ value, onChange }: { value: number | null; onChange?: (v: number | null) => void }) {
  const t = useT()
  if (!onChange) {
    return (
      <span className="stars readonly" aria-label={value ? t.journal.stars(value) : t.journal.unrated}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Icon key={n} name="star" className={value && n <= value ? 'on' : undefined} />
        ))}
      </span>
    )
  }
  return (
    <div className="stars" role="radiogroup" aria-label={t.journal.rating}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t.journal.stars(n)}
          className={value && n <= value ? 'on' : undefined}
          onClick={() => onChange(value === n ? null : n)}
        >
          <Icon name="star" />
        </button>
      ))}
    </div>
  )
}

/** Short-lived message at the bottom of the screen. */
export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!msg) return
    const id = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(id)
  }, [msg])
  return [
    msg ? (
      <div className="toast" role="status">
        {msg}
      </div>
    ) : null,
    setMsg,
  ]
}

const FLOUR_COLORS = ['#e9c98f', '#a86a3c', '#7a4a2a', '#d9a23f', '#c7b299', '#5f7a4d']
/** Catalogue flours get their own colour; custom ones cycle through a fallback set. */
export const flourColor = (f: Pick<FlourPart, 'kind'>, i: number) =>
  findFlourKind(f.kind)?.color ?? FLOUR_COLORS[i % FLOUR_COLORS.length]

export function FlourBar({ flours }: { flours: FlourPart[] }) {
  const total = flours.reduce((s, f) => s + Math.max(0, f.percent || 0), 0) || 1
  return (
    <div className="flour-bar" aria-hidden="true">
      {flours.map((f, i) => (
        <span
          key={f.id}
          title={f.name}
          style={{ width: `${(Math.max(0, f.percent || 0) / total) * 100}%`, background: flourColor(f, i) }}
        />
      ))}
    </div>
  )
}

export function Notice({
  kind = 'info',
  children,
}: {
  kind?: 'info' | 'error' | 'ok' | 'night'
  children: ReactNode
}) {
  const icon = kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : kind === 'night' ? 'moon' : 'info'
  return (
    <div className={`notice ${kind === 'info' ? '' : kind}`} role={kind === 'error' ? 'alert' : undefined}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  )
}

/** Plain text input for an optional number; keeps partial input like "21," while typing. */
export function DecimalInput({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: number | undefined
  onChange: (n: number | undefined) => void
  id?: string
  placeholder?: string
}) {
  const [text, setText] = useState(value === undefined ? '' : num(value, 2).replace(/\./g, ''))
  useEffect(() => {
    const parsed = parseNum(text)
    if ((Number.isFinite(parsed) ? parsed : undefined) !== value)
      setText(value === undefined ? '' : num(value, 2).replace(/\./g, ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      id={id}
      className="input num"
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseNum(e.target.value)
        onChange(Number.isFinite(n) ? n : undefined)
      }}
    />
  )
}
