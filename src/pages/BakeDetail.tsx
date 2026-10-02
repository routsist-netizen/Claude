import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { api, resizeImage } from '../api'
import { Icon } from '../components/Icon'
import { DecimalInput, NumberField, Stars, useToast } from '../components/controls'
import { useData } from '../data'
import { calculate } from '../domain/recipe'
import type { Bake, BakeStepLog, PhotoKind } from '../domain/types'
import { duration, fromLocalInput, grams, num, relativeDay, time, toLocalInput, useT } from '../i18n'

export default function BakeDetail() {
  const { id } = useParams()
  const { bakes } = useData()
  const bake = bakes.find((b) => b.id === id)
  if (!bake) return <Navigate to="/journal" replace />
  return <BakeEditor key={bake.id} initial={bake} />
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function BakeEditor({ initial }: { initial: Bake }) {
  const t = useT()
  const navigate = useNavigate()
  const { save, remove, findRecipe } = useData()
  const [bake, setBake] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')
  const [uploading, setUploading] = useState(false)
  const [toast, showToast] = useToast()
  const lastSaved = useRef(JSON.stringify(initial))

  // Autosave shortly after the last change: no save button to hunt for with doughy hands.
  useEffect(() => {
    const json = JSON.stringify(bake)
    if (json === lastSaved.current) return
    setState('saving')
    const id = setTimeout(async () => {
      try {
        await save('bakes', bake)
        lastSaved.current = json
        setState('saved')
      } catch {
        setState('error')
      }
    }, 700)
    return () => clearTimeout(id)
  }, [bake, save])

  const set = (p: Partial<Bake>) => setBake((b) => ({ ...b, ...p }))
  const setStep = (key: string, p: Partial<BakeStepLog>) =>
    setBake((b) => ({ ...b, steps: b.steps.map((s) => (s.key === key ? { ...s, ...p } : s)) }))

  // "Now" on a step also closes the previous one: its duration is the time since it started.
  const markNow = (key: string) =>
    setBake((b) => {
      const now = new Date()
      const i = b.steps.findIndex((s) => s.key === key)
      // Autolyse and preheat run alongside the main chain, so they neither close nor get closed.
      const parallel = (k: string) => k === 'autolyse' || k === 'preheat'
      let prev = -1
      if (!parallel(key)) for (let j = i - 1; j >= 0 && prev < 0; j--) if (!parallel(b.steps[j].key)) prev = j
      return {
        ...b,
        steps: b.steps.map((s, j) => {
          if (j === i) return { ...s, actualStart: now.toISOString() }
          if (j === prev && s.actualStart && s.actualMinutes === undefined) {
            const m = Math.round((now.getTime() - new Date(s.actualStart).getTime()) / 60_000)
            return m >= 0 ? { ...s, actualMinutes: m } : s
          }
          return s
        }),
      }
    })

  const result = useMemo(() => calculate(bake.snapshot), [bake.snapshot])
  const recipe = findRecipe(bake.recipeId)

  const addPhoto = async (file: File, kind: PhotoKind) => {
    setUploading(true)
    try {
      const blob = await resizeImage(file)
      const { id } = await api.uploadPhoto(blob)
      setBake((b) => ({ ...b, photos: [...b.photos, { id, kind }] }))
    } catch {
      showToast(t.common.error)
    } finally {
      setUploading(false)
    }
  }
  const removePhoto = async (id: string) => {
    if (!confirm(t.common.confirmDelete)) return
    setBake((b) => ({ ...b, photos: b.photos.filter((p) => p.id !== id) }))
    api.deletePhoto(id).catch(() => {})
  }

  const onDelete = async () => {
    if (!confirm(t.common.confirmDelete)) return
    await remove('bakes', bake.id)
    navigate('/journal', { replace: true })
  }

  const bakeDate = new Date(bake.date)

  return (
    <>
      <div className="page-head">
        <Link to="/journal" className="btn ghost small">
          <Icon name="back" />
          {t.journal.title}
        </Link>
        <span className="muted small" role="status">
          {state === 'saving' ? t.common.saving : state === 'saved' ? t.common.saved : state === 'error' ? t.common.error : ''}
        </span>
      </div>

      <h1>{bake.recipeName}</h1>
      <p className="muted" style={{ marginTop: -4 }}>
        {relativeDay(bakeDate)} · {time(bakeDate)}
      </p>

      <div className="grid-2">
        <div className="stack">
          <section className="card stack" style={{ gap: 12 }}>
            <span className="field-label">{t.journal.rating}</span>
            <Stars value={bake.rating} onChange={(rating) => set({ rating })} />
            <div className="fields two">
              <div className="field">
                <label htmlFor="bdate">{t.journal.date}</label>
                <input
                  id="bdate"
                  type="datetime-local"
                  className="input"
                  value={toLocalInput(bakeDate)}
                  onChange={(e) => {
                    const d = fromLocalInput(e.target.value)
                    if (d) set({ date: d.toISOString() })
                  }}
                />
              </div>
              <NumberField
                label={t.journal.kitchenTemp}
                value={bake.kitchenTemp}
                unit="°C"
                step={0.5}
                onChange={(kitchenTemp) => Number.isFinite(kitchenTemp) && set({ kitchenTemp })}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Icon name="clock" />
              {t.journal.steps}
            </h2>
            <div className="step-log">
              {bake.steps.map((s) => (
                <StepEntry key={s.key} step={s} onChange={(p) => setStep(s.key, p)} onNow={() => markNow(s.key)} />
              ))}
            </div>
          </section>

          <section className="card">
            <div className="field">
              <label htmlFor="bnotes">{t.common.notes}</label>
              <textarea
                id="bnotes"
                className="input"
                rows={5}
                placeholder={t.journal.notesPlaceholder}
                value={bake.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </div>
          </section>
        </div>

        <div className="stack sticky-col">
          <section className="card">
            <h2 className="card-title">
              <Icon name="camera" />
              {t.journal.photos}
            </h2>
            <div className="photo-grid">
              {bake.photos.map((p) => (
                <figure className="photo" key={p.id} style={{ margin: 0 }}>
                  <a href={api.photoUrl(p.id)} target="_blank" rel="noreferrer">
                    <img src={api.photoUrl(p.id)} alt={t.journal.photoKinds[p.kind]} loading="lazy" />
                  </a>
                  <span className="badge tag">{t.journal.photoKinds[p.kind]}</span>
                  <button className="icon-btn" onClick={() => removePhoto(p.id)} aria-label={t.common.delete}>
                    <Icon name="trash" />
                  </button>
                </figure>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              {(['crust', 'crumb', 'other'] as PhotoKind[]).map((kind) => (
                <label key={kind} className="btn file-btn" aria-disabled={uploading}>
                  <Icon name="camera" />
                  {t.journal.photoKinds[kind]}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) addPhoto(file, kind)
                    }}
                  />
                </label>
              ))}
            </div>
            {uploading && <p className="muted small">{t.journal.uploading}</p>}
          </section>

          <section className="card">
            <h2 className="card-title">
              <Icon name="scale" />
              {t.journal.snapshot}
            </h2>
            {!recipe && <p className="help">{t.journal.recipeGone}</p>}
            <dl className="kv" style={{ margin: 0 }}>
              <div>
                <dt>{t.calc.totalDough}</dt>
                <dd>{grams(result.totalDough)} g</dd>
              </div>
              <div>
                <dt>{t.calc.hydration}</dt>
                <dd>{num(bake.snapshot.hydration, 1)}%</dd>
              </div>
              <div>
                <dt>{t.calc.levain}</dt>
                <dd>{num(bake.snapshot.levain, 1)}%</dd>
              </div>
              <div>
                <dt>{t.calc.salt}</dt>
                <dd>{num(bake.snapshot.salt, 2)}%</dd>
              </div>
              <div>
                <dt>{t.calc.totalFlour}</dt>
                <dd>{grams(result.totalFlour)} g</dd>
              </div>
              <div>
                <dt>{t.calc.totalWater}</dt>
                <dd>{grams(result.totalWater)} g</dd>
              </div>
            </dl>
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              {bake.snapshot.flours.map((f) => `${f.name} ${num(f.percent, 1)}%`).join(' · ')}
            </p>
            {recipe && (
              <Link to={`/recipes/${recipe.id}`} className="btn ghost small" style={{ marginTop: 8 }}>
                {recipe.name}
              </Link>
            )}
          </section>

          <button className="btn danger" onClick={onDelete}>
            <Icon name="trash" />
            {t.journal.deleteBake}
          </button>
        </div>
      </div>
      {toast}
    </>
  )
}

function StepEntry({
  step,
  onChange,
  onNow,
}: {
  step: BakeStepLog
  onChange: (p: Partial<BakeStepLog>) => void
  onNow: () => void
}) {
  const t = useT()
  const uid = useId()
  const planned = new Date(step.plannedStart)
  const actual = step.actualStart ? new Date(step.actualStart) : null
  return (
    <div className="entry">
      <div className="entry-head">
        <strong>{t.steps[step.key]}</strong>
        <span className="muted small num">
          {t.journal.planned}: {time(planned)} · {duration(step.plannedMinutes)}
        </span>
      </div>
      <div className="entry-fields">
        <div className="field">
          <label htmlFor={`${uid}-start`} className="small">
            {t.journal.actualStart}
          </label>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
            <input
              id={`${uid}-start`}
              type="datetime-local"
              className="input"
              value={actual ? toLocalInput(actual) : ''}
              onChange={(e) => onChange({ actualStart: fromLocalInput(e.target.value)?.toISOString() })}
            />
            {!actual && (
              <button type="button" className="btn small primary" onClick={onNow} title={t.journal.markNow}>
                {t.common.now}
              </button>
            )}
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${uid}-min`} className="small">
            {t.journal.actualMinutes}
          </label>
          <DecimalInput
            id={`${uid}-min`}
            placeholder={String(step.plannedMinutes)}
            value={step.actualMinutes}
            onChange={(actualMinutes) => onChange({ actualMinutes })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${uid}-temp`} className="small">
            {t.journal.stepTemp}
          </label>
          <DecimalInput id={`${uid}-temp`} value={step.temp} onChange={(temp) => onChange({ temp })} />
        </div>
      </div>
    </div>
  )
}
