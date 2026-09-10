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
  // Jelly Flavors — season 2 (7 new real-photo products)
  watermelon: {
    id: 'watermelon',
    name: 'هندوانه',
    color: '#D8425A',
    emoji: '🍉',
    category: 'jelly',
  },
  // NOTE: the supplier's packet prints «ژله خربزه»; the store sells this
  // melon packet as «طالبی» (owner-confirmed same product).
  'cantaloupe-j': {
    id: 'cantaloupe-j',
    name: 'طالبی',
    color: '#E89A3D',
    emoji: '🍈',
    category: 'jelly',
  },
  // NOTE: the packet prints «ژله توت سیاه» — same fruit as «شاتوت».
  mulberry: {
    id: 'mulberry',
    name: 'شاتوت',
    color: '#6E2B5B',
    emoji: '🫐',
    category: 'jelly',
  },
  mango: {
    id: 'mango',
    name: 'انبه',
    color: '#EE9029',
    emoji: '🥭',
    category: 'jelly',
  },
  grape: {
    id: 'grape',
    name: 'انگور',
    color: '#7B4FA0',
    emoji: '🍇',
    category: 'jelly',
  },
  kiwi: {
    id: 'kiwi',
    name: 'کیوی',
    color: '#8CB53E',
    emoji: '🥝',
    category: 'jelly',
  },
  lemon: {
    id: 'lemon',
    name: 'لیمو',
    color: '#E7C41B',
    emoji: '🍋',
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
    imageUrl: 'images/products/jelly-pomegranate.jpg',
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
    imageUrl: 'images/products/jelly-strawberry.jpg',
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
    imageUrl: 'images/products/jelly-peach.jpg',
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
    imageUrl: 'images/products/jelly-raspberry.jpg',
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
    imageUrl: 'images/products/jelly-blueberry.jpg',
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
    imageUrl: 'images/products/jelly-orange.jpg',
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
    imageUrl: 'images/products/jelly-pineapple.jpg',
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
    imageUrl: 'images/products/jelly-sour-cherry.jpg',
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
  // JELLY POWDER — season 2 (7 new flavors, real product photos)
  // ────────────────────────────────────────
  {
    id: 'jelly-watermelon',
    category: 'jelly',
    flavorId: 'watermelon',
    name: 'پودر ژله هندوانه ژینو',
    shortName: 'ژله هندوانه',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-watermelon.jpg',
    variants: [
      {
        id: 'jelly-watermelon-250',
        productId: 'jelly-watermelon',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-WML-250',
        stock: 45,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-cantaloupe',
    category: 'jelly',
    flavorId: 'cantaloupe-j',
    name: 'پودر ژله طالبی ژینو',
    shortName: 'ژله طالبی',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-cantaloupe.jpg',
    variants: [
      {
        id: 'jelly-cantaloupe-250',
        productId: 'jelly-cantaloupe',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-CAN-250',
        stock: 40,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-mulberry',
    category: 'jelly',
    flavorId: 'mulberry',
    name: 'پودر ژله شاتوت ژینو',
    shortName: 'ژله شاتوت',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-mulberry.jpg',
    variants: [
      {
        id: 'jelly-mulberry-250',
        productId: 'jelly-mulberry',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-MUB-250',
        stock: 35,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-mango',
    category: 'jelly',
    flavorId: 'mango',
    name: 'پودر ژله انبه ژینو',
    shortName: 'ژله انبه',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-mango.jpg',
    variants: [
      {
        id: 'jelly-mango-250',
        productId: 'jelly-mango',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-MNG-250',
        stock: 50,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-grape',
    category: 'jelly',
    flavorId: 'grape',
    name: 'پودر ژله انگور ژینو',
    shortName: 'ژله انگور',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-grape.jpg',
    variants: [
      {
        id: 'jelly-grape-250',
        productId: 'jelly-grape',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-GRP-250',
        stock: 45,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-kiwi',
    category: 'jelly',
    flavorId: 'kiwi',
    name: 'پودر ژله کیوی ژینو',
    shortName: 'ژله کیوی',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-kiwi.jpg',
    variants: [
      {
        id: 'jelly-kiwi-250',
        productId: 'jelly-kiwi',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-KWI-250',
        stock: 40,
        available: true,
      },
    ],
  },
  {
    id: 'jelly-lemon',
    category: 'jelly',
    flavorId: 'lemon',
    name: 'پودر ژله لیمو ژینو',
    shortName: 'ژله لیمو',
    categoryLabel: 'پودر ژله',
    imageUrl: 'images/products/jelly-lemon.jpg',
    variants: [
      {
        id: 'jelly-lemon-250',
        productId: 'jelly-lemon',
        weight: '۲۵۰ گرم',
        weightGrams: 250,
        price: 200000,
        sku: 'ZJ-LEM-250',
        stock: 55,
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
