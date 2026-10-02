import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Notice, NumberField, Segmented, useToast } from '../components/controls'
import { useData } from '../data'
import { actionsToEvents, toIcs } from '../domain/ics'
import { bakeFromSchedule } from '../domain/journal'
import {
  buildSchedule,
  DEFAULT_QUIET,
  levainPeakMinutes,
  STEP_ORDER,
  suggestFixes,
  type ActionKind,
  type Schedule,
  type ScheduledAction,
  type Suggestion,
} from '../domain/schedule'
import type { ProofMode, Recipe, ScheduleSettings, StepKey } from '../domain/types'
import { duration, fromLocalInput, num, relativeDay, time, toLocalInput, useT } from '../i18n'
import { armedFor, armReminders, clearReminders, notificationsSupported, requestPermission } from '../notify'

const STEP_COLORS: Record<StepKey, string> = {
  levain: '#d9a23f',
  autolyse: '#e9c98f',
  mix: '#c98a4b',
  bulk: '#9a4f24',
  preshape: '#b8642f',
  benchRest: '#d6b48a',
  shape: '#b8642f',
  proof: '#6e3414',
  preheat: '#e07a3a',
  bake: '#3b2314',
}

const ACTION_STEP: Partial<Record<ActionKind, StepKey>> = {
  feed: 'levain',
  autolyse: 'autolyse',
  mix: 'mix',
  preshape: 'preshape',
  shape: 'shape',
  fridge: 'proof',
  preheat: 'preheat',
  bake: 'bake',
}

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`prozymi.${key}`)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`prozymi.${key}`, JSON.stringify(value))
  } catch {
    /* private mode */
  }
}

/** First quarter hour at which a bake of this length can finish if you start in 15 minutes. */
function earliestTarget(totalMinutes: number): Date {
  const q = 15 * 60_000
  return new Date(Math.ceil((Date.now() + q + totalMinutes * 60_000) / q) * q)
}

function defaultTarget(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(12, 0, 0, 0)
  return d
}

export default function SchedulePage() {
  const t = useT()
  const { allRecipes, findRecipe } = useData()
  const [params, setParams] = useSearchParams()
  const recipe = findRecipe(params.get('recipe')) ?? allRecipes[0]

  if (!recipe) return <Notice>{t.schedule.noRecipes}</Notice>
  return (
    <Planner
      key={recipe.id}
      recipe={recipe}
      recipes={allRecipes}
      onPick={(id) => setParams({ recipe: id }, { replace: true })}
    />
  )
}

function Planner({ recipe, recipes, onPick }: { recipe: Recipe; recipes: Recipe[]; onPick: (id: string) => void }) {
  const t = useT()
  const navigate = useNavigate()
  const { save } = useData()
  const [toast, showToast] = useToast()

  const [target, setTarget] = useState<Date>(() => {
    const saved = readPref<string | null>('target', null)
    const d = saved ? new Date(saved) : null
    return d && d.getTime() > Date.now() ? d : defaultTarget()
  })
  const [kitchenTemp, setKitchenTemp] = useState<number>(() => readPref('kitchenTemp', 22))
  const [settings, setSettings] = useState<ScheduleSettings>(() => structuredClone(recipe.schedule))
  const [notifyKey, setNotifyKey] = useState<string | null>(armedFor())

  const input = useMemo(
    () => ({
      target,
      kitchenTemp: Number.isFinite(kitchenTemp) ? kitchenTemp : 22,
      formula: recipe.formula,
      settings,
      quiet: DEFAULT_QUIET,
    }),
    [target, kitchenTemp, recipe.formula, settings],
  )
  const schedule = useMemo(() => buildSchedule(input), [input])
  const suggestions = useMemo(() => suggestFixes(input), [input])

  const updateTarget = (d: Date) => {
    setTarget(d)
    writePref('target', d.toISOString())
  }
  const updateTemp = (n: number) => {
    setKitchenTemp(n)
    if (Number.isFinite(n)) writePref('kitchenTemp', n)
  }
  const patch = (p: Partial<ScheduleSettings>) => setSettings((s) => ({ ...s, ...p }))

  const actionLabel = (a: ScheduledAction) => (a.kind === 'fold' ? t.actions.fold(a.index ?? 1) : t.actions[a.kind])

  const applySuggestion = (s: Suggestion) => {
    if (s.kind === 'shift') updateTarget(s.target)
    else patch({ proofMode: 'cold', coldRetard: s.coldRetard })
  }

  const downloadIcs = () => {
    const events = actionsToEvents(schedule.actions, actionLabel, `${recipe.id}-${target.getTime()}`)
    const blob = new Blob([toIcs(events, t.schedule.calendarName(recipe.name))], { type: 'text/calendar' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${recipe.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.ics`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const toggleNotify = async () => {
    if (notifyKey) {
      clearReminders()
      setNotifyKey(null)
      return
    }
    if (!(await requestPermission())) {
      showToast(t.schedule.notifyDenied)
      return
    }
    const key = `${recipe.id}-${target.getTime()}`
    armReminders(
      key,
      schedule.actions.map((a) => ({ at: a.at, title: actionLabel(a), body: recipe.name })),
    )
    setNotifyKey(key)
    showToast(t.schedule.notifyOn)
  }

  const startBake = async () => {
    const bake = bakeFromSchedule({ ...recipe, schedule: settings }, schedule, input.kitchenTemp)
    try {
      await save('bakes', bake, true)
      navigate(`/journal/${bake.id}`)
    } catch {
      showToast(t.common.error)
    }
  }

  const saveSettings = async () => {
    try {
      await save('recipes', { ...recipe, schedule: settings })
      showToast(t.schedule.savedToRecipe)
    } catch {
      showToast(t.common.error)
    }
  }
  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(recipe.schedule)
  const totalMinutes = (schedule.end.getTime() - schedule.start.getTime()) / 60_000

  return (
    <>
      <div className="page-head">
        <h1>{t.schedule.title}</h1>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        {t.schedule.intro}
      </p>

      <div className="grid-2">
        <div className="stack">
          <section className="card fields">
            <div className="field">
              <label htmlFor="srecipe">{t.schedule.recipe}</label>
              <select id="srecipe" className="input" value={recipe.id} onChange={(e) => onPick(e.target.value)}>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isExample ? ` · ${t.common.example}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="starget">{t.schedule.target}</label>
              <input
                id="starget"
                type="datetime-local"
                className="input"
                value={toLocalInput(target)}
                onChange={(e) => {
                  const d = fromLocalInput(e.target.value)
                  if (d) updateTarget(d)
                }}
              />
            </div>
            <NumberField
              label={t.schedule.kitchenTemp}
              value={kitchenTemp}
              unit="°C"
              step={0.5}
              min={5}
              max={40}
              onChange={updateTemp}
            />
            <div className="field">
              <span className="field-label">{t.schedule.proofMode}</span>
              <Segmented<ProofMode>
                label={t.schedule.proofMode}
                value={settings.proofMode}
                onChange={(proofMode) => patch({ proofMode })}
                options={[
                  { value: 'room', label: t.schedule.proofRoom },
                  { value: 'cold', label: t.schedule.proofCold },
                ]}
              />
            </div>
            {settings.proofMode === 'cold' && (
              <NumberField
                label={t.schedule.coldRetard}
                value={settings.coldRetard / 60}
                unit={t.units.h}
                step={0.5}
                min={1}
                max={48}
                onChange={(h) => Number.isFinite(h) && patch({ coldRetard: Math.round(h * 60) })}
              />
            )}
          </section>

          <StepSettings
            recipe={recipe}
            settings={settings}
            onChange={patch}
            onSave={!recipe.isExample && settingsChanged ? saveSettings : undefined}
          />
        </div>

        <div className="stack sticky-col">
          <section className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <h2 style={{ margin: 0 }}>{t.schedule.startAt(`${relativeDay(schedule.start).toLowerCase()} ${time(schedule.start)}`)}</h2>
              <span className="muted num">{t.schedule.totalTime(duration(totalMinutes))}</span>
            </div>
            <p className="small muted" style={{ marginTop: 6 }}>
              {t.schedule.factorNote(`${num(schedule.factors.dough * 100)}%`)}
            </p>
            <Overview schedule={schedule} />
            {schedule.tempWarning && <Notice kind="error">{t.schedule.tempWarning}</Notice>}
            {schedule.start.getTime() < Date.now() && (
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                <Notice kind="error">{t.schedule.pastStart}</Notice>
                <button className="btn small" onClick={() => updateTarget(earliestTarget(totalMinutes))}>
                  {t.schedule.earliest(
                    `${relativeDay(earliestTarget(totalMinutes)).toLowerCase()} ${time(earliestTarget(totalMinutes))}`,
                  )}
                </button>
              </div>
            )}
          </section>

          {schedule.conflicts.length > 0 ? (
            <Notice kind="night">
              <p>
                <strong>{t.schedule.nightTitle}</strong>
              </p>
              <p>{t.schedule.nightBody(schedule.conflicts.length)}</p>
              <div className="stack" style={{ gap: 8 }}>
                {suggestions.map((s) => (
                  <div className="suggestion" key={s.kind}>
                    <div>
                      <div>
                        {s.kind === 'shift'
                          ? t.schedule.suggestShift(`${relativeDay(s.target).toLowerCase()} ${time(s.target)}`)
                          : s.kind === 'cold'
                            ? t.schedule.suggestCold(num(s.coldRetard / 60, 1))
                            : t.schedule.suggestRetard(num(s.coldRetard / 60, 1))}
                      </div>
                      <div className="small muted">{t.schedule.suggestRemaining(s.conflicts)}</div>
                    </div>
                    <button className="btn small primary" onClick={() => applySuggestion(s)}>
                      {t.schedule.apply}
                    </button>
                  </div>
                ))}
              </div>
            </Notice>
          ) : (
            <Notice kind="ok">{t.schedule.allGood}</Notice>
          )}

          <section className="card">
            <Timeline schedule={schedule} actionLabel={actionLabel} />
          </section>

          <div className="row">
            <button className="btn primary" onClick={startBake}>
              <Icon name="play" />
              {t.schedule.startBake}
            </button>
            <button className="btn" onClick={downloadIcs}>
              <Icon name="download" />
              {t.schedule.exportIcs}
            </button>
            {notificationsSupported() && (
              <button className="btn" onClick={toggleNotify} aria-pressed={!!notifyKey}>
                <Icon name="bell" />
                {notifyKey ? t.schedule.notifyOn : t.schedule.notify}
              </button>
            )}
          </div>
          <p className="help">
            {t.schedule.startBakeHelp} {t.schedule.notifyHelp}
          </p>
          <Link to={`/recipes/${recipe.id}`} className="btn ghost small" style={{ justifySelf: 'start' }}>
            <Icon name="scale" />
            {recipe.name}
          </Link>
        </div>
      </div>
      {toast}
    </>
  )
}

function StepSettings({
  recipe,
  settings,
  onChange,
  onSave,
}: {
  recipe: Recipe
  settings: ScheduleSettings
  onChange: (p: Partial<ScheduleSettings>) => void
  onSave?: () => void
}) {
  const t = useT()
  const setDuration = (key: StepKey, minutes: number) =>
    Number.isFinite(minutes) && onChange({ durations: { ...settings.durations, [key]: Math.max(0, minutes) } })
  const ratio = recipe.formula.levainFeedRatio
  return (
    <section className="card">
      <details className="more" style={{ borderTop: 0, paddingTop: 0 }}>
        <summary>{t.schedule.settings}</summary>
        <p className="help" style={{ marginTop: 8 }}>
          {t.schedule.settingsHelp}
        </p>
        <div className="fields two">
          {STEP_ORDER.filter((k) => !(k === 'proof' && settings.proofMode === 'cold')).map((key) => (
            <NumberField
              key={key}
              label={t.steps[key]}
              value={settings.durations[key]}
              unit={t.units.min}
              step={key === 'mix' || key === 'preshape' || key === 'shape' ? 5 : 15}
              digits={0}
              help={
                key === 'levain'
                  ? t.schedule.levainSuggestion(num(ratio, 1), duration(levainPeakMinutes(ratio)))
                  : undefined
              }
              onChange={(m) => setDuration(key, m)}
            />
          ))}
          <NumberField
            label={t.schedule.foldCount}
            value={settings.foldCount}
            step={1}
            digits={0}
            max={12}
            onChange={(n) => Number.isFinite(n) && onChange({ foldCount: Math.round(n) })}
          />
          <NumberField
            label={t.schedule.foldInterval}
            value={settings.foldInterval}
            unit={t.units.min}
            step={5}
            min={5}
            digits={0}
            onChange={(n) => Number.isFinite(n) && onChange({ foldInterval: n })}
          />
        </div>
        {onSave && (
          <button className="btn block" style={{ marginTop: 14 }} onClick={onSave}>
            <Icon name="check" />
            {t.schedule.saveToRecipe}
          </button>
        )}
      </details>
    </section>
  )
}

/** One bar for the whole bake, with night hours hatched. */
function Overview({ schedule }: { schedule: Schedule }) {
  const t = useT()
  const start = schedule.start.getTime()
  const span = Math.max(1, schedule.end.getTime() - start)
  const pos = (d: Date | number) => ((new Date(d).getTime() - start) / span) * 100

  // Night bands (23:00–07:00) that overlap the bake.
  const bands: { left: number; width: number }[] = []
  const cursor = new Date(schedule.start)
  cursor.setHours(DEFAULT_QUIET.start, 0, 0, 0)
  cursor.setDate(cursor.getDate() - 1)
  while (cursor.getTime() < schedule.end.getTime()) {
    const bStart = cursor.getTime()
    const bEnd = bStart + ((24 - DEFAULT_QUIET.start + DEFAULT_QUIET.end) % 24) * 3600_000
    const l = Math.max(0, pos(bStart))
    const r = Math.min(100, pos(bEnd))
    if (r > l) bands.push({ left: l, width: r - l })
    cursor.setDate(cursor.getDate() + 1)
  }

  const main = schedule.steps.filter((s) => !s.parallel)
  return (
    <>
      <div className="overview" role="img" aria-label={t.schedule.title}>
        {main.map((s) => (
          <div
            key={s.key}
            className="seg"
            title={t.steps[s.key]}
            style={{ left: `${pos(s.start)}%`, width: `${pos(s.end) - pos(s.start)}%`, background: STEP_COLORS[s.key] }}
          />
        ))}
        {bands.map((b, i) => (
          <div key={i} className="nightband" style={{ left: `${b.left}%`, width: `${b.width}%` }} />
        ))}
      </div>
      <div className="legend">
        {main
          .filter((s) => s.minutes >= 30)
          .map((s) => (
            <span key={s.key}>
              <i style={{ background: STEP_COLORS[s.key] }} />
              {t.steps[s.key]}
            </span>
          ))}
        <span>
          <Icon name="moon" style={{ width: 12, height: 12, verticalAlign: -1, marginRight: 4 }} />
          23:00–07:00
        </span>
      </div>
    </>
  )
}

interface TLItem {
  at: Date
  title: string
  meta?: string
  help?: string
  night: boolean
  minor: boolean
  cold?: boolean
  done?: boolean
}

function Timeline({ schedule, actionLabel }: { schedule: Schedule; actionLabel: (a: ScheduledAction) => string }) {
  const t = useT()
  const actionFor = (key: StepKey) =>
    schedule.actions.find((a) => ACTION_STEP[a.kind] === key && (key !== 'proof' || a.kind === 'fridge'))

  const items: TLItem[] = []
  for (const s of schedule.steps) {
    const action = actionFor(s.key)
    items.push({
      at: s.start,
      title: t.steps[s.key],
      meta: `${duration(s.minutes)}${s.cold ? ` · ${t.schedule.inFridge}` : ''}`,
      help: t.stepHelp[s.key],
      night: !!action?.inconvenient,
      minor: false,
      cold: s.cold,
    })
  }
  for (const a of schedule.actions) {
    if (a.kind === 'fold') items.push({ at: a.at, title: actionLabel(a), night: a.inconvenient, minor: true })
    if (a.kind === 'done') items.push({ at: a.at, title: actionLabel(a), night: a.inconvenient, minor: false, done: true })
  }
  items.sort((a, b) => a.at.getTime() - b.at.getTime() || Number(a.done) - Number(b.done))

  const groups: { day: string; items: TLItem[] }[] = []
  for (const item of items) {
    const day = relativeDay(item.at)
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] })
    groups.at(-1)!.items.push(item)
  }

  return (
    <div>
      {groups.map((g) => (
        <div key={g.day}>
          <div className="day-label">{g.day}</div>
          <ol className="timeline">
            {g.items.map((item, i) => (
              <li
                key={i}
                className={`tl-item ${item.minor ? 'minor' : ''} ${item.night ? 'night' : ''} ${item.done ? 'done' : ''}`}
              >
                <span className="tl-time">{time(item.at)}</span>
                <span className="tl-dot">
                  <span />
                </span>
                <div className="tl-body">
                  <div className="tl-title">
                    {item.title}
                    {item.night && (
                      <span className="badge night">
                        <Icon name="moon" style={{ width: 12, height: 12 }} />
                        {t.schedule.night}
                      </span>
                    )}
                    {item.cold && (
                      <span className="badge cold">
                        <Icon name="snow" style={{ width: 12, height: 12 }} />
                      </span>
                    )}
                  </div>
                  {item.meta && <div className="tl-meta num">{item.meta}</div>}
                  {item.help && !item.minor && <div className="tl-meta">{item.help}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
