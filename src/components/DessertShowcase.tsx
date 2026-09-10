// ============================================================
// ZHINO — hero dessert showcase (jewel-window slider)
// One plated visual at a time, inside the existing Hero frame.
// Real production photos are shown without cropping — the
// container aspect ratio matches the actual image proportions
// (1408×768 → 116). Navigation is auto-advance with subtle
// dot indicators only; no prev/next arrow buttons.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { getFlavor } from '../data/products';
import ProductVisual from './ProductVisual';
import { cn } from '../utils/cn';

type Slide = {
  id: string;
  src: string;
  alt: string;
  position: string;
  width: number;
  height: number;
};

// Real uploaded images only. Each file is a genuine food photo
// that illustrates a dessert preparable from the ZHINO catalog.
// Dimensions are the native pixel size of each file — used only
// for intrinsic sizing hints, never to crop or stretch.
const SLIDES: Slide[] = [
  {
    id: 'trio',
    src: 'images/hero-dish.jpg',
    alt: 'سه دسر ژله‌ای ژینو در ظرف‌های شیشه‌ای؛ عکاسی خوراکی به سبک ژورنالی',
    position: '50% 50%',
    width: 1408,
    height: 768,
  },
  {
    id: 'strawberry-jelly',
    src: 'images/showcase/jelly-strawberry.jpg',
    alt: 'ژله توت‌فرنگی ژینو، آماده شده طبق دستور تهیه، در لیوان ساده کنار توت‌فرنگی تازه',
    position: '50% 50%',
    width: 1408,
    height: 768,
  },
  {
    id: 'vanilla-custard',
    src: 'images/showcase/custard-vanilla.jpg',
    alt: 'کاستر محلبی وانیلی ژینو، پخته‌شده با شیر و شکر، در کاسه سرامیکی',
    position: '50% 50%',
    width: 1408,
    height: 768,
  },
  {
    id: 'cocoa-custard',
    src: 'images/showcase/custard-cocoa.jpg',
    alt: 'کاستر کاکائو ژینو، غلیظ و قاشق‌خور، در کاسه سرامیکی کنار پنجره',
    position: '50% 50%',
    width: 1408,
    height: 768,
  },
];

const FALLBACK_FLAVORS = ['strawberry-j', 'banana', 'mahlab-vanilla'] as const;
const AUTO_MS = 5600;

// Native aspect ratio of every real uploaded photo (1408×768 = 11∶6).
// The frame adopts this ratio so no image is ever cropped.
const NATIVE_ASPECT = '11 / 6';

function assetUrl(src: string) {
  return `${import.meta.env.BASE_URL}${src}`;
}

export default function DessertShowcase() {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const paused = hovering || focused;

  const slides = SLIDES.filter((slide) => !failed.has(slide.id));
  const count = slides.length;
  const current = count > 0 ? ((index % count) + count) % count : 0;

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count],
  );

  const goNext = useCallback(() => goTo(current + 1), [goTo, current]);
  const goPrev = useCallback(() => goTo(current - 1), [goTo, current]);

  useEffect(() => {
    if (count === 0 || paused || reducedMotion) return;

    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setIndex((i) => (i + 1) % count);
    }, AUTO_MS);

    return () => window.clearInterval(tick);
  }, [count, paused, reducedMotion, current]);

  const onImgError = (id: string) => {
    setFailed((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    if ((event.target as HTMLElement | null)?.closest?.('button')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touchStart.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goPrev();
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(count - 1);
    }
  };

  if (count === 0) {
    return (
      <div className="frame-lux mx-auto w-full max-w-[28rem] lg:max-w-[32rem]">
        <div className="drift flex items-end justify-center gap-3 sm:gap-5">
          {FALLBACK_FLAVORS.map((flavorId, i) => {
            const flavor = getFlavor(flavorId);
            return (
              <div
                key={flavorId}
                className={cn(
                  'frame-lux arch-sm overflow-hidden shadow-[0_40px_80px_-35px_rgba(0,0,0,0.85)]',
                  i === 1 ? 'h-44 w-[8.5rem] sm:h-56 sm:w-44' : 'h-36 w-[7rem] sm:h-48 sm:w-40',
                )}
              >
                <ProductVisual
                  color={flavor.color}
                  emoji={flavor.emoji}
                  name={flavor.name}
                  className="h-full w-full"
                  emojiClassName="text-4xl sm:text-5xl"
                  compact
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="frame-lux mx-auto w-full max-w-[28rem] lg:max-w-[32rem]">
      <div
        className="showcase-stage overflow-hidden rounded-2xl shadow-[0_40px_80px_-36px_rgba(0,0,0,0.85)]"
        role="region"
        aria-roledescription="carousel"
        aria-label="ویترین دسر ژینو"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setFocused(false);
          }
        }}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
      >
        {/* Aspect ratio matches the native 11∶6 of every real photo so the frame grows to the image, not the other way around. */}
        <div
          className="relative w-full"
          style={{ aspectRatio: NATIVE_ASPECT }}
        >
          {slides.map((slide, i) => {
            const on = i === current;
            return (
              <div
                key={slide.id}
                className={cn('showcase-slide', on && 'is-on')}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} از ${count}`}
                aria-hidden={on ? undefined : true}
              >
                {/* object-contain keeps the full photo visible even if a browser rounds the aspect ratio; the native 11∶6 frame means there is no letterbox in practice. */}
                <img
                  src={assetUrl(slide.src)}
                  alt={on ? slide.alt : ''}
                  width={slide.width}
                  height={slide.height}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  fetchPriority={i === 0 ? 'high' : 'low'}
                  onError={() => onImgError(slide.id)}
                  draggable={false}
                  className="block h-full w-full object-contain"
                  style={{ objectPosition: slide.position }}
                />
              </div>
            );
          })}

          <div className="showcase-vignette" aria-hidden="true" />

          {/* Subtle dot indicators only — no prev/next arrow buttons */}
          {count > 1 && (
            <div className="showcase-dots" role="group" aria-label="انتخاب دسر">
              <span className="showcase-dots-rule" aria-hidden="true" />
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`دسر ${i + 1}`}
                  aria-current={i === current ? 'true' : undefined}
                  className={cn('showcase-dot', i === current && 'is-on')}
                  onClick={() => goTo(i)}
                />
              ))}
              <span className="showcase-dots-rule is-flip" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
