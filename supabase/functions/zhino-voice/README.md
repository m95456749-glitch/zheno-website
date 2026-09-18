# ZHINO — Supabase Edge Function «صدای ابری دستیار ژینو»

این تابع، تنها مسیر مجاز اتصال فروشگاه به سرویس تبدیل متن به گفتار است. کلید
سرویس در **Secrets سوپابیس** می‌ماند و هرگز وارد مرورگر، بستهٔ نهایی یا این
مخزن نمی‌شود.

```
مرورگر (فروشگاه)  ──POST──►  zhino-voice (Deno)  ──►  سرویس TTS
   بدون هیچ کلید              کلید سرویس اینجا        OpenAI  یا  Azure
        ▲                           │
        └──────────  MP3 صوتی  ────┘
```

ترتیب جایگزینِ صدا در فرانت‌اند:
۱) صدای ابری (این تابع) ← ۲) صدای مرورگر (Web Speech API) ← ۳) پیام کوتاه فارسی.
وقتی صدای ابری کار می‌کند، کاربر به نصب صدای فارسی روی گوشی نیاز ندارد.

## ۰. دو سرویس پشتیبانی‌شده (VOICE_PROVIDER)

قرارداد HTTP این تابع برای هر دو سرویس **دقیقاً یکی** است (همان `POST` متن →
`audio/mpeg`، همان `GET` سلامت، همان کدهای خطا). بنابراین فرانت‌اند، UI، پنل
مدیریت و منطق دستیار هیچ تفاوتی بین دو سرویس نمی‌بینند؛ جابه‌جایی فقط با
Secrets انجام می‌شود.

| مقدار `VOICE_PROVIDER` | سرویس | نکته |
| --- | --- | --- |
| `openai` | OpenAI «gpt-4o-mini-tts» | مسیر پیش‌فرض و در دسترس؛ فقط یک کلید لازم دارد |
| `azure` | Azure AI Speech (fa-IR-DilaraNeural) | مسیر جایگزین — کد دست‌نخورده باقی مانده است |
| (خالی) | خودکار | اگر `TTS_API_KEY` باشد OpenAI، وگرنه Azure |

هیچ fallback زمان‌اجرا بین دو سرویس وجود ندارد (تا هزینهٔ دو‌باره رخ ندهد)؛
جایگزین واقعی هر خطا، صدای خود مرورگر در فرانت‌اند است.

## ۱. تنظیم Secrets

### مسیر OpenAI (پیشنهاد فعلی)

```bash
supabase secrets set TTS_API_KEY="<کلید OpenAI>"
# اختیاری:
supabase secrets set VOICE_PROVIDER="openai"
supabase secrets set TTS_VOICE_FEMALE="coral"     # «دیلارا» در پنل
supabase secrets set TTS_VOICE_MALE="onyx"        # «فرید» در پنل
supabase secrets set TTS_MODEL="gpt-4o-mini-tts"
supabase secrets set TTS_API_URL="https://api.openai.com/v1/audio/speech"
supabase secrets set ALLOWED_ORIGINS="https://zheno.devs.surf,https://<user>.github.io"
```

| Secret | الزامی | توضیح |
| --- | --- | --- |
| `TTS_API_KEY` | ✅ | کلید OpenAI. اگر تنظیم نشود، `OPENAI_API_KEY` و سپس `AI_API_KEY` (کلید دستیار) خوانده می‌شود. فقط سمت سرور؛ هرگز در `VITE_*`. |
| `VOICE_PROVIDER` | — | `openai` یا `azure`. خالی = خودکار. |
| `TTS_API_URL` | — | پیش‌فرض `https://api.openai.com/v1/audio/speech`. با هر سرویس سازگار با OpenAI هم کار می‌کند. |
| `TTS_MODEL` | — | پیش‌فرض `gpt-4o-mini-tts`. |
| `TTS_VOICE_FEMALE` | — | صدای زن؛ پیش‌فرض `coral` (برای گزینهٔ «دیلارا»). |
| `TTS_VOICE_MALE` | — | صدای مرد؛ پیش‌فرض `onyx` (برای گزینهٔ «فرید»). |
| `TTS_OUTPUT_FORMAT` | — | پیش‌فرض `mp3` (فرمت پیش‌فرضِ پاسخ همان `audio/mpeg` می‌ماند). |

این مسیر SSML ندارد: زبان، لحن و سرعت از طریق `instructions` به مدل داده
می‌شود و ضریب سرعت دقیقاً از همان تنظیم «سرعت خواندن» پنل (۰٫۷ تا ۱٫۴)
ساخته می‌شود.

### مسیر Azure (جایگزین)

```bash
supabase secrets set AZURE_SPEECH_KEY="<کلید Azure Speech>" AZURE_SPEECH_REGION="<region>"
# اختیاری:
supabase secrets set VOICE_PROVIDER="azure"
supabase secrets set AZURE_SPEECH_VOICE="fa-IR-DilaraNeural"
```

| Secret | الزامی | توضیح |
| --- | --- | --- |
| `AZURE_SPEECH_KEY` | ✅ | کلید Azure AI Speech. فقط سمت سرور؛ هرگز در `VITE_*` نگذارید. |
| `AZURE_SPEECH_REGION` | ✅ | ناحیهٔ سرویس (مثل `eastus`). با `AZURE_SPEECH_ENDPOINT` سفارشی لازم نیست. |
| `AZURE_SPEECH_ENDPOINT` | — | Endpoint سفارشی کامل TTS (با `https` و بدون `/` آخر). |
| `AZURE_SPEECH_VOICE` | — | پیش‌فرض: `fa-IR-DilaraNeural` (صدای زن فارسی). |

### مشترک

| Secret | الزامی | توضیح |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | — | پیش‌فرض `*`؛ در محیط واقعی دامنه‌های خودتان را بگذارید. |

## ۲. تنظیمات صدا از پنل مدیریت (غیرمحرمانه)

مدیر فروشگاه از «تنظیمات → تنظیمات صدای دستیار» این موارد را مدیریت می‌کند
(در جدول عمومی `site_content` ذخیره می‌شود؛ چیزی مخفی یا حساس نیست):

| کلید دیتابیس | معنی | پیش‌فرض |
| --- | --- | --- |
| `assistant_voice_cloud` | کلید اصلی صدای ابری (`'0'` = خاموش) | روشن |
| `assistant_voice_name` | صدای فارسی (`fa-IR-DilaraNeural` زن، `fa-IR-FaridNeural` مرد) | Dilara |
| `assistant_voice_rate` | سرعت خواندن ۰٫۷ تا ۱٫۴ | ۱ |

این دو نام صدا **شناسهٔ داخلی** محصول‌اند و به سرویس خاصی وابسته نیستند:
مسیر Azure مستقیماً همان‌ها را در SSML می‌گذارد و مسیر OpenAI آن‌ها را به
`TTS_VOICE_FEMALE` / `TTS_VOICE_MALE` نگاشت می‌کند. به همین دلیل تعویض سرویس
هیچ Migration و هیچ تغییر UI نمی‌خواهد.

این تابع ردیف‌ها را خودش با کلید عمومی (anon، تحت همان RLS بازدیدکننده)
می‌خواند و همیشه سمت سرور اعتبارسنجی می‌کند: هر نام صدایی خارج از دو صدای
فارسی مجاز و هر سرعتی خارج از بازه، به پیش‌فرض امن برمی‌گردد. اگر کلید اصلی
خاموش باشد، تابع با `403 voice_disabled` پاسخ می‌دهد و **هیچ تماسی با سرویس
TTS برقرار نمی‌کند** (یعنی هزینه‌ای هم رخ نمی‌دهد). اگر خواندن تنظیمات ممکن
نبود، پیش‌فرض‌های امن (Dilara، روشن، سرعت ۱) اعمال می‌شوند.

## ۳. استقرار

```bash
supabase functions deploy zhino-voice
```

- `verify_jwt` پیش‌فرض روشن است؛ فرانت‌اند همان کلید عمومی پروژه
  (`publishable/anon`) را در هدر `Authorization` و `apikey` می‌فرستد.
- تابع هیچ دسترسی به دیتابیس ندارد و چیزی ذخیره نمی‌کند.

## ۴. فرانت‌اند

کاری لازم نیست: اگر `VITE_SUPABASE_URL` و کلید عمومی پروژه تنظیم شده باشند،
دستیار خودش این تابع را روی `<VITE_SUPABASE_URL>/functions/v1/zhino-voice`
صدا می‌زند. صدای هر پاسخ فقط در **حافظهٔ موقت مرورگر** نگه داشته می‌شود (نه
دیسک، نه localStorage) و پخش مجدد همان پاسخ درخواست تازه‌ای نمی‌زند.
اگر Supabase پیکربندی نشده باشد، صدا دقیقاً مثل قبل با موتور خود مرورگر خوانده
می‌شود.

## ۵. قرارداد API

| متد | پاسخ | کاربرد |
| --- | --- | --- |
| `GET` | `{ ok, configured, provider, voice, enabled, settings }` | بررسی آماده‌بودن سرویس صدا (بدون هیچ کلیدی) |
| `POST` | بدنهٔ باینری `audio/mpeg` | تبدیل متن به گفتار |

بدنهٔ `POST`:

```json
{ "text": "پاسخ دستیار — حداکثر ۲۰۰۰ نویسه" }
```

خطاها (همه با بدنهٔ JSON کوتاه): `400` متن خالی/نامعتبر (`empty_text`،
`text_too_long`)، `403` مبدأ ناشناس، `405` متد نادرست، `413` بدنهٔ بزرگ،
`429` سهمیه (`rate_limited` یا `quota_exceeded`)، `501` پیکربندی‌نشده
(`not_configured`)، `502` خطای سرویس TTS (`upstream_error`، `upstream_auth`،
`invalid_upstream_audio`)، `504` مهلت (`upstream_timeout`).
فرانت‌اند در همهٔ این حالت‌ها به صدای مرورگر و سپس به پیام کوتاه فارسی می‌رسد —
این نگاشت برای هر دو سرویس یکی است.

## ۶. نکات امنیتی

- کلید سرویس هرگز در `src/`، `VITE_*`، GitHub یا بستهٔ نهایی نمی‌آید؛ فقط در
  Secrets سوپابیس.
- پاسخ و لاگ هرگز کلید یا متن کاربر را دربر نمی‌گیرد (فقط نام سرویس و کد وضعیت).
- محدودیت‌ها: متن ۲۰۰۰ نویسه، بدنه ۸KB، ۳۰ درخواست در ۵ دقیقه برای هر IP در هر
  نمونهٔ تابع.
- مسیر Azure با فرار کامل XML ساخته می‌شود؛ تزریق SSML از متن کاربر ممکن نیست.
  مسیر OpenAI متن را به‌صورت `input` در بدنهٔ JSON می‌فرستد (بدون هیچ markup).
- انتخاب یک سرویس پیکربندی‌نشده هرگز به تماس بی‌کلید با upstream منجر نمی‌شود؛
  تابع `501 not_configured` می‌دهد و فرانت‌اند به صدای مرورگر می‌رود.
- `ALLOWED_ORIGINS` را در محیط واقعی روی دامنه‌های خودتان بگذارید.

## ۷. تست‌ها

```bash
npm run verify:voice      # همهٔ مسیرها (Azure + OpenAI) بدون هیچ تماس واقعی
```
