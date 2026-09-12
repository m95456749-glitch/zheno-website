-- ZHINO seed data copied from src/data/products.ts and src/data/recipes.ts.
-- Real public/images paths are preserved; no images are uploaded or replaced.


insert into public.flavors (id, category, name, color, emoji) values
  ('pomegranate', 'jelly', 'انار', '#8B1A1A', '🫐'),
  ('strawberry-j', 'jelly', 'توت فرنگی', '#C0392B', '🍓'),
  ('peach', 'jelly', 'هلو', '#E8956D', '🍑'),
  ('raspberry', 'jelly', 'تمشک', '#A93160', '🍇'),
  ('blueberry', 'jelly', 'بلوبری', '#3B3F8C', '🫐'),
  ('orange-j', 'jelly', 'پرتقال', '#D4622A', '🍊'),
  ('pineapple', 'jelly', 'آناناس', '#B5911A', '🍍'),
  ('sour-cherry', 'jelly', 'آلبالو', '#7B1C3E', '🍒'),
  ('watermelon', 'jelly', 'هندوانه', '#D8425A', '🍉'),
  ('cantaloupe-j', 'jelly', 'طالبی', '#E89A3D', '🍈'),
  ('mulberry', 'jelly', 'شاتوت', '#6E2B5B', '🫐'),
  ('mango', 'jelly', 'انبه', '#EE9029', '🥭'),
  ('grape', 'jelly', 'انگور', '#7B4FA0', '🍇'),
  ('kiwi', 'jelly', 'کیوی', '#8CB53E', '🥝'),
  ('lemon', 'jelly', 'لیمو', '#E7C41B', '🍋'),
  ('banana', 'custard', 'موز', '#B8961A', '🍌'),
  ('cantaloupe', 'custard', 'طالبی', '#C9844A', '🍈'),
  ('strawberry-c', 'custard', 'توت فرنگی', '#C0392B', '🍓'),
  ('chocolate', 'custard', 'کاکائو', '#5C3317', '🍫'),
  ('seven-fruit', 'custard', 'هفت میوه', '#7A5C8A', '🍭'),
  ('orange-c', 'custard', 'پرتقال', '#D4622A', '🍊'),
  ('mahlab-vanilla', 'custard', 'محلبی وانیلی', '#C8A96E', '✨')
on conflict (id) do update set category = excluded.category, name = excluded.name, color = excluded.color, emoji = excluded.emoji;

insert into public.products (id, category, flavor_id, name, short_name, category_label, image_url, active, featured, special) values
  ('jelly-pomegranate', 'jelly', 'pomegranate', 'پودر ژله انار ژینو', 'ژله انار', 'پودر ژله', 'images/products/jelly-pomegranate.jpg', true, false, false),
  ('jelly-strawberry', 'jelly', 'strawberry-j', 'پودر ژله توت فرنگی ژینو', 'ژله توت فرنگی', 'پودر ژله', 'images/products/jelly-strawberry.jpg', true, true, false),
  ('jelly-peach', 'jelly', 'peach', 'پودر ژله هلو ژینو', 'ژله هلو', 'پودر ژله', 'images/products/jelly-peach.jpg', true, false, false),
  ('jelly-raspberry', 'jelly', 'raspberry', 'پودر ژله تمشک ژینو', 'ژله تمشک', 'پودر ژله', 'images/products/jelly-raspberry.jpg', true, false, false),
  ('jelly-blueberry', 'jelly', 'blueberry', 'پودر ژله بلوبری ژینو', 'ژله بلوبری', 'پودر ژله', 'images/products/jelly-blueberry.jpg', true, false, false),
  ('jelly-orange', 'jelly', 'orange-j', 'پودر ژله پرتقال ژینو', 'ژله پرتقال', 'پودر ژله', 'images/products/jelly-orange.jpg', true, false, false),
  ('jelly-pineapple', 'jelly', 'pineapple', 'پودر ژله آناناس ژینو', 'ژله آناناس', 'پودر ژله', 'images/products/jelly-pineapple.jpg', true, false, false),
  ('jelly-sour-cherry', 'jelly', 'sour-cherry', 'پودر ژله آلبالو ژینو', 'ژله آلبالو', 'پودر ژله', 'images/products/jelly-sour-cherry.jpg', true, false, false),
  ('jelly-watermelon', 'jelly', 'watermelon', 'پودر ژله هندوانه ژینو', 'ژله هندوانه', 'پودر ژله', 'images/products/jelly-watermelon.jpg', true, false, false),
  ('jelly-cantaloupe', 'jelly', 'cantaloupe-j', 'پودر ژله طالبی ژینو', 'ژله طالبی', 'پودر ژله', 'images/products/jelly-cantaloupe.jpg', true, false, false),
  ('jelly-mulberry', 'jelly', 'mulberry', 'پودر ژله شاتوت ژینو', 'ژله شاتوت', 'پودر ژله', 'images/products/jelly-mulberry.jpg', true, false, false),
  ('jelly-mango', 'jelly', 'mango', 'پودر ژله انبه ژینو', 'ژله انبه', 'پودر ژله', 'images/products/jelly-mango.jpg', true, false, false),
  ('jelly-grape', 'jelly', 'grape', 'پودر ژله انگور ژینو', 'ژله انگور', 'پودر ژله', 'images/products/jelly-grape.jpg', true, false, false),
  ('jelly-kiwi', 'jelly', 'kiwi', 'پودر ژله کیوی ژینو', 'ژله کیوی', 'پودر ژله', 'images/products/jelly-kiwi.jpg', true, false, false),
  ('jelly-lemon', 'jelly', 'lemon', 'پودر ژله لیمو ژینو', 'ژله لیمو', 'پودر ژله', 'images/products/jelly-lemon.jpg', true, false, false),
  ('custard-banana', 'custard', 'banana', 'پودر کاستر موز ژینو', 'کاستر موز', 'پودر کاستر', 'images/products/custard-banana.jpg', true, true, false),
  ('custard-cantaloupe', 'custard', 'cantaloupe', 'پودر کاستر طالبی ژینو', 'کاستر طالبی', 'پودر کاستر', 'images/products/custard-cantaloupe.jpg', true, false, false),
  ('custard-strawberry', 'custard', 'strawberry-c', 'پودر کاستر توت فرنگی ژینو', 'کاستر توت فرنگی', 'پودر کاستر', 'images/products/custard-strawberry.jpg', true, false, false),
  ('custard-chocolate', 'custard', 'chocolate', 'پودر کاستر کاکائو ژینو', 'کاستر کاکائو', 'پودر کاستر', 'images/products/custard-chocolate.jpg', true, false, false),
  ('custard-seven-fruit', 'custard', 'seven-fruit', 'پودر کاستر هفت میوه ژینو', 'کاستر هفت میوه', 'پودر کاستر', 'images/products/custard-seven-fruit.jpg', true, false, false),
  ('custard-orange', 'custard', 'orange-c', 'پودر کاستر پرتقال ژینو', 'کاستر پرتقال', 'پودر کاستر', 'images/products/custard-orange.jpg', true, false, false),
  ('custard-mahlab-vanilla', 'custard', 'mahlab-vanilla', 'پودر کاستر محلبی وانیلی ژینو', 'کاستر محلبی وانیلی', 'پودر کاستر', 'images/products/custard-mahlab-vanilla.jpg', true, true, true)
on conflict (id) do update set category = excluded.category, flavor_id = excluded.flavor_id, name = excluded.name, short_name = excluded.short_name, category_label = excluded.category_label, image_url = excluded.image_url, featured = excluded.featured, special = excluded.special;

insert into public.product_variants (id, product_id, weight, weight_grams, price, sku) values
  ('jelly-pomegranate-250', 'jelly-pomegranate', '۲۵۰ گرم', 250, 200000, 'ZJ-POM-250'),
  ('jelly-strawberry-250', 'jelly-strawberry', '۲۵۰ گرم', 250, 200000, 'ZJ-STR-250'),
  ('jelly-peach-250', 'jelly-peach', '۲۵۰ گرم', 250, 200000, 'ZJ-PCH-250'),
  ('jelly-raspberry-250', 'jelly-raspberry', '۲۵۰ گرم', 250, 200000, 'ZJ-RAS-250'),
  ('jelly-blueberry-250', 'jelly-blueberry', '۲۵۰ گرم', 250, 200000, 'ZJ-BLU-250'),
  ('jelly-orange-250', 'jelly-orange', '۲۵۰ گرم', 250, 200000, 'ZJ-ORN-250'),
  ('jelly-pineapple-250', 'jelly-pineapple', '۲۵۰ گرم', 250, 200000, 'ZJ-PIN-250'),
  ('jelly-sour-cherry-250', 'jelly-sour-cherry', '۲۵۰ گرم', 250, 200000, 'ZJ-SCH-250'),
  ('jelly-watermelon-250', 'jelly-watermelon', '۲۵۰ گرم', 250, 200000, 'ZJ-WML-250'),
  ('jelly-cantaloupe-250', 'jelly-cantaloupe', '۲۵۰ گرم', 250, 200000, 'ZJ-CAN-250'),
  ('jelly-mulberry-250', 'jelly-mulberry', '۲۵۰ گرم', 250, 200000, 'ZJ-MUB-250'),
  ('jelly-mango-250', 'jelly-mango', '۲۵۰ گرم', 250, 200000, 'ZJ-MNG-250'),
  ('jelly-grape-250', 'jelly-grape', '۲۵۰ گرم', 250, 200000, 'ZJ-GRP-250'),
  ('jelly-kiwi-250', 'jelly-kiwi', '۲۵۰ گرم', 250, 200000, 'ZJ-KWI-250'),
  ('jelly-lemon-250', 'jelly-lemon', '۲۵۰ گرم', 250, 200000, 'ZJ-LEM-250'),
  ('custard-banana-250', 'custard-banana', '۲۵۰ گرم', 250, 200000, 'ZC-BAN-250'),
  ('custard-cantaloupe-250', 'custard-cantaloupe', '۲۵۰ گرم', 250, 200000, 'ZC-CAN-250'),
  ('custard-strawberry-250', 'custard-strawberry', '۲۵۰ گرم', 250, 200000, 'ZC-STR-250'),
  ('custard-chocolate-250', 'custard-chocolate', '۲۵۰ گرم', 250, 200000, 'ZC-CHO-250'),
  ('custard-seven-fruit-250', 'custard-seven-fruit', '۲۵۰ گرم', 250, 200000, 'ZC-SVF-250'),
  ('custard-orange-250', 'custard-orange', '۲۵۰ گرم', 250, 200000, 'ZC-ORN-250'),
  ('custard-mahlab-vanilla-250', 'custard-mahlab-vanilla', '۲۵۰ گرم', 250, 200000, 'ZC-MHL-250')
on conflict (id) do update set product_id = excluded.product_id, weight = excluded.weight, weight_grams = excluded.weight_grams, price = excluded.price, sku = excluded.sku;

insert into public.inventory (variant_id, current_stock, low_stock_threshold, active) values
  ('jelly-pomegranate-250', 50, 30, true),
  ('jelly-strawberry-250', 80, 30, true),
  ('jelly-peach-250', 60, 30, true),
  ('jelly-raspberry-250', 45, 30, true),
  ('jelly-blueberry-250', 35, 30, true),
  ('jelly-orange-250', 55, 30, true),
  ('jelly-pineapple-250', 40, 30, true),
  ('jelly-sour-cherry-250', 30, 30, true),
  ('jelly-watermelon-250', 45, 30, true),
  ('jelly-cantaloupe-250', 40, 30, true),
  ('jelly-mulberry-250', 35, 30, true),
  ('jelly-mango-250', 50, 30, true),
  ('jelly-grape-250', 45, 30, true),
  ('jelly-kiwi-250', 40, 30, true),
  ('jelly-lemon-250', 55, 30, true),
  ('custard-banana-250', 70, 30, true),
  ('custard-cantaloupe-250', 45, 30, true),
  ('custard-strawberry-250', 60, 30, true),
  ('custard-chocolate-250', 55, 30, true),
  ('custard-seven-fruit-250', 40, 30, true),
  ('custard-orange-250', 50, 30, true),
  ('custard-mahlab-vanilla-250', 25, 30, true)
on conflict (variant_id) do update set current_stock = excluded.current_stock, active = excluded.active;

insert into public.recipes (id, title, summary, category, ingredients, steps, emoji, active) values
  ('jelly-basic', 'دستور تهیه ژله', '۳ قاشق پودر ژله + ۱.۵ لیوان آب', 'jelly', ARRAY['۳ قاشق پودر ژله ژینو', '۱.۵ لیوان آب'], ARRAY['پودر ژله و آب را با هم مخلوط کنید.', 'روی حرارت قرار دهید تا به جوش آید، سپس از حرارت بردارید و اجازه دهید خنک شود.', 'در ظرف دلخواه بریزید و در یخچال قرار دهید.'], '🍮', true),
  ('custard-basic', 'دستور تهیه کاستر', '۱ قاشق پودر کاستر + ۱ لیوان شیر + ۲ قاشق شکر', 'custard', ARRAY['۱ قاشق پودر کاستر ژینو', '۱ لیوان شیر', '۲ قاشق شکر'], ARRAY['پودر کاستر، شیر و شکر را با هم مخلوط کنید.', 'روی حرارت قرار دهید تا غلیظ شود.', 'در ظرف دلخواه بریزید.'], '🥛', true)
on conflict (id) do update set title = excluded.title, summary = excluded.summary, category = excluded.category, ingredients = excluded.ingredients, steps = excluded.steps, emoji = excluded.emoji;

insert into public.site_content (key, value, published) values
  ('aboutLead', 'ژینو با یک باور ساده شروع شد: دسر خوب، حق هر خانواده است. امروز با هر طعمی که انتخاب می‌کنید، بخشی از همین باور سر سفره‌ی شما می‌نشیند.', true),
  ('contactLead', 'سؤال، پیشنهاد یا انتقادی دارید؟ از طریق فرم زیر برای ما بنویسید؛ در ساعات کاری پاسخ می‌دهیم.', true),
  ('recipesLead', 'دستور رسمی آماده‌سازی ژله و کاستر ژینو — ساده، سریع و دقیق.', true),
  ('footerCopyright', 'تمامی حقوق محفوظ است.', true),
  ('footerTagline', 'Quality, The ZHINO Way', true)
on conflict (key) do update set value = excluded.value, published = excluded.published;

