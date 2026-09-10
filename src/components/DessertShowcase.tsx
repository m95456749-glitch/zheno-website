// ============================================================
// ZHINO — hero product-photo showcase
// Uses only the real uploaded product images already present in
// public/images/products. The frame follows each file's native
// dimensions so images are not cropped, edited, re-encoded, or
// distorted.
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

const SLIDES: Slide[] = [
  {
    id: 'jelly-strawberry',
    src: 'images/products/jelly-strawberry.jpg',
    alt: 'پودر ژله توت فرنگی ژینو در لیوان شیشه‌ای؛ تصویر واقعی محصول آپلود شده',
    position: '50% 50%',
    width: 408,
    height: 450,
  },
  {
    id: 'jelly-pomegranate',
    src: 'images/products/jelly-pomegranate.jpg',
    alt: 'پودر ژله انار ژینو در لیوان شیشه‌ای؛ تصویر واقعی محصول آپلود شده',
    position: '50% 50%',
    width: 424,
    height: 447,
  },
  {
    id: 'custard-mahlab-vanilla',
    src: 'images/products/custard-mahlab-vanilla.jpg',
    alt: 'پودر کاستر وانیلی ژینو در لیوان شیشه‌ای؛ تصویر واقعی محصول آپلود شده',
    position: '50% 50%',
    width: 300,
    height: 361,
  },
  {
    id: 'jelly-cantaloupe',
    src: 'images/products/jelly-cantaloupe.jpg',
    alt: 'پودر ژله طالبی ژینو در لیوان شیشه‌ای؛ تصویر واقعی محصول آپلود شده',
    position: '50% 50%',
    width: 587,
    height: 874,
  },
  {
    id: 'custard-seven-fruit',
    src: 'images/products/custard-seven-fruit.jpg',
    alt: 'پودر کاستر هفت میوه ژینو در لیوان شیشه‌ای؛ تصویر واقعی محصول آپلود شده',
    position: '50% 50%',
    width: 288,
    height: 349,
  },
];

const AUTO_MS = 5600;

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

  useEffect(() => {
    if (count === 0 || paused || reducedMotion) return;

    const tick = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setIndex((i) => (i + 1) % count);
    }, AUTO_MS);

    return () => window.clearInterval(tick);
  }, [count, paused, reducedMotion]);

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
