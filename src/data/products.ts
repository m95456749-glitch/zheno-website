// ============================================================
// ZHINO — Centralized Product Data
// Future: replace with API calls to backend
// ============================================================

import type { Product, Flavor, FlavorId } from '../types';

export const FLAVORS: Record<FlavorId, Flavor> = {
  // Jelly Flavors
  pomegranate: {
    id: 'pomegranate',
    name: 'انار',
    color: '#8B1A1A',
    emoji: '🫐',
    category: 'jelly',
  },
  'strawberry-j': {
    id: 'strawberry-j',
    name: 'توت فرنگی',
    color: '#C0392B',
    emoji: '🍓',
    category: 'jelly',
  },
  peach: {
    id: 'peach',
    name: 'هلو',
    color: '#E8956D',
    emoji: '🍑',
    category: 'jelly',
  },
  raspberry: {
    id: 'raspberry',
    name: 'تمشک',
    color: '#A93160',
    emoji: '🍇',
    category: 'jelly',
  },
  blueberry: {
    id: 'blueberry',
    name: 'بلوبری',
    color: '#3B3F8C',
    emoji: '🫐',
    category: 'jelly',
  },
  'orange-j': {
    id: 'orange-j',
    name: 'پرتقال',
    color: '#D4622A',
    emoji: '🍊',
    category: 'jelly',
  },
  pineapple: {
    id: 'pineapple',
    name: 'آناناس',
    color: '#B5911A',
    emoji: '🍍',
    category: 'jelly',
  },
  'sour-cherry': {
    id: 'sour-cherry',
    name: 'آلبالو',
    color: '#7B1C3E',
    emoji: '🍒',
    category: 'jelly',
  },
  // Custard Flavors
  banana: {
    id: 'banana',
    name: 'موز',
    color: '#B8961A',
    emoji: '🍌',
    category: 'custard',
  },
  cantaloupe: {
    id: 'cantaloupe',
    name: 'طالبی',
    color: '#C9844A',
    emoji: '🍈',
    category: 'custard',
  },
  'strawberry-c': {
    id: 'strawberry-c',
    name: 'توت فرنگی',
    color: '#C0392B',
    emoji: '🍓',
    category: 'custard',
  },
  chocolate: {
    id: 'chocolate',
    name: 'کاکائو',
    color: '#5C3317',
    emoji: '🍫',
    category: 'custard',
  },
  'seven-fruit': {
    id: 'seven-fruit',
    name: 'هفت میوه',
    color: '#7A5C8A',
    emoji: '🍭',
    category: 'custard',
  },
  'orange-c': {
    id: 'orange-c',
    name: 'پرتقال',
    color: '#D4622A',
    emoji: '🍊',
    category: 'custard',
  },
  'mahlab-vanilla': {
    id: 'mahlab-vanilla',
    name: 'محلبی وانیلی',
    color: '#C8A96E',
    emoji: '✨',
    category: 'custard',
  },
};

export const PRODUCTS: Product[] = [
  // ────────────────────────────────────────
  // JELLY POWDER — پودر ژله
  // ────────────────────────────────────────
  {
    id: 'jelly-pomegranate',
    category: 'jelly',
    flavorId: 'pomegranate',
    name: 'پودر ژله انار ژینو',
    shortName: 'ژله انار',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-pomegranate-250',
        productId: 'jelly-pomegranate',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-POM-250',
        stock: 50,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-strawberry',
    category: 'jelly',
    flavorId: 'strawberry-j',
    name: 'پودر ژله توت فرنگی ژینو',
    shortName: 'ژله توت فرنگی',
    categoryLabel: 'پودر ژله',
    featured: true,
    variants: [
      {
        id: 'jelly-strawberry-250',
        productId: 'jelly-strawberry',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-STR-250',
        stock: 80,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-peach',
    category: 'jelly',
    flavorId: 'peach',
    name: 'پودر ژله هلو ژینو',
    shortName: 'ژله هلو',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-peach-250',
        productId: 'jelly-peach',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-PCH-250',
        stock: 60,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-raspberry',
    category: 'jelly',
    flavorId: 'raspberry',
    name: 'پودر ژله تمشک ژینو',
    shortName: 'ژله تمشک',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-raspberry-250',
        productId: 'jelly-raspberry',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-RAS-250',
        stock: 45,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-blueberry',
    category: 'jelly',
    flavorId: 'blueberry',
    name: 'پودر ژله بلوبری ژینو',
    shortName: 'ژله بلوبری',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-blueberry-250',
        productId: 'jelly-blueberry',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-BLU-250',
        stock: 35,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-orange',
    category: 'jelly',
    flavorId: 'orange-j',
    name: 'پودر ژله پرتقال ژینو',
    shortName: 'ژله پرتقال',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-orange-250',
        productId: 'jelly-orange',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-ORN-250',
        stock: 55,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-pineapple',
    category: 'jelly',
    flavorId: 'pineapple',
    name: 'پودر ژله آناناس ژینو',
    shortName: 'ژله آناناس',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-pineapple-250',
        productId: 'jelly-pineapple',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-PIN-250',
        stock: 40,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-sour-cherry',
    category: 'jelly',
    flavorId: 'sour-cherry',
    name: 'پودر ژله آلبالو ژینو',
    shortName: 'ژله آلبالو',
    categoryLabel: 'پودر ژله',
    variants: [
      {
        id: 'jelly-sour-cherry-250',
        productId: 'jelly-sour-cherry',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-SCH-250',
        stock: 30,
        available: true,
      },
    ],
  },

  // ────────────────────────────────────────
  // CUSTARD POWDER — پودر کاستر
  // ────────────────────────────────────────
  {
    id: 'custard-banana',
    category: 'custard',
    flavorId: 'banana',
    name: 'پودر کاستر موز ژینو',
    shortName: 'کاستر موز',
    categoryLabel: 'پودر کاستر',
    featured: true,
    variants: [
      {
        id: 'custard-banana-250',
        productId: 'custard-banana',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-BAN-250',
        stock: 70,
        available: true,
      },
    ],
  },
  {
    id: 'custard-cantaloupe',
    category: 'custard',
    flavorId: 'cantaloupe',
    name: 'پودر کاستر طالبی ژینو',
    shortName: 'کاستر طالبی',
    categoryLabel: 'پودر کاستر',
    variants: [
      {
        id: 'custard-cantaloupe-250',
        productId: 'custard-cantaloupe',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-CAN-250',
        stock: 45,
        available: true,
      },
    ],
  },
  {
    id: 'custard-strawberry',
    category: 'custard',
    flavorId: 'strawberry-c',
    name: 'پودر کاستر توت فرنگی ژینو',
    shortName: 'کاستر توت فرنگی',
    categoryLabel: 'پودر کاستر',
    variants: [
      {
        id: 'custard-strawberry-250',
        productId: 'custard-strawberry',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-STR-250',
        stock: 60,
        available: true,
      },
    ],
  },
  {
    id: 'custard-chocolate',
    category: 'custard',
    flavorId: 'chocolate',
    name: 'پودر کاستر کاکائو ژینو',
    shortName: 'کاستر کاکائو',
    categoryLabel: 'پودر کاستر',
    variants: [
      {
        id: 'custard-chocolate-250',
        productId: 'custard-chocolate',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-CHO-250',
        stock: 55,
        available: true,
      },
    ],
  },
  {
    id: 'custard-seven-fruit',
    category: 'custard',
    flavorId: 'seven-fruit',
    name: 'پودر کاستر هفت میوه ژینو',
    shortName: 'کاستر هفت میوه',
    categoryLabel: 'پودر کاستر',
    variants: [
      {
        id: 'custard-seven-fruit-250',
        productId: 'custard-seven-fruit',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-SVF-250',
        stock: 40,
        available: true,
      },
    ],
  },
  {
    id: 'custard-orange',
    category: 'custard',
    flavorId: 'orange-c',
    name: 'پودر کاستر پرتقال ژینو',
    shortName: 'کاستر پرتقال',
    categoryLabel: 'پودر کاستر',
    variants: [
      {
        id: 'custard-orange-250',
        productId: 'custard-orange',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-ORN-250',
        stock: 50,
        available: true,
      },
    ],
  },
  {
    id: 'custard-mahlab-vanilla',
    category: 'custard',
    flavorId: 'mahlab-vanilla',
    name: 'پودر کاستر محلبی وانیلی ژینو',
    shortName: 'کاستر محلبی وانیلی',
    categoryLabel: 'پودر کاستر',
    special: true,
    featured: true,
    variants: [
      {
        id: 'custard-mahlab-vanilla-250',
        productId: 'custard-mahlab-vanilla',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZC-MHL-250',
        stock: 25,
        available: true,
      },
    ],
  },
];

// Helpers
export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getVariantById(productId: string, variantId: string) {
  const product = getProductById(productId);
  return product?.variants.find((v) => v.id === variantId);
}

export function getFlavor(flavorId: FlavorId): Flavor {
  return FLAVORS[flavorId];
}

export const FREE_SHIPPING_THRESHOLD = 700000; // Tomans

export const SHIPPING_COST_STANDARD = 50000;
export const SHIPPING_COST_EXPRESS = 100000;
