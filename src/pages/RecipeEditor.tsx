import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { FlourPicker } from '../components/FlourPicker'
import { Icon } from '../components/Icon'
import { flourColor, FlourBar, Notice, NumberField, useToast } from '../components/controls'
import { useData } from '../data'
import { blankRecipe, copyRecipe } from '../domain/factory'
import { findFlourKind, nextFlourKind, suggestedHydration } from '../domain/flours'
import { calculate, flourSum, newId, type Issue } from '../domain/recipe'
import type { FlourPart, Recipe, RecipeFormula } from '../domain/types'
import { grams, num, useT } from '../i18n'

export default function RecipeEditor() {
  const { id } = useParams()
  const { findRecipe } = useData()
  const t = useT()
  const initial = useMemo(
    () => (id === 'new' ? blankRecipe(t.recipes.newName) : findRecipe(id)),
    // Only on first render for this id: the editor owns the draft afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  )
  if (!initial) return <Navigate to="/" replace />
  return <Editor key={id} initial={initial} isNew={id === 'new'} />
}

function Editor({ initial, isNew }: { initial: Recipe; isNew: boolean }) {
  const t = useT()
  const navigate = useNavigate()
  const { save, remove } = useData()
  const [draft, setDraft] = useState<Recipe>(initial)
  const [saved, setSaved] = useState<string>(isNew ? '' : JSON.stringify(initial))
  const [busy, setBusy] = useState(false)
  const [toast, showToast] = useToast()

  const f = draft.formula
  const result = useMemo(() => calculate(f), [f])
  const dirty = JSON.stringify(draft) !== saved
  const isExample = !!draft.isExample

  const setFormula = (patch: Partial<RecipeFormula>) => setDraft((d) => ({ ...d, formula: { ...d.formula, ...patch } }))
  const setFlour = (id: string, patch: Partial<FlourPart>) =>
    setDraft((d) => ({
      ...d,
      formula: { ...d.formula, flours: d.formula.flours.map((x) => (x.id === id ? { ...x, ...patch } : x)) },
    }))
  const suggested = suggestedHydration(f.flours)

  const persist = async (recipe: Recipe, asNew: boolean) => {
    setBusy(true)
    try {
      const stored = await save('recipes', recipe, asNew)
      showToast(t.common.saved)
      if (asNew) navigate(`/recipes/${stored.id}`, { replace: true })
      else setSaved(JSON.stringify(stored))
      if (!asNew) setDraft(stored)
    } catch {
      showToast(t.common.error)
    } finally {
      setBusy(false)
    }
  }

  const onSave = () => {
    if (isExample) return persist(copyRecipe(draft, draft.name), true)
    return persist(draft, isNew)
  }
  const onDuplicate = () => persist(copyRecipe(draft, `${draft.name} ${t.common.copySuffix}`), true)
  const onDelete = async () => {
    if (!confirm(t.common.confirmDelete)) return
    await remove('recipes', draft.id)
    navigate('/', { replace: true })
  }

  const sum = flourSum(f)
  const issueText = (i: Issue) => t.calc.issues[i.code](i.params ?? {})

  return (
    <>
      <div className="page-head">
        <Link to="/" className="btn ghost small">
          <Icon name="back" />
          {t.recipes.title}
        </Link>
        {isExample && <span className="badge">{t.common.example}</span>}
      </div>

      <div className="field" style={{ marginBottom: 16 }}>
        <label htmlFor="rname" className="sr-only">
          {t.common.name}
        </label>
        <input
          id="rname"
          className="input"
          style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 600 }}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </div>

      {isExample && (
        <div style={{ marginBottom: 16 }}>
          <Notice>{t.recipes.exampleReadOnly}</Notice>
        </div>
      )}

      <div className="grid-2 results-first">
        <div className="stack">
          <section className="card">
            <h2 className="card-title">
              <Icon name="scale" />
              {t.calc.dough}
            </h2>
            <div className="fields two">
              <NumberField
                label={t.calc.loaves}
                value={f.loaves}
                step={1}
                min={1}
                digits={0}
                onChange={(loaves) => setFormula({ loaves })}
              />
              <NumberField
                label={t.calc.loafWeight}
                value={f.loafWeight}
                unit="g"
                step={50}
                digits={0}
                onChange={(loafWeight) => setFormula({ loafWeight })}
              />
              <NumberField
                label={t.calc.hydration}
                value={f.hydration}
                unit="%"
                step={1}
                onChange={(hydration) => setFormula({ hydration })}
              />
              <NumberField
                label={t.calc.salt}
                value={f.salt}
                unit="%"
                step={0.1}
                digits={2}
                onChange={(salt) => setFormula({ salt })}
              />
              <NumberField
                label={
                  <>
                    {t.calc.yeast} <span className="muted small">({t.common.optional})</span>
                  </>
                }
                value={f.yeast}
                unit="%"
                step={0.1}
                digits={2}
                onChange={(yeast) => setFormula({ yeast })}
              />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Icon name="loaf" />
              {t.calc.flourBlend}
            </h2>
            <div className="list-edit">
              {f.flours.map((flour, i) => (
                <div className="item" key={flour.id}>
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <span
                      aria-hidden="true"
                      style={{ width: 14, height: 14, borderRadius: 4, background: flourColor(flour, i), flex: 'none' }}
                    />
                    <FlourPicker flour={flour} onChange={(p) => setFlour(flour.id, p)} />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.delete}
                    disabled={f.flours.length === 1}
                    onClick={() => {
                      const flours = f.flours.filter((x) => x.id !== flour.id)
                      setFormula({
                        flours,
                        levainFlour: f.levainFlour === flour.id ? (flours[0]?.id ?? 'blend') : f.levainFlour,
                      })
                    }}
                  >
                    <Icon name="trash" />
                  </button>
                  {findFlourKind(flour.kind) ? (
                    <p className="help span">{t.calc.flourInfo[flour.kind!]}</p>
                  ) : (
                    <input
                      className="input span"
                      aria-label={t.calc.customFlourName}
                      placeholder={t.calc.customFlourName}
                      value={flour.name}
                      onChange={(e) => setFlour(flour.id, { name: e.target.value })}
                    />
                  )}
                  <NumberField
                    value={flour.percent}
                    unit="%"
                    step={5}
                    max={100}
                    onChange={(percent) => setFlour(flour.id, { percent })}
                  />
                </div>
              ))}
            </div>
            <div className="row" style={{ marginTop: 12, justifyContent: 'space-between' }}>
              <strong className={`num ${Math.abs(sum - 100) > 0.01 ? '' : 'muted'}`} style={{ color: Math.abs(sum - 100) > 0.01 ? 'var(--ember)' : undefined }}>
                {t.calc.blendSum(num(sum, 1))}
              </strong>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  const kind = nextFlourKind(f.flours)
                  const percent = Math.max(0, Math.round((100 - sum) * 10) / 10)
                  setFormula({ flours: [...f.flours, { id: newId(), name: kind.name, kind: kind.id, percent }] })
                }}
              >
                <Icon name="plus" />
                {t.calc.addFlour}
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              <FlourBar flours={f.flours} />
            </div>
            {suggested !== null && Math.abs(suggested - f.hydration) >= 1 && (
              <div className="suggestion" style={{ marginTop: 12, background: 'var(--wheat-soft)' }}>
                <span className="small">{t.calc.suggestedHydration(num(suggested))}</span>
                <button type="button" className="btn small" onClick={() => setFormula({ hydration: suggested })}>
                  {t.calc.useSuggestion}
                </button>
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">
              <Icon name="jar" />
              {t.calc.levainSection}
            </h2>
            <div className="fields two">
              <NumberField
                label={t.calc.levain}
                value={f.levain}
                unit="%"
                step={1}
                help={t.calc.levainHelp}
                onChange={(levain) => setFormula({ levain })}
              />
              <NumberField
                label={t.calc.levainHydration}
                value={f.levainHydration}
                unit="%"
                step={5}
                onChange={(levainHydration) => setFormula({ levainHydration })}
              />
              <NumberField
                label={t.calc.feedRatio}
                value={f.levainFeedRatio}
                step={1}
                digits={1}
                onChange={(levainFeedRatio) => setFormula({ levainFeedRatio })}
              />
              <div className="field">
                <label htmlFor="levainFlour">{t.calc.levainFlour}</label>
                <select
                  id="levainFlour"
                  className="input"
                  value={f.flours.some((x) => x.id === f.levainFlour) ? f.levainFlour : 'blend'}
                  onChange={(e) => setFormula({ levainFlour: e.target.value })}
                >
                  {f.flours.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name || '—'}
                    </option>
                  ))}
                  <option value="blend">{t.calc.levainFlourBlend}</option>
                </select>
              </div>
            </div>
          </section>

          <section className="card">
            <h2 className="card-title">
              <Icon name="plus" />
              {t.calc.inclusions}
            </h2>
            <p className="help">{t.calc.inclusionsHelp}</p>
            <div className="list-edit">
              {f.inclusions.map((inc) => (
                <div className="item" key={inc.id}>
                  <input
                    className="input"
                    aria-label={t.calc.inclusionName}
                    value={inc.name}
                    onChange={(e) =>
                      setFormula({
                        inclusions: f.inclusions.map((x) => (x.id === inc.id ? { ...x, name: e.target.value } : x)),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t.common.delete}
                    onClick={() => setFormula({ inclusions: f.inclusions.filter((x) => x.id !== inc.id) })}
                  >
                    <Icon name="trash" />
                  </button>
                  <NumberField
                    value={inc.percent}
                    unit="%"
                    step={1}
                    onChange={(percent) =>
                      setFormula({ inclusions: f.inclusions.map((x) => (x.id === inc.id ? { ...x, percent } : x)) })
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn small"
              style={{ marginTop: 12 }}
              onClick={() => setFormula({ inclusions: [...f.inclusions, { id: newId(), name: '', percent: 10 }] })}
            >
              <Icon name="plus" />
              {t.calc.addInclusion}
            </button>
          </section>

          <section className="card">
            <div className="field">
              <label htmlFor="rdesc">{t.common.notes}</label>
              <textarea
                id="rdesc"
                className="input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </section>
        </div>

        <div className="stack sticky-col">
          {result.issues.length > 0 && (
            <Notice kind="error">
              {result.issues.map((i) => (
                <p key={i.code}>{issueText(i)}</p>
              ))}
            </Notice>
          )}
          <WeighSheet formula={f} result={result} />
          <div className="row">
            {!isNew && (
              <Link to={`/schedule?recipe=${draft.id}`} className="btn">
                <Icon name="clock" />
                {t.recipes.planBake}
              </Link>
            )}
            {!isNew && !isExample && (
              <button className="btn" onClick={onDuplicate} disabled={busy}>
                <Icon name="copy" />
                {t.common.duplicate}
              </button>
            )}
            {!isNew && !isExample && (
              <button className="btn danger" onClick={onDelete} disabled={busy}>
                <Icon name="trash" />
                {t.common.delete}
              </button>
            )}
          </div>
        </div>
      </div>

      {(dirty || isExample) && (
        <div className="sticky-actions" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={onSave} disabled={busy || !draft.name.trim()}>
            <Icon name={isExample ? 'copy' : 'check'} />
            {busy ? t.common.saving : isExample ? t.recipes.saveAsMine : t.common.save}
          </button>
        </div>
      )}
      {toast}
    </>
  )
}

function Line({ label, sub, g, minor }: { label: string; sub?: string; g: number; minor?: boolean }) {
  return (
    <div className={`line ${minor ? 'minor' : ''}`}>
      <span className="label">
        {label}
        {sub && <small>{sub}</small>}
      </span>
      <span className="grams">{grams(g)}</span>
    </div>
  )
}

function WeighSheet({ formula, result }: { formula: RecipeFormula; result: ReturnType<typeof calculate> }) {
  const t = useT()
  const r = result
  const hasLevain = r.levain.total > 0
  return (
    <section className="sheet" aria-live="polite">
      <div className="sheet-head">
        <div className="small" style={{ opacity: 0.85 }}>
          {t.calc.totalDough}
        </div>
        <div className="big num">{grams(r.totalDough)} g</div>
        <div className="sub num">
          {formula.loaves} × {grams(r.doughPerLoaf)} g
        </div>
      </div>

      <div className="sheet-section">
        <h3>{t.calc.mixTitle}</h3>
        {r.mix.flours.map((x) => (
          <Line key={x.id} label={x.name || '—'} g={x.grams} />
        ))}
        <Line label={t.calc.water} g={r.mix.water} />
        {hasLevain && <Line label={t.calc.levain} sub={`${num(formula.levainHydration)}%`} g={r.levain.total} />}
        <Line label={t.calc.salt} g={r.mix.salt} />
        {r.mix.yeast > 0 && <Line label={t.calc.yeast} g={r.mix.yeast} />}
        {r.mix.inclusions.map((x) => (
          <Line key={x.id} label={x.name || '—'} g={x.grams} />
        ))}
      </div>

      {hasLevain && (
        <div className="sheet-section">
          <h3>{t.calc.levainBuildTitle}</h3>
          <p className="help" style={{ margin: 0 }}>
            {t.calc.levainBuildHelp(num(formula.levainFeedRatio, 1))}
          </p>
          <Line label={t.calc.seed} g={r.levainBuild.seed} minor />
          <Line label={t.calc.flourName} g={r.levainBuild.flour} minor />
          <Line label={t.calc.water} g={r.levainBuild.water} minor />
          <h3>{t.calc.levainContains}</h3>
          <Line label={t.calc.levainFlourIn} g={r.levain.flour} minor />
          <Line label={t.calc.levainWaterIn} g={r.levain.water} minor />
        </div>
      )}

      <div className="sheet-section">
        <h3>{t.calc.totals}</h3>
        {r.flourTotals.length > 1 &&
          r.flourTotals.map((x) => <Line key={x.id} label={x.name || '—'} g={x.grams} minor />)}
        <Line label={t.calc.totalFlour} g={r.totalFlour} minor />
        <Line label={t.calc.totalWater} sub={`${num(formula.hydration, 1)}%`} g={r.totalWater} minor />
      </div>
    </section>
  )
}
