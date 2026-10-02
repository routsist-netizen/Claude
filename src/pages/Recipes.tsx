import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { FlourBar } from '../components/controls'
import { useData } from '../data'
import { EXAMPLE_RECIPES } from '../domain/examples'
import type { Recipe } from '../domain/types'
import { num, useT } from '../i18n'

export default function Recipes() {
  const t = useT()
  const { recipes } = useData()

  return (
    <>
      <div className="page-head">
        <h1>{t.recipes.title}</h1>
        <Link to="/recipes/new" className="btn primary">
          <Icon name="plus" />
          {t.recipes.new}
        </Link>
      </div>

      <section className="stack">
        <h2>{t.recipes.mine}</h2>
        {recipes.length === 0 ? (
          <p className="muted">{t.recipes.empty}</p>
        ) : (
          <div className="recipe-list">
            {recipes.map((r) => (
              <RecipeCard key={r.id} recipe={r} />
            ))}
          </div>
        )}

        <h2 style={{ marginTop: 16 }}>{t.recipes.examples}</h2>
        <p className="muted small" style={{ marginTop: -8 }}>
          {t.recipes.examplesHint}
        </p>
        <div className="recipe-list">
          {EXAMPLE_RECIPES.map((r) => (
            <RecipeCard key={r.id} recipe={r} />
          ))}
        </div>
      </section>
    </>
  )
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const t = useT()
  const f = recipe.formula
  return (
    <Link to={`/recipes/${recipe.id}`} className="card recipe-card">
      {recipe.isExample && <span className="badge">{t.common.example}</span>}
      <h3>{recipe.name}</h3>
      <div className="muted small num">{t.recipes.summary(f.loaves, num(f.loafWeight), num(f.hydration, 1))}</div>
      {recipe.description && (
        <p className="small" style={{ marginTop: 8, marginBottom: 0 }}>
          {recipe.description}
        </p>
      )}
      <FlourBar flours={f.flours} />
    </Link>
  )
}
