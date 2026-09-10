// ============================================================
// ZHINO — recipes page (the two official preparation methods)
// Concise and useful: ingredients + steps, nothing more.
// ============================================================

// list + lead go through the shared services (admin overlay
// aware — identical output until an admin changes something)
import { getActiveRecipes } from '../services/recipeStore';
import { getSiteContent } from '../services/siteContent';
import type { Recipe } from '../data/recipes';
import PagePlate from '../components/PagePlate';

function RecipeCard({ recipe, index }: { recipe: Recipe; index: number }) {
  const number = String(index + 1).padStart(2, '0');
  return (
    <article className="panel-lux overflow-hidden rounded-2xl">
      <div className="flex items-start gap-4 p-6 sm:gap-6 sm:p-8">
        <span className="hidden shrink-0 font-display text-4xl leading-none text-wine-900/15 sm:block sm:text-5xl" aria-hidden="true">
          {number}
        </span>
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cream-100 to-cream-200 text-3xl ring-1 ring-espresso/8 sm:h-16 sm:w-16"
          aria-hidden="true"
        >
          {recipe.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.6rem] uppercase tracking-[0.38em] text-gold-700">
            {recipe.category === 'jelly' ? 'Jelly' : 'Custard'}
          </p>
          <h2 className="mt-2 text-lg font-bold text-wine-950 sm:text-xl">{recipe.title}</h2>
          <p className="mt-1 text-sm leading-7 text-mocha">{recipe.summary}</p>
        </div>
      </div>

      <details className="group border-t border-espresso/8" open>
        <summary className="cursor-pointer list-none px-6 py-3.5 text-sm font-bold text-wine-800 transition hover:bg-cream-100/70 sm:px-8 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between">
            مواد لازم و طرز تهیه
            <span className="text-lg leading-none text-wine-700 transition-transform duration-300 group-open:rotate-180" aria-hidden="true">▾</span>
          </span>
        </summary>
        <div className="grid gap-7 px-6 pb-8 sm:grid-cols-[0.85fr_1.15fr] sm:px-8">
          <div>
            <h3 className="kicker mb-3.5 font-display">Ingredients</h3>
            <ul className="space-y-2 border-r border-espresso/10 pr-4">
              {recipe.ingredients.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-7 text-espresso">
                  <span className="mt-[0.65rem] h-1 w-1 shrink-0 rotate-45 bg-wine-700" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="kicker mb-3.5 font-display">Method</h3>
            <ol className="space-y-3">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-7 text-espresso">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wine-900 font-display text-[0.65rem] text-cream-50">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </details>
    </article>
  );
}

export default function RecipesPage() {
  const recipes = getActiveRecipes();
  const content = getSiteContent();

  return (
    <div>
      <PagePlate
        kicker="The Recipe Notebook"
        title="دستور تهیه"
        lead={content.recipesLead}
        ghost="Recipes"
      />
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-12 sm:px-6 sm:py-14">
        {recipes.map((recipe, i) => (
          <RecipeCard key={recipe.id} recipe={recipe} index={i} />
        ))}
      </div>
    </div>
  );
}
