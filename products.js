const products = [
  // =========================
  // ژله‌ها
  // =========================

  {
    id: 1,
    name: "ژله انار",
    flavor: "انار",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014158_817.jpg",
    description: "پودر ژله انار ژینو با طعمی دلنشین و جذاب."
  },

  {
    id: 2,
    name: "ژله توت‌فرنگی",
    flavor: "توت‌فرنگی",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014203_418.jpg",
    description: "پودر ژله توت‌فرنگی ژینو با طعمی شیرین و دوست‌داشتنی."
  },

  {
    id: 3,
    name: "ژله هلو",
    flavor: "هلو",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014205_466.jpg",
    description: "پودر ژله هلو ژینو با طعمی خوشمزه و دلپذیر."
  },

  {
    id: 4,
    name: "ژله تمشک",
    flavor: "تمشک",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014206_913.jpg",
    description: "پودر ژله تمشک ژینو با طعمی جذاب و دوست‌داشتنی."
  },

  {
    id: 5,
    name: "ژله بلوبری",
    flavor: "بلوبری",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014211_342.jpg",
    description: "پودر ژله بلوبری ژینو با طعمی متفاوت و خوشمزه."
  },

  {
    id: 6,
    name: "ژله پرتقال",
    flavor: "پرتقال",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014213_348.jpg",
    description: "پودر ژله پرتقال ژینو با طعمی تازه و دوست‌داشتنی."
  },

  {
    id: 7,
    name: "ژله آناناس",
    flavor: "آناناس",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014214_902.jpg",
    description: "پودر ژله آناناس ژینو با طعمی شیرین و خوشمزه."
  },

  {
    id: 8,
    name: "ژله آلبالو",
    flavor: "آلبالو",
    category: "jelly",
    categoryName: "ژله",
    price: 170000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014218_054.jpg",
    description: "پودر ژله آلبالو ژینو با طعمی جذاب و دلنشین."
  },

  // =========================
  // کاسترها
  // =========================

  {
    id: 9,
    name: "کاستر موز",
    flavor: "موز",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014713_645.jpg",
    description: "پودر کاستر موز ژینو با طعمی لطیف و خوشمزه."
  },

  {
    id: 10,
    name: "کاستر طالبی",
    flavor: "طالبی",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014715_534.jpg",
    description: "پودر کاستر طالبی ژینو با طعمی متفاوت و دلنشین."
  },

  {
    id: 11,
    name: "کاستر توت‌فرنگی",
    flavor: "توت‌فرنگی",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014717_148.jpg",
    description: "پودر کاستر توت‌فرنگی ژینو با طعمی شیرین و دوست‌داشتنی."
  },

  {
    id: 12,
    name: "کاستر کاکائو",
    flavor: "کاکائو",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014718_671.jpg",
    description: "پودر کاستر کاکائو ژینو با طعمی شکلاتی و جذاب."
  },

  {
    id: 13,
    name: "کاستر هفت‌میوه",
    flavor: "هفت‌میوه",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014720_798.jpg",
    description: "پودر کاستر هفت‌میوه ژینو با طعمی متنوع و خوشمزه."
  },

  {
    id: 14,
    name: "کاستر پرتقال",
    flavor: "پرتقال",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014722_619.jpg",
    description: "پودر کاستر پرتقال ژینو با طعمی تازه و دلپذیر."
  },

  {
    id: 15,
    name: "کاستر وانیلی",
    flavor: "وانیلی",
    category: "custard",
    categoryName: "کاستر",
    price: 150000,
    weight: "۲۵۰ گرم",
    image: "IMG_20260903_014723_913.jpg",
    description: "پودر کاستر وانیلی ژینو با طعمی لطیف و دوست‌داشتنی."
  }
];

// دسترسی مطمئن برای فایل‌های JavaScript دیگر سایت
window.products = products;
