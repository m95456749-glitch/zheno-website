// ============================================================
// ZHINO — hero product-photo showcase
// Uses ONLY the seven real uploaded photos of the hero shoot
// (public/images/products/*, camera-EXIF batch). Files are
// never cropped, edited, re-encoded, or distorted: the frame
// follows each file's native dimensions and the photo is
// presented with object-contain.
//
// Rotation: one photo at a time, advancing automatically every
// exactly 3000 ms — no previous/next arrows, subtle dots only.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { cn } from '../utils/cn';

type Slide = {
  id: string;
  src: string;
  alt: string;
  position: string;
  width: number;
  height: number;
};

// Real hero-shoot photos (EXIF-verified originals). Order is the
// display order; the first photo is shown immediately on load.
const SLIDES: Slide[] = [
  {
    id: 'jelly-cantaloupe',
    src: 'images/products/jelly-cantaloupe.jpg',
    alt: 'پودر ژله طالبی ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 587,
    height: 874,
  },
  {
    id: 'jelly-watermelon',
    src: 'images/products/jelly-watermelon.jpg',
    alt: 'پودر ژله هندوانه ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 586,
    height: 874,
  },
  {
    id: 'jelly-mango',
    src: 'images/products/jelly-mango.jpg',
    alt: 'پودر ژله انبه ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 571,
    height: 839,
  },
  {
    id: 'jelly-mulberry',
    src: 'images/products/jelly-mulberry.jpg',
    alt: 'پودر ژله شاتوت ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 571,
    height: 814,
  },
  {
    id: 'jelly-grape',
    src: 'images/products/jelly-grape.jpg',
    alt: 'پودر ژله انگور ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 562,
    height: 834,
  },
  {
    id: 'jelly-kiwi',
    src: 'images/products/jelly-kiwi.jpg',
    alt: 'پودر ژله کیوی ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 533,
    height: 825,
  },
  {
    id: 'jelly-lemon',
    src: 'images/products/jelly-lemon.jpg',
    alt: 'پودر ژله لیمو ژینو در لیوان شیشه‌ای؛ عکس واقعی محصول',
    position: '50% 50%',
    width: 532,
    height: 859,
  },
];

// Exactly 3 seconds between photo changes.
const AUTO_MS = 3000;

function assetUrl(src: string) {
  return `${import.meta.env.BASE_URL}${src}`;
}

export default function DessertShowcase() {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const slides = SLIDES.filter((slide) => !failed.has(slide.id));
  const count = slides.length;
  const current = count > 0 ? ((index % count) + count) % count : 0;
  const currentSlide = slides[current];

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const apply = () => setReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const goTo = useCallback(
    (target: number) => {
      if (count === 0) return;
      setIndex(((target % count) + count) % count);
    },
    [count],
  );

  const goForward = useCallback(() => goTo(current + 1), [goTo, current]);
  const goBackward = useCallback(() => goTo(current - 1), [goTo, current]);

  // Unconditional 3-second cadence — no hover/focus pause, so the
  // photo really changes every exactly 3000 ms. Users who prefer
  // reduced motion still get the 3-second change, only without the
  // fade (instant swap instead of animation).
  useEffect(() => {
    if (count === 0) return;

    const tick = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, AUTO_MS);

    return () => window.clearInterval(tick);
  }, [count]);

  const onImgError = (id: string) => {
    setFailed((prior) => {
      if (prior.has(id)) return prior;
      const updated = new Set(prior);
      updated.add(id);
      return updated;
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
    if (dx < 0) goForward();
    else goBackward();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goForward();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goBackward();
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(count - 1);
    }
  };

  if (count === 0 || !currentSlide) return null;

  return (
    <div className="frame-lux mx-auto w-full max-w-[18rem] sm:max-w-[20rem] lg:max-w-[21rem]">
      <div
        className="showcase-stage rounded-2xl shadow-[0_40px_80px_-36px_rgba(0,0,0,0.85)]"
        role="region"
        aria-roledescription="carousel"
        aria-label="ویترین تصاویر واقعی محصولات ژینو"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
      >
        <div
          className="relative w-full transition-[aspect-ratio] duration-500 ease-out"
          style={{ aspectRatio: `${currentSlide.width} / ${currentSlide.height}` }}
        >
          {slides.map((slide, i) => {
            const on = i === current;
            return (
              <div
                key={slide.id}
                className={cn('showcase-slide', on && 'is-on')}
                style={reducedMotion ? { transition: 'none' } : undefined}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} از ${count}`}
                aria-hidden={on ? undefined : true}
              >
                <img
                  src={assetUrl(slide.src)}
                  alt={on ? slide.alt : ''}
                  width={slide.width}
                  height={slide.height}
                  loading="eager"
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

          {count > 1 && (
            <div className="showcase-dots" role="group" aria-label="انتخاب تصویر محصول">
              <span className="showcase-dots-rule" aria-hidden="true" />
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={`تصویر ${i + 1}`}
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
