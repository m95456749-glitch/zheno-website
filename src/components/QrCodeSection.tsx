// ============================================================
// ZHINO — QR plate (one quiet scan-and-share section)
//
// Deliberately minimal: a frame for the QR artwork, a short
// title, one line of copy, and a share action. No cards inside
// cards, no extra stats, no invented claims.
//
// The artwork itself is NOT generated here. Drop the real file
// into public/images/ as qr-code.png (or .jpg / .webp) and it is
// picked up automatically at the next build; until then the
// frame shows a labelled placeholder instead of a broken image.
//
// Artwork spec (qr-code.png): burgundy #5A1725 modules on ivory
// #FAF7F2, 3-module quiet zone in the file, subtly rounded data
// modules with sharp standard finder eyes — flat artwork, no
// blur/transparency/shadow (the jelly frame is pure CSS).
// ============================================================

import { useState } from 'react';
import { soundService } from '../services/soundService';
import { getSiteBase, withSiteBase } from '../utils/siteBase';

/** First candidate that exists wins — the owner's final artwork slot. */
const QR_CANDIDATES = ['images/qr-code.png', 'images/qr-code.jpg', 'images/qr-code.webp'];

const QR_ALT = 'کد QR ژینو برای اسکن و اشتراک‌گذاری سایت';
const SHARE_TITLE = 'ژینو | Zheno';
const SHARE_TEXT = 'ژینو — پودر ژله و کاستر، ۱۵ طعم اصیل در بسته‌بندی ۲۵۰ گرمی.';

/** 'idle' shows no note at all; the rest are short, quiet confirmations. */
type ShareState = 'idle' | 'shared' | 'copied' | 'unavailable';

const SHARE_NOTE: Record<Exclude<ShareState, 'idle'>, string> = {
  shared: 'سپاس از همراهی شما',
  copied: 'لینک ژینو کپی شد',
  unavailable: 'مرورگر شما از اشتراک‌گذاری پشتیبانی نمی‌کند',
};

export default function QrCodeSection() {
  const [candidate, setCandidate] = useState(0);
  const [shareState, setShareState] = useState<ShareState>('idle');
  const qrMissing = candidate >= QR_CANDIDATES.length;

  // Native share sheet where it exists; clipboard fallback; otherwise a
  // quiet note. Nothing here touches cart/checkout/order logic.
  const share = async () => {
    soundService.play('primaryButton');
    const url = `${window.location.origin}${getSiteBase()}/`;
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
        setShareState('shared');
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
        return;
      }
      setShareState('unavailable');
    } catch {
      // A dismissed share sheet is not an error — stay quiet.
      setShareState('idle');
    }
  };

  return (
    <section
      className="cv-auto relative bg-cream-page px-4 py-12 text-espresso sm:px-6 sm:py-14"
      aria-label="کد QR ژینو"
    >
      <span className="band-seam" aria-hidden="true" />

      <div className="mx-auto grid max-w-4xl items-center gap-9 sm:gap-10 lg:grid-cols-[minmax(0,14.5rem)_minmax(0,1fr)] lg:gap-14">
        {/* QR plate — the replaceable artwork slot. A white card on
            the light band: a soft layered shadow lifts it off the
            ivory, and a double hairline (quiet neutral edge + matte
            gold inner edge) frames it like stationery — thin, never
            thick, with the QR itself as the focal point. The artwork
            (public/images/qr-code.png) carries a 3-module quiet zone;
            the balanced white padding around it completes the scan
            safe margin to ~6 modules, so the code sits larger and
            better proportioned without losing scannability. */}
        <div className="w-full max-w-[14.5rem] justify-self-center lg:justify-self-start">
          <div className="qr-organic rounded-2xl border border-espresso/10 bg-white p-[5px] shadow-[0_1px_2px_rgba(41,35,33,0.06),0_30px_60px_-38px_rgba(41,35,33,0.28)]">
            <div className="qr-glass rounded-[10px] border border-gold-500/40 bg-white p-2 sm:p-2.5">
              <div className="relative aspect-square w-full overflow-hidden bg-white">
                {qrMissing ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-espresso/20 bg-cream-50 px-3 text-center">
                    {/* neutral scan-bracket mark: a placeholder, not a QR pattern */}
                    <svg viewBox="0 0 24 24" fill="none" className="h-9 w-9 text-wine-900/40" aria-hidden="true">
                      <path
                        d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                      <rect x="9" y="9" width="6" height="6" rx="1.4" fill="currentColor" />
                    </svg>
                    <span className="text-[0.66rem] font-medium leading-5 text-mocha">جای تصویر QR</span>
                  </div>
                ) : (
                  <img
                    src={withSiteBase(QR_CANDIDATES[candidate])}
                    alt={QR_ALT}
                    width={512}
                    height={512}
                    loading="lazy"
                    decoding="async"
                    onError={() => setCandidate((c) => c + 1)}
                    className="h-full w-full object-contain p-1"
                  />
                )}
              </div>
            </div>
          </div>
          <p className="mt-3 text-center font-display text-[0.6rem] uppercase tracking-[0.32em] text-mocha-light lg:text-start">
            Scan · Zheno
          </p>
        </div>

        {/* copy + the one action */}
        <div className="text-center lg:text-start">
          <p className="kicker font-display">Scan &amp; Share</p>
          <h2 className="mt-3 text-[1.35rem] font-light leading-[1.6] text-wine-950 sm:text-[1.7rem]">
            یک اسکن، تمام طعم‌ها
          </h2>
          <p className="mx-auto mt-3 max-w-md text-[0.78rem] font-light leading-7 text-mocha lg:mx-0">
            دوربین گوشی را روی کد بگیرید تا منوی ژینو، طعم‌ها و دستورهای آماده‌سازی همیشه همراهتان باشد.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <button type="button" onClick={share} className="btn-lux btn-gold sheen px-6 py-2.5 text-[0.8rem]">
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M7.5 11.2 12.5 8.8M7.5 8.8l5 2.4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
                <circle cx="5.2" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="14.8" cy="6.4" r="2.2" stroke="currentColor" strokeWidth="1.6" />
                <circle cx="14.8" cy="13.6" r="2.2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              اشتراک‌گذاری
            </button>

            {shareState !== 'idle' && (
              <p aria-live="polite" className="text-[0.7rem] leading-6 text-mocha">
                {SHARE_NOTE[shareState]}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
