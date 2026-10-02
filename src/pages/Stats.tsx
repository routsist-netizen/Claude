import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Stars } from '../components/controls'
import { useData } from '../data'
import {
  averageRating,
  correlation,
  filterBakes,
  metricValue,
  METRICS,
  points,
  strength,
  type Metric,
  type Point,
} from '../domain/stats'
import { date, duration, num, useT } from '../i18n'

export default function Stats() {
  const t = useT()
  const { bakes, allRecipes } = useData()
  const [recipeId, setRecipeId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [metric, setMetric] = useState<Metric>('bulkHours')

  const list = useMemo(
    () => filterBakes(bakes, { recipeId: recipeId || undefined, from: from || undefined, to: to || undefined }),
    [bakes, recipeId, from, to],
  )
  const pts = useMemo(() => points(list, metric), [list, metric])
  const r = correlation(pts)
  const usedRecipes = allRecipes.filter((x) => bakes.some((b) => b.recipeId === x.id))

  const avg = (m: Metric) => {
    const vals = list.map((b) => metricValue(b, m)).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  }
  const avgRating = averageRating(list)
  const avgBulk = avg('bulkHours')
  const avgHydration = avg('hydration')

  const s = strength(r)
  const trendText = s === 'none' ? t.stats.trend.none : t.stats.trend[s]((r ?? 0) > 0)

  return (
    <>
      <div className="page-head">
        <h1>{t.stats.title}</h1>
      </div>

      {bakes.length === 0 ? (
        <p className="muted">{t.stats.empty}</p>
      ) : (
        <div className="stack">
          {/* Filters: one row, above everything they scope. */}
          <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="field">
              <label htmlFor="st-recipe">{t.schedule.recipe}</label>
              <select id="st-recipe" className="input" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
                <option value="">{t.journal.allRecipes}</option>
                {usedRecipes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="st-from">{t.stats.from}</label>
              <input id="st-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="st-to">{t.stats.to}</label>
              <input id="st-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <div className="tiles">
            <div className="tile">
              <div className="v">{list.length}</div>
              <div className="k">{t.stats.count}</div>
            </div>
            <div className="tile">
              <div className="v">{avgRating === null ? '–' : num(avgRating, 1)}</div>
              <div className="k">{t.stats.avgRating}</div>
            </div>
            <div className="tile">
              <div className="v">{avgBulk === null ? '–' : duration(avgBulk * 60)}</div>
              <div className="k">{t.stats.avgBulk}</div>
            </div>
            <div className="tile">
              <div className="v">{avgHydration === null ? '–' : `${num(avgHydration, 1)}%`}</div>
              <div className="k">{t.stats.avgHydration}</div>
            </div>
          </div>

          <section className="card stack" style={{ gap: 12 }}>
            <h2 className="card-title" style={{ marginBottom: 0 }}>
              {t.stats.vsRating}
            </h2>
            <select
              className="input"
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              aria-label={t.stats.vsRating}
            >
              {METRICS.map((m) => (
                <option key={m} value={m}>
                  {t.stats.metrics[m]}
                </option>
              ))}
            </select>
            {pts.length < 3 ? (
              <p className="muted">{t.stats.needMore}</p>
            ) : (
              <>
                <Scatter points={pts} xLabel={t.stats.metrics[metric]} yLabel={t.stats.rating} r={r} />
                <p style={{ margin: 0 }}>
                  <strong>{trendText}</strong>{' '}
                  {r !== null && <span className="muted num">(r = {num(r, 2)})</span>}
                </p>
                <p className="help" style={{ margin: 0 }}>
                  {t.stats.caveat}
                </p>
              </>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">{t.stats.list}</h2>
            <BakeTable bakes={list} metric={metric} />
          </section>
        </div>
      )}
    </>
  )
}

const W = 560
const H = 300
const PAD = { l: 40, r: 16, t: 12, b: 44 }

/** Rating (1–5) against one metric, with a least-squares trend line and per-dot tooltips. */
function Scatter({ points: pts, xLabel, yLabel, r }: { points: Point[]; xLabel: string; yLabel: string; r: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  const xs = pts.map((p) => p.x)
  let x0 = Math.min(...xs)
  let x1 = Math.max(...xs)
  if (x0 === x1) {
    x0 -= 1
    x1 += 1
  }
  const pad = (x1 - x0) * 0.08
  x0 -= pad
  x1 += pad
  const sx = (x: number) => PAD.l + ((x - x0) / (x1 - x0)) * (W - PAD.l - PAD.r)
  const sy = (y: number) => PAD.t + ((5.4 - y) / 4.8) * (H - PAD.t - PAD.b)

  // Least squares line, only drawn when there is a visible relationship.
  let trend: [number, number, number, number] | null = null
  if (r !== null && Math.abs(r) >= 0.2) {
    const n = pts.length
    const mx = xs.reduce((s, v) => s + v, 0) / n
    const my = pts.reduce((s, p) => s + p.y, 0) / n
    const slope =
      pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / pts.reduce((s, p) => s + (p.x - mx) ** 2, 0)
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    const clampY = (y: number) => Math.max(1, Math.min(5, y))
    trend = [sx(lo), sy(clampY(my + slope * (lo - mx))), sx(hi), sy(clampY(my + slope * (hi - mx)))]
  }

  // Nice-ish x ticks.
  const ticks: number[] = []
  const rawStep = (x1 - x0) / 5
  const mag = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? rawStep
  for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) ticks.push(Number(v.toFixed(6)))

  // Tiny vertical jitter so equal ratings at equal x don't hide each other.
  const seen = new Map<string, number>()
  const placed = pts.map((p) => {
    const k = `${p.x.toFixed(2)}|${p.y}`
    const i = seen.get(k) ?? 0
    seen.set(k, i + 1)
    return { ...p, cx: sx(p.x) + i * 6, cy: sy(p.y) }
  })
  const h = hover !== null ? placed[hover] : null

  return (
    <div className="chart" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} / ${xLabel}`}>
        {[1, 2, 3, 4, 5].map((y) => (
          <g key={y}>
            <line className="grid" x1={PAD.l} x2={W - PAD.r} y1={sy(y)} y2={sy(y)} />
            <text x={PAD.l - 10} y={sy(y) + 4} textAnchor="end">
              {y}★
            </text>
          </g>
        ))}
        <line className="axis" x1={PAD.l} x2={W - PAD.r} y1={H - PAD.b} y2={H - PAD.b} />
        {ticks.map((v) => (
          <text key={v} x={sx(v)} y={H - PAD.b + 18} textAnchor="middle">
            {num(v, 1)}
          </text>
        ))}
        <text x={(PAD.l + W - PAD.r) / 2} y={H - 6} textAnchor="middle">
          {xLabel}
        </text>
        {trend && <line className="trend" x1={trend[0]} y1={trend[1]} x2={trend[2]} y2={trend[3]} />}
        {placed.map((p, i) => (
          <g key={p.id}>
            <circle className="pt" cx={p.cx} cy={p.cy} r={hover === i ? 9 : 7} />
            {/* Hit target well beyond the dot, reachable by keyboard too. */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={16}
              fill="transparent"
              tabIndex={0}
              aria-label={`${p.label}: ${num(p.x, 1)}, ${p.y}★`}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => setHover(i)}
            />
          </g>
        ))}
      </svg>
      {h && (
        <div
          className="chart-tip"
          style={{ left: `${(h.cx / W) * 100}%`, top: `${(h.cy / H) * 100}%` }}
          role="status"
        >
          <strong className="num">
            {num(h.x, 1)} · {h.y}★
          </strong>
          <span>{h.label}</span>
        </div>
      )}
    </div>
  )
}

function BakeTable({ bakes, metric }: { bakes: ReturnType<typeof filterBakes>; metric: Metric }) {
  const t = useT()
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t.journal.date}</th>
            <th>{t.journal.bake}</th>
            <th className="r">{t.stats.metrics[metric]}</th>
            <th>{t.journal.rating}</th>
          </tr>
        </thead>
        <tbody>
          {bakes.map((b) => {
            const v = metricValue(b, metric)
            return (
              <tr key={b.id}>
                <td className="num">{date(new Date(b.date))}</td>
                <td>
                  <Link to={`/journal/${b.id}`}>{b.recipeName}</Link>
                </td>
                <td className="r num">{v === null ? '–' : num(v, 1)}</td>
                <td>
                  <Stars value={b.rating} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

