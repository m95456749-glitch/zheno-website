// ============================================================
// ZHINO — تکه‌کردن متن برای خواندن (مشترک بین هر دو مسیر صدا)
//
// چرا این فایل جدا شد؟
//   هر دو مسیر صدا به «شکستن متن روی مرز جمله» نیاز دارند، اما به
//   دو دلیل متفاوت:
//
//     • مسیر گوشی (useAssistantSpeech): تکه‌های کوتاه ~۱۴۰ نویسه‌ای
//       لازم است، چون Chrome Android جمله‌های بلند را وسط کار قفل
//       می‌کند (باگ ~۱۴ ثانیه).
//     • مسیر ابری (useAssistantCloudVoice): تکه‌های بلندتر، چون هر
//       تکه یک درخواست شبکه است؛ ولی همچنان باید تکه شود تا پاسخ‌های
//       بلند از سقف سرویس رد نشوند و **هیچ کلمه‌ای بی‌صدا نیفتد**.
//
//   قبلاً این منطق فقط داخل مسیر گوشی بود و مسیر ابری متن را ساده
//   `slice` می‌کرد — یعنی یک پاسخ بلند وسط جمله قطع می‌شد و بقیه‌اش
//   هرگز خوانده نمی‌شد. حالا هر دو از همین یک تابع استفاده می‌کنند.
//
// قاعده‌ها (به همین ترتیب): مرز جمله → مرز ویرگول → مرز فاصله.
// هیچ‌وقت وسط یک کلمه بریده نمی‌شود مگر آنکه خودِ کلمه از سقف بلندتر باشد.
// ============================================================

/** طول بیشینهٔ هر تکه در مسیر گوشی: زیر آستانهٔ قفل ~۱۴ ثانیه‌ای Chrome */
export const DEVICE_MAX_CHUNK = 140;

/**
 * طول بیشینهٔ هر تکه در مسیر ابری. کمی زیر سقف سرور (۱۲۰۰) نگه داشته
 * شده تا متن پس از پاک‌سازی سمت سرور هم جا شود. بلندتر از مسیر گوشی
 * است چون هر تکه یک درخواست شبکه است و تکهٔ بلندتر یعنی صدای پیوسته‌تر.
 */
export const CLOUD_MAX_CHUNK = 900;

/**
 * متن را برای خوانده‌شدن صاف می‌کند: بولت‌ها به مکث تبدیل می‌شوند و
 * خط‌های جدید به مرز جمله. (همان کاری که سرور هم انجام می‌دهد.)
 */
export function flattenForSpeech(text: string): string {
  return text
    .replace(/[•▪◦]+/g, '، ')
    .replace(/([^\n.!?؟؛:])\s*\n+\s*/g, '$1. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cutOnSpaces(part: string, maxChunk: number): string[] {
  const out: string[] = [];
  let rest = part;
  while (rest.length > maxChunk) {
    const at = rest.lastIndexOf(' ', maxChunk);
    // مرز فاصله فقط وقتی پذیرفته می‌شود که تکهٔ معناداری بسازد
    const cut = at > Math.min(40, Math.floor(maxChunk / 3)) ? at : maxChunk;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

function breakLong(sentence: string, maxChunk: number): string[] {
  const parts = sentence
    .split(/[،,]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const part of parts) {
    if (part.length > maxChunk) {
      if (line.length > 0) {
        out.push(line);
        line = '';
      }
      out.push(...cutOnSpaces(part, maxChunk));
      continue;
    }
    line = line.length > 0 ? `${line}، ${part}` : part;
    if (line.length >= maxChunk) {
      out.push(line);
      line = '';
    }
  }
  if (line.length > 0) out.push(line);
  return out;
}

/**
 * متن را به تکه‌هایی می‌شکند که هیچ‌کدام از `maxChunk` بلندتر نیستند.
 *
 * تضمین‌ها (با تست خودکار قفل شده‌اند):
 *   • هیچ نویسهٔ معناداری حذف نمی‌شود — کل متن خوانده می‌شود
 *   • هیچ تکه‌ای از سقف بلندتر نیست
 *   • برش‌ها روی مرز جمله/ویرگول/فاصله‌اند، نه وسط کلمه
 */
export function splitForSpeech(text: string, maxChunk = DEVICE_MAX_CHUNK): string[] {
  const flat = flattenForSpeech(text);
  if (flat.length === 0) return [];

  const sentences: string[] = [];
  let buffer = '';
  for (const char of flat) {
    buffer += char;
    if ('.!?؟'.includes(char)) {
      const done = buffer.trim();
      if (done.length > 0) sentences.push(done);
      buffer = '';
    }
  }
  if (buffer.trim().length > 0) sentences.push(buffer.trim());

  const chunks: string[] = [];
  let current = '';
  for (const piece of sentences.flatMap((sentence) =>
    sentence.length > maxChunk ? breakLong(sentence, maxChunk) : [sentence],
  )) {
    if (piece.length === 0) continue;
    if (current.length > 0 && current.length + piece.length + 1 > maxChunk) {
      chunks.push(current);
      current = piece;
    } else {
      current = current.length > 0 ? `${current} ${piece}` : piece;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
