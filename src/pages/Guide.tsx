import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Notice, NumberField, Segmented } from '../components/controls'
import { useData } from '../data'
import { buildGuide, type GuideLine } from '../domain/guide'
import { MIXINGS, methodToParams, sanitizeMethod, VESSELS, type BakeMethod, type Mixing, type Vessel } from '../domain/method'
import type { ProofMode, Recipe } from '../domain/types'
import { duration, grams, num, useT } from '../i18n'
import { usePref } from '../prefs'

export default function GuidePage() {
  const t = useT()
  const { allRecipes, findRecipe } = useData()
  const [params, setParams] = useSearchParams()
  const recipe = findRecipe(params.get('recipe')) ?? allRecipes[0]
  if (!recipe) return <Notice>{t.schedule.noRecipes}</Notice>
  return (
    <GuideView
      key={recipe.id}
      recipe={recipe}
      recipes={allRecipes}
      onPick={(id) => setParams({ recipe: id }, { replace: true })}
    />
  )
}

type Usual = Pick<BakeMethod, 'vessel' | 'mixing' | 'fan'>

function GuideView({ recipe, recipes, onPick }: { recipe: Recipe; recipes: Recipe[]; onPick: (id: string) => void }) {
  const t = useT()
  // The usual vessel, mixing and oven are remembered on this device; the proof follows each recipe.
  const [usual, setUsual] = usePref<Usual>('method', { vessel: 'dutch', mixing: 'hand', fan: false })
  const [kitchenTemp, setKitchenTemp] = usePref<number>('kitchenTemp', 22)
  const [proofMode, setProofMode] = useState<ProofMode>(recipe.schedule.proofMode)
  const [done, setDone] = usePref<string[]>(`guideDone.${recipe.id}`, [])

  const method: BakeMethod = { ...sanitizeMethod(usual), proofMode }
  const guide = useMemo(() => buildGuide(recipe, method, kitchenTemp), [recipe, method.vessel, method.mixing, method.fan, method.proofMode, kitchenTemp]) // eslint-disable-line react-hooks/exhaustive-deps
  const fmt = { dur: duration, n: num, g: grams }

  const toggle = (id: string) => setDone(done.includes(id) ? done.filter((x) => x !== id) : [...done, id])
  const doneCount = guide.steps.filter((s) => done.includes(s.id)).length
  const planParams = new URLSearchParams({ recipe: recipe.id, ...methodToParams(method) })

  const lineName = (l: GuideLine) => {
    switch (l.kind) {
      case 'seed':
        return t.guide.lineNames.seed
      case 'levainFlour':
        return l.name || t.guide.lineNames.flour
      case 'water':
        return t.calc.water
      case 'levain':
        return t.calc.levain
      case 'salt':
        return t.calc.salt
      case 'yeast':
        return t.calc.yeast
      default:
        return l.name || '—'
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>{t.guide.title}</h1>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        {t.guide.intro}
      </p>

      <div className="grid-2">
        <div className="stack sticky-col">
          <section className="card fields">
            <div className="field">
              <label htmlFor="grecipe">{t.schedule.recipe}</label>
              <select id="grecipe" className="input" value={recipe.id} onChange={(e) => onPick(e.target.value)}>
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.isExample ? ` · ${t.common.example}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <h2 className="card-title" style={{ margin: '4px 0 0' }}>
              <Icon name="flame" />
              {t.guide.questions}
            </h2>

            <div className="field">
              <label htmlFor="gvessel">{t.guide.vessel}</label>
              <select
                id="gvessel"
                className="input"
                value={method.vessel}
                onChange={(e) => setUsual({ ...usual, vessel: e.target.value as Vessel })}
              >
                {VESSELS.map((v) => (
                  <option key={v} value={v}>
                    {t.guide.vessels[v].name}
                  </option>
                ))}
              </select>
              <div className="help">{t.guide.vessels[method.vessel].help}</div>
            </div>

            <div className="field">
              <label htmlFor="gmixing">{t.guide.mixing}</label>
              <select
                id="gmixing"
                className="input"
                value={method.mixing}
                onChange={(e) => setUsual({ ...usual, mixing: e.target.value as Mixing })}
              >
                {MIXINGS.map((m) => (
                  <option key={m} value={m}>
                    {t.guide.mixings[m].name}
                  </option>
                ))}
              </select>
              <div className="help">{t.guide.mixings[method.mixing].help}</div>
            </div>

            <div className="field">
              <span className="field-label">{t.guide.oven}</span>
              <Segmented<'static' | 'fan'>
                label={t.guide.oven}
                value={method.fan ? 'fan' : 'static'}
                onChange={(v) => setUsual({ ...usual, fan: v === 'fan' })}
                options={[
                  { value: 'static', label: t.guide.ovens.static },
                  { value: 'fan', label: t.guide.ovens.fan },
                ]}
              />
              <div className="help">{t.guide.ovenHelp}</div>
            </div>

            <div className="field">
              <span className="field-label">{t.schedule.proofMode}</span>
              <Segmented<ProofMode>
                label={t.schedule.proofMode}
                value={proofMode}
                onChange={setProofMode}
                options={[
                  { value: 'room', label: t.schedule.proofRoom },
                  { value: 'cold', label: t.schedule.proofCold },
                ]}
              />
            </div>

            <NumberField
              label={t.schedule.kitchenTemp}
              value={kitchenTemp}
              unit="°C"
              step={0.5}
              min={5}
              max={40}
              onChange={setKitchenTemp}
            />
          </section>
        </div>

        <div className="stack">
          {!guide.ok && <Notice kind="error">{t.guide.badRecipe}</Notice>}

          <div>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong className="num">{t.guide.progress(doneCount, guide.steps.length)}</strong>
              {doneCount > 0 && (
                <button className="btn ghost small" onClick={() => setDone([])}>
                  {t.guide.reset}
                </button>
              )}
            </div>
            <div className="guide-progress" aria-hidden="true">
              <span style={{ width: `${(doneCount / guide.steps.length) * 100}%` }} />
            </div>
            {doneCount === guide.steps.length && <p style={{ marginTop: 8 }}>{t.guide.allDone}</p>}
          </div>

          <ol className="guide-steps">
            {guide.steps.map((s, i) => {
              const isDone = done.includes(s.id)
              const text = t.guide.steps[s.id](guide, s, fmt)
              return (
                <li key={s.id} className={`guide-step ${isDone ? 'done' : ''}`}>
                  <button
                    type="button"
                    className="guide-check"
                    aria-pressed={isDone}
                    aria-label={`${t.steps[s.id]}: ${isDone ? t.guide.markUndone : t.guide.markDone}`}
                    onClick={() => toggle(s.id)}
                  >
                    <Icon name="check" />
                  </button>
                  <div className="guide-head">
                    <h2>
                      {i + 1}. {t.steps[s.id]}
                    </h2>
                    {s.minutes > 0 && <span className="badge plain num">{t.guide.approx(duration(s.minutes))}</span>}
                  </div>
                  {!isDone && (
                    <div className="guide-more">
                      {s.lines.length > 0 && (
                        <div className="guide-weigh">
                          <h3>{t.guide.weigh}</h3>
                          {s.lines.map((l, j) => (
                            <div className="line minor" key={j}>
                              <span className="label">{lineName(l)}</span>
                              <span className="grams">{grams(l.grams)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {text.body.map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                      {text.tip && (
                        <div className="guide-tip">
                          <Icon name="info" />
                          <span>{text.tip}</span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>

          <section className="card stack" style={{ gap: 10 }}>
            <p className="help" style={{ margin: 0 }}>
              {t.guide.planHelp}
            </p>
            <div className="row">
              <Link to={`/schedule?${planParams}`} className="btn primary">
                <Icon name="clock" />
                {t.guide.planIt}
              </Link>
              <Link to={`/recipes/${recipe.id}`} className="btn ghost small">
                <Icon name="scale" />
                {recipe.name}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
