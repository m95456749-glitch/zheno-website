// ============================================================
// ZHINO — Recipe Data (official on-pack instructions)
// Only the two official preparation methods — nothing invented.
// ============================================================

export interface Recipe {
  id: string;
  title: string;
  /** short factual summary shown on cards (ingredient line) */
  summary: string;
  category: 'jelly' | 'custard';
  ingredients: string[];
  steps: string[];
  emoji: string;
}

export const RECIPES: Recipe[] = [
  {
    id: 'jelly-basic',
    title: 'دستور تهیه ژله',
    summary: '۳ قاشق پودر ژله + ۱.۵ لیوان آب',
    category: 'jelly',
    emoji: '🍮',
    ingredients: ['۳ قاشق پودر ژله ژینو', '۱.۵ لیوان آب'],
    steps: [
      'پودر ژله و آب را با هم مخلوط کنید.',
      'روی حرارت قرار دهید تا به جوش آید، سپس از حرارت بردارید و اجازه دهید خنک شود.',
      'در ظرف دلخواه بریزید و در یخچال قرار دهید.',
    ],
  },
  {
    id: 'custard-basic',
    title: 'دستور تهیه کاستر',
    summary: '۱ قاشق پودر کاستر + ۱ لیوان شیر + ۲ قاشق شکر',
    category: 'custard',
    emoji: '🥛',
    ingredients: ['۱ قاشق پودر کاستر ژینو', '۱ لیوان شیر', '۲ قاشق شکر'],
    steps: [
      'پودر کاستر، شیر و شکر را با هم مخلوط کنید.',
      'روی حرارت قرار دهید تا غلیظ شود.',
      'در ظرف دلخواه بریزید.',
    ],
  },
];
