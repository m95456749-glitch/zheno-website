// ============================================================
// ZHINO — recipes page (data-driven from src/data/recipes.ts)
// ============================================================

import { RECIPES } from '../data/recipes';
import type { Recipe } from '../data/recipes';
import { cn } from '../utils/cn';

const DIFFICULTY_STYLE: Record<Recipe['difficulty'], string> = {
  'آسان': 'bg-emerald-100 text-emerald-800',
  'متوسط': 'bg-amber-100 text-amber-800',
  'حرفه‌ای': 'bg-rose-100 text-rose-800',
};

function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <article className="overflow-hidden rounded-3xl bg-white shadow-md shadow-stone-200/60">
      <div className="flex items-center gap-4 p-5 sm:p-6">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-4xl" aria-hidden="true">
          {recipe.emoji}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-black text-slate-900">{recipe.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{recipe.subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              {recipe.category === 'jelly' ? 'پودر ژله' : 'پودر کاستارد'}
            </span>
            <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-bold', DIFFICULTY_STYLE[recipe.difficulty])}>
              {recipe.difficulty}
            </span>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              {recipe.duration}
            </span>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
              {recipe.servings}
            </span>
          </div>
        </div>
      </div>

      <details className="group border-t border-stone-100" open>
        <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-extrabold text-amber-700 transition hover:bg-amber-50/50 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between">
            مواد لازم و طرز تهیه
            <span className="text-lg leading-none transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
          </span>
        </summary>
        <div className="space-y-5 px-5 pb-6 sm:px-6">
          <div>
            <h3 className="mb-2 text-xs font-extrabold text-slate-500">مواد لازم</h3>
            <ul className="space-y-1.5">
              {recipe.ingredients.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-7 text-slate-700">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-extrabold text-slate-500">طرز تهیه</h3>
            <ol className="space-y-2.5">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-7 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-black text-white">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          {recipe.tip && (
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-800">
              <span className="font-black">نکته ژینو: </span>
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
    <div className="mx-auto max-w-4xl px-4 pt-10 sm:px-6">
      <div className="animate-fade-up text-center">
        <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">دستورهای خوشمزه ژینو</h1>
        <p className="mt-2 text-sm leading-7 text-slate-500">
          با پودر ژله و کاستارد ژینو، دسرهایی درست کنید که همه را شگفت‌زده کند.
        </p>
      </div>
      <div className="mt-8 space-y-5">
        {RECIPES.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </div>
  );
}
