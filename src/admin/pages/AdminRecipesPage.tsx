// ============================================================
// ZHINO — admin: recipe content
// Edit/add/remove recipe content (the two official methods are
// the default and stay intact; «بازنشانی» restores them).
// Changes flow to the site's recipes pages via
// src/services/recipeStore.ts.
// UI: one primary action («افزودن دستور») + small labeled
// «ویرایش» / «حذف» buttons per recipe.
// ============================================================

import { useState } from 'react';
import type { Recipe } from '../../data/recipes';
import {
  removeRecipe,
  resetRecipes,
  useActiveRecipes,
  upsertRecipe,
} from '../../services/recipeStore';
import type { ProductCategory } from '../../types';
import { Field, SavedFlash } from '../components/ui';
import { IconPlus } from '../Icons';
import { cn } from '../../utils/cn';

interface RecipeFormState {
  title: string;
  summary: string;
  emoji: string;
  category: ProductCategory;
  ingredients: string; // one per line
  steps: string; // one per line
}

export default function AdminRecipesPage() {
  const recipes = useActiveRecipes();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      {/* toolbar — one primary action + one quiet reset */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[0.78rem] leading-6 text-mocha">
          تغییرات بلافاصله در بخش «دستور تهیه» سایت (همین مرورگر) اعمال می‌شود.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('همه تغییرات دستورها به حالت اولیه بازگردد؟')) {
                resetRecipes();
                flashSaved();
              }
            }}
            className="text-[0.72rem] font-bold text-mocha-light underline-offset-4 transition hover:text-wine-900 hover:underline"
          >
            بازنشانی
          </button>
          <button
            type="button"
            onClick={() => setEditingId('new')}
            className="btn-lux btn-wine !px-5 !py-2.5 text-[0.85rem]"
          >
            <IconPlus className="h-4 w-4" />
            افزودن دستور
          </button>
        </div>
      </div>

      <SavedFlash show={saved} />

      {editingId === 'new' && (
        <RecipeForm
          recipe={null}
          onDone={() => {
            setEditingId(null);
            flashSaved();
          }}
        />
      )}

      <ul className="space-y-4">
        {recipes.map((recipe) =>
          editingId === recipe.id ? (
            <li key={recipe.id}>
              <RecipeForm
                recipe={recipe}
                onDone={() => {
                  setEditingId(null);
                  flashSaved();
                }}
              />
            </li>
          ) : (
            <li key={recipe.id} className="panel-lux rounded-2xl p-5 sm:p-6">
              <div className="flex items-start gap-4">
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cream-100 to-cream-200 text-2xl ring-1 ring-espresso/8"
                  aria-hidden="true"
                >
                  {recipe.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[0.95rem] font-bold text-wine-950">{recipe.title}</h2>
                    <span className="adm-badge adm-badge-ghost">
                      {recipe.category === 'jelly' ? 'پودر ژله' : 'پودر کاستر'}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.75rem] leading-6 text-mocha">{recipe.summary}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(recipe.id)}
                    className="adm-btn-sm"
                  >
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`دستور «${recipe.title}» حذف شود؟`)) {
                        void removeRecipe(recipe.id).catch(() => window.alert('حذف دستور در پایگاه داده ممکن نشد.'));
                      }
                    }}
                    className="adm-btn-sm adm-btn-sm-danger"
                  >
                    حذف
                  </button>
                </div>
              </div>
            </li>
          ),
        )}
      </ul>

      {recipes.length === 0 && (
        <div className="panel-lux rounded-2xl p-12 text-center">
          <p className="text-sm font-bold text-wine-950">دستوری وجود ندارد.</p>
          <p className="mt-2 text-[0.78rem] leading-7 text-mocha">
            دو دستور رسمی ژله و کاستر به‌عنوان پیش‌فرض نگهداری می‌شوند؛ با «بازنشانی» برمی‌گردند.
          </p>
        </div>
      )}
    </div>
  );
}

function RecipeForm({ recipe, onDone }: { recipe: Recipe | null; onDone: () => void }) {
  const [form, setForm] = useState<RecipeFormState>(() =>
    recipe
      ? {
          title: recipe.title,
          summary: recipe.summary,
          emoji: recipe.emoji,
          category: recipe.category,
          ingredients: recipe.ingredients.join('\n'),
          steps: recipe.steps.join('\n'),
        }
      : { title: '', summary: '', emoji: '🍮', category: 'jelly', ingredients: '', steps: '' },
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const title = form.title.trim();
    const ingredients = form.ingredients.split('\n').map((s) => s.trim()).filter(Boolean);
    const steps = form.steps.split('\n').map((s) => s.trim()).filter(Boolean);
    if (title.length < 3) {
      setError('عنوان دستور را کامل وارد کنید.');
      return;
    }
    if (ingredients.length === 0) {
      setError('حداقل یک ماده لازم (هر ماده در یک خط) وارد کنید.');
      return;
    }
    if (steps.length === 0) {
      setError('حداقل یک مرحله (هر مرحله در یک خط) وارد کنید.');
      return;
    }
    try {
      await upsertRecipe({
        id: recipe?.id ?? `recipe-${Date.now().toString(36)}`,
        title,
        summary: form.summary.trim() || title,
        emoji: form.emoji.trim() || '🍮',
        category: form.category,
        ingredients,
        steps,
      });
      onDone();
    } catch {
      setError('ذخیره دستور در پایگاه داده ممکن نشد.');
    }
  };

  return (
    <div className="panel-lux rounded-2xl p-5 sm:p-6">
      <h2 className="mb-4 text-[0.95rem] font-bold text-wine-950">
        {recipe ? `ویرایش: ${recipe.title}` : 'دستور جدید'}
      </h2>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
          <Field label="عنوان دستور">
            <input
              className="adm-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="دستور تهیه ژله"
            />
          </Field>
          <Field label="نماد">
            <input
              className="adm-input text-center"
              value={form.emoji}
              onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
              maxLength={4}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="خلاصه (خط مواد روی کارت)">
            <input
              className="adm-input"
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              placeholder="۳ قاشق پودر ژله + ۱.۵ لیوان آب"
            />
          </Field>
          <Field label="دسته‌بندی">
            <select
              className="adm-input"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ProductCategory }))}
            >
              <option value="jelly">پودر ژله</option>
              <option value="custard">پودر کاستر</option>
            </select>
          </Field>
        </div>
        <Field label="مواد لازم" hint="هر ماده در یک خط.">
          <textarea
            rows={4}
            className={cn('adm-input resize-none')}
            value={form.ingredients}
            onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))}
            placeholder={'۳ قاشق پودر ژله ژینو\n۱.۵ لیوان آب'}
          />
        </Field>
        <Field label="مراحل تهیه" hint="هر مرحله در یک خط.">
          <textarea
            rows={5}
            className={cn('adm-input resize-none')}
            value={form.steps}
            onChange={(e) => setForm((f) => ({ ...f, steps: e.target.value }))}
            placeholder={'پودر ژله و آب را با هم مخلوط کنید.\nروی حرارت قرار دهید تا به جوش آید.'}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-xs font-bold leading-6 text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={submit} className="btn-lux btn-wine flex-1 rounded-xl">
            {recipe ? 'ذخیره تغییرات' : 'افزودن دستور'}
          </button>
          <button type="button" onClick={onDone} className="btn-lux btn-line-dark rounded-xl">
            انصراف
          </button>
        </div>
      </div>
    </div>
  );
}
