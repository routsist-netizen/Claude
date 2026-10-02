import { useId, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { Icon } from '../components/Icon'
import { NumberField, Segmented, Stars, useToast } from '../components/controls'
import { useData } from '../data'
import { feedingRatio, peakMinutes, starterHydration } from '../domain/journal'
import { newId } from '../domain/recipe'
import { filterBakes } from '../domain/stats'
import type { Bake, StarterFeeding } from '../domain/types'
import { date, duration, fromLocalInput, num, relativeDay, time, toLocalInput, useT } from '../i18n'

type Tab = 'bakes' | 'starter'

export default function Journal() {
  const t = useT()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'starter' ? 'starter' : 'bakes'

  return (
    <>
      <div className="page-head">
        <h1>{t.journal.title}</h1>
        {tab === 'bakes' && (
          <Link to="/schedule" className="btn primary">
            <Icon name="plus" />
            {t.journal.newBake}
          </Link>
        )}
      </div>
      <div className="tabs">
        <Segmented<Tab>
          value={tab}
          onChange={(v) => setParams(v === 'bakes' ? {} : { tab: v }, { replace: true })}
          options={[
            { value: 'bakes', label: t.journal.bakes },
            { value: 'starter', label: t.journal.starter },
          ]}
        />
      </div>
      {tab === 'bakes' ? <BakeList /> : <StarterLog />}
    </>
  )
}

function BakeList() {
  const t = useT()
  const { bakes, allRecipes } = useData()
  const [recipeId, setRecipeId] = useState('')
  const [minRating, setMinRating] = useState('0')
  const list = useMemo(
    () => filterBakes(bakes, { recipeId: recipeId || undefined, minRating: Number(minRating) || undefined }),
    [bakes, recipeId, minRating],
  )
  const usedRecipes = allRecipes.filter((r) => bakes.some((b) => b.recipeId === r.id))

  if (bakes.length === 0) return <p className="muted">{t.journal.empty}</p>

  return (
    <div className="stack">
      <div className="fields two">
        <select className="input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)} aria-label={t.schedule.recipe}>
          <option value="">{t.journal.allRecipes}</option>
          {usedRecipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select
          className="input"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          aria-label={t.journal.minRating}
        >
          <option value="0">
            {t.journal.minRating}: {t.journal.anyRating}
          </option>
          {[2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {t.journal.minRating}: {n}★
            </option>
          ))}
        </select>
      </div>
      {list.map((b) => (
        <BakeCard key={b.id} bake={b} />
      ))}
    </div>
  )
}

function BakeCard({ bake }: { bake: Bake }) {
  const photo = bake.photos.find((p) => p.kind === 'crumb') ?? bake.photos[0]
  return (
    <Link to={`/journal/${bake.id}`} className="card bake-card">
      {photo ? (
        <img className="thumb" src={api.photoUrl(photo.id)} alt="" loading="lazy" />
      ) : (
        <div className="thumb">
          <Icon name="loaf" />
        </div>
      )}
      <div>
        <div style={{ fontWeight: 700 }}>{bake.recipeName}</div>
        <div className="muted small">
          {date(new Date(bake.date))} · {num(bake.snapshot.hydration, 1)}% · {num(bake.kitchenTemp, 1)}°C
        </div>
        <Stars value={bake.rating} />
      </div>
    </Link>
  )
}

function blankFeeding(last?: StarterFeeding): StarterFeeding {
  const now = new Date().toISOString()
  return {
    id: newId(),
    fedAt: now,
    seed: last?.seed ?? 20,
    flour: last?.flour ?? 100,
    water: last?.water ?? 100,
    flourType: last?.flourType ?? '',
    temp: last?.temp ?? null,
    risePercent: null,
    peakAt: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

function StarterLog() {
  const t = useT()
  const { starter, save, remove } = useData()
  const sorted = useMemo(() => [...starter].sort((a, b) => b.fedAt.localeCompare(a.fedAt)), [starter])
  const [draft, setDraft] = useState<StarterFeeding | null>(null)
  const [editing, setEditing] = useState<StarterFeeding | null>(null)
  const [toast, showToast] = useToast()

  const peaks = sorted.map(peakMinutes).filter((m): m is number => m !== null)
  const avgPeak = peaks.length ? peaks.reduce((s, m) => s + m, 0) / peaks.length : null

  const persist = async (f: StarterFeeding, isNew: boolean) => {
    try {
      await save('starter', f, isNew)
      showToast(t.common.saved)
      return true
    } catch {
      showToast(t.common.error)
      return false
    }
  }

  return (
    <div className="stack">
      {avgPeak !== null && <p className="muted">{t.starter.avgPeak(duration(avgPeak))}</p>}

      {draft ? (
        <FeedingForm
          value={draft}
          onChange={setDraft}
          onCancel={() => setDraft(null)}
          onSave={async () => {
            if (await persist(draft, true)) setDraft(null)
          }}
        />
      ) : (
        <button className="btn primary block" onClick={() => setDraft(blankFeeding(sorted[0]))}>
          <Icon name="jar" />
          {t.starter.add}
        </button>
      )}

      {sorted.length === 0 && !draft && <p className="muted">{t.starter.empty}</p>}

      {sorted.map((f) =>
        editing?.id === f.id ? (
          <FeedingForm
            key={f.id}
            value={editing}
            onChange={setEditing}
            onCancel={() => setEditing(null)}
            onSave={async () => {
              if (await persist(editing, false)) setEditing(null)
            }}
          />
        ) : (
          <FeedingCard
            key={f.id}
            feeding={f}
            onPeakNow={() => persist({ ...f, peakAt: new Date().toISOString() }, false)}
            onEdit={() => setEditing(structuredClone(f))}
            onDelete={() => confirm(t.common.confirmDelete) && remove('starter', f.id)}
          />
        ),
      )}
      {toast}
    </div>
  )
}

function FeedingCard({
  feeding: f,
  onPeakNow,
  onEdit,
  onDelete,
}: {
  feeding: StarterFeeding
  onPeakNow: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useT()
  const peak = peakMinutes(f)
  const fed = new Date(f.fedAt)
  return (
    <article className="card stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>
          {relativeDay(fed)} {time(fed)}
        </strong>
        <span className="muted small">{f.flourType}</span>
      </div>
      <dl className="kv" style={{ margin: 0 }}>
        <div>
          <dt>{t.starter.ratio}</dt>
          <dd>{feedingRatio(f)}</dd>
        </div>
        <div>
          <dt>{t.starter.hydration}</dt>
          <dd>{starterHydration(f) ?? '–'}%</dd>
        </div>
        {f.temp !== null && (
          <div>
            <dt>{t.starter.temp}</dt>
            <dd>{num(f.temp, 1)}</dd>
          </div>
        )}
        {peak !== null && (
          <div>
            <dt>{t.starter.peakAfter}</dt>
            <dd>{duration(peak)}</dd>
          </div>
        )}
        {f.risePercent !== null && (
          <div>
            <dt>{t.starter.rise}</dt>
            <dd>+{num(f.risePercent)}%</dd>
          </div>
        )}
      </dl>
      {f.notes && <p style={{ margin: 0 }}>{f.notes}</p>}
      <div className="row">
        {!f.peakAt && (
          <button className="btn primary" onClick={onPeakNow}>
            <Icon name="check" />
            {t.starter.peakNow}
          </button>
        )}
        <button className="btn" onClick={onEdit}>
          {t.common.edit}
        </button>
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={onDelete} aria-label={t.common.delete}>
          <Icon name="trash" />
        </button>
      </div>
    </article>
  )
}

function FeedingForm({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: StarterFeeding
  onChange: (f: StarterFeeding) => void
  onSave: () => void
  onCancel: () => void
}) {
  const t = useT()
  const set = (p: Partial<StarterFeeding>) => onChange({ ...value, ...p })
  const uid = useId()
  return (
    <section className="card fields">
      <h2 className="card-title">
        <Icon name="jar" />
        {t.starter.title}
      </h2>
      <div className="field">
        <label htmlFor={`${uid}-fedAt`}>{t.starter.fedAt}</label>
        <input
          id={`${uid}-fedAt`}
          type="datetime-local"
          className="input"
          value={toLocalInput(new Date(value.fedAt))}
          onChange={(e) => {
            const d = fromLocalInput(e.target.value)
            if (d) set({ fedAt: d.toISOString() })
          }}
        />
      </div>
      <div className="fields two">
        <NumberField label={t.starter.seed} value={value.seed} unit="g" step={5} digits={0} onChange={(seed) => set({ seed })} />
        <NumberField label={t.starter.flour} value={value.flour} unit="g" step={10} digits={0} onChange={(flour) => set({ flour })} />
        <NumberField label={t.starter.water} value={value.water} unit="g" step={10} digits={0} onChange={(water) => set({ water })} />
        <NumberField
          label={t.starter.temp}
          value={value.temp ?? Number.NaN}
          unit="°C"
          step={0.5}
          onChange={(n) => set({ temp: Number.isFinite(n) ? n : null })}
        />
      </div>
      <div className="muted num">
        {t.starter.ratio}: {feedingRatio(value)} · {t.starter.hydration}: {starterHydration(value) ?? '–'}%
      </div>
      <div className="fields two">
        <div className="field">
          <label htmlFor={`${uid}-peakAt`}>
            {t.starter.peakAt} <span className="muted small">({t.common.optional})</span>
          </label>
          <input
            id={`${uid}-peakAt`}
            type="datetime-local"
            className="input"
            value={value.peakAt ? toLocalInput(new Date(value.peakAt)) : ''}
            onChange={(e) => set({ peakAt: fromLocalInput(e.target.value)?.toISOString() ?? null })}
          />
        </div>
        <NumberField
          label={t.starter.rise}
          help={t.starter.riseHelp}
          value={value.risePercent ?? Number.NaN}
          unit="%"
          step={10}
          digits={0}
          onChange={(n) => set({ risePercent: Number.isFinite(n) ? n : null })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-flourType`}>{t.starter.flourType}</label>
        <input id={`${uid}-flourType`} className="input" value={value.flourType} onChange={(e) => set({ flourType: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-fnotes`}>{t.common.notes}</label>
        <textarea id={`${uid}-fnotes`} className="input" value={value.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>
      <div className="row">
        <button className="btn primary" onClick={onSave}>
          <Icon name="check" />
          {t.common.save}
        </button>
        <button className="btn ghost" onClick={onCancel}>
          {t.common.cancel}
        </button>
      </div>
    </section>
  )
}
