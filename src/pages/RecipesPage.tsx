// ============================================================
// ZHINO — recipes page (data-driven from src/data/recipes.ts)
// Editorial presentation: numbered spread, quiet chrome.
// ============================================================

import { RECIPES } from '../data/recipes';
import type { Recipe } from '../data/recipes';
import { cn } from '../utils/cn';

const DIFFICULTY_STYLE: Record<Recipe['difficulty'], string> = {
  'آسان': 'text-emerald-800 bg-emerald-50 ring-emerald-200/70',
  'متوسط': 'text-gold-700 bg-gold-400/15 ring-gold-500/30',
  'حرفه‌ای': 'text-wine-800 bg-wine-900/5 ring-wine-700/25',
};

function RecipeCard({ recipe, index }: { recipe: Recipe; index: number }) {
  const number = String(index + 1).padStart(2, '0');
  return (
    <article className="panel-lux overflow-hidden rounded-2xl">
      <div className="flex items-start gap-4 p-6 sm:gap-6 sm:p-8">
        <span className="hidden shrink-0 font-display text-4xl leading-none text-gold-500/60 sm:block sm:text-5xl" aria-hidden="true">
          {number}
        </span>
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cream-100 to-cream-200 text-4xl ring-1 ring-gold-500/25 sm:h-20 sm:w-20 sm:text-5xl"
          aria-hidden="true"
        >
          {recipe.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.6rem] uppercase tracking-[0.38em] text-gold-700">
            {recipe.category === 'jelly' ? 'Jelly Dessert' : 'Custard Dessert'}
          </p>
          <h2 className="mt-2 text-lg font-bold text-wine-950 sm:text-xl">{recipe.title}</h2>
          <p className="mt-1 text-sm text-mocha">{recipe.subtitle}</p>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-cream-100 px-2.5 py-1 text-[0.68rem] font-semibold text-espresso ring-1 ring-espresso/8">
              {recipe.duration}
            </span>
            <span className="rounded-md bg-cream-100 px-2.5 py-1 text-[0.68rem] font-semibold text-espresso ring-1 ring-espresso/8">
              {recipe.servings}
            </span>
            <span className={cn('rounded-md px-2.5 py-1 text-[0.68rem] font-semibold ring-1', DIFFICULTY_STYLE[recipe.difficulty])}>
              {recipe.difficulty}
            </span>
          </div>
        </div>
      </div>

      <details className="group border-t border-espresso/8" open>
        <summary className="cursor-pointer list-none px-6 py-3.5 text-sm font-bold text-wine-800 transition hover:bg-cream-100/70 sm:px-8 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between">
            مواد لازم و طرز تهیه
            <span className="text-lg leading-none text-gold-700 transition-transform duration-300 group-open:rotate-180" aria-hidden="true">▾</span>
          </span>
        </summary>
        <div className="grid gap-7 px-6 pb-8 sm:grid-cols-[0.85fr_1.15fr] sm:px-8">
          <div>
            <h3 className="kicker mb-3.5 font-display">Ingredients</h3>
            <ul className="space-y-2 border-r border-espresso/10 pr-4">
              {recipe.ingredients.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm leading-7 text-espresso">
                  <span className="mt-[0.65rem] h-1 w-1 shrink-0 rotate-45 bg-gold-500" aria-hidden="true" />
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
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wine-900 font-display text-[0.65rem] text-gold-300">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          {recipe.tip && (
            <p className="rounded-xl bg-gold-400/12 px-5 py-4 text-[0.8rem] leading-7 text-wine-900 ring-1 ring-gold-500/30 sm:col-span-2">
              <span className="font-bold">نکته ژینو: </span>
              {recipe.tip}
            </p>
          )}
        </div>
      </details>
    </article>
  );
}

export default function RecipesPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 pt-14 sm:px-6">
      <div className="animate-fade-up text-center">
        <p className="kicker font-display">The Recipe Notebook</p>
        <h1 className="mt-4 text-3xl font-bold text-wine-950 sm:text-4xl">دستورهای خوشمزه ژینو</h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-8 text-mocha">
          با پودر ژله و کاستارد ژینو، دسرهایی درست کنید که همه را شگفت‌زده کند.
        </p>
        <span className="rule-lux mt-6" aria-hidden="true" />
      </div>
      <div className="mt-10 space-y-6">
        {RECIPES.map((recipe, i) => (
          <RecipeCard key={recipe.id} recipe={recipe} index={i} />
        ))}
      </div>
    </div>
  );
}
