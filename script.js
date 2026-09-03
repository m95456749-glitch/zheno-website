"use strict";

let activeFilter = "all";
let searchTerm = "";
let cart = [];
let selectedProduct = null;

const CART_KEY = "zheno-cart";

const productsData =
  Array.isArray(window.products)
    ? window.products
    : Array.isArray(window.productsData)
      ? window.productsData
      : [];

function getProductById(id) {
  return productsData.find(
    product => String(product.id) === String(id)
  );
}

function formatPrice(price) {
  return Number(price || 0).toLocaleString("fa-IR") + " تومان";
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function loadCart() {
  try {
    const saved = localStorage.getItem(CART_KEY);
    cart = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(cart)) cart = [];
  } catch {
    cart = [];
  }
  updateCartUI();
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartUI();
}

function addToCart(productId) {
  const product = getProductById(productId);
  if (!product) return;

  const existing = cart.find(
    item => String(item.id) === String(productId)
  );

  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      id: product.id,
      quantity: 1
    });
  }

  saveCart();
  openCart();
}

function removeFromCart(productId) {
  cart = cart.filter(
    item => String(item.id) !== String(productId)
  );
  saveCart();
}

function changeQuantity(productId, change) {
  const item = cart.find(
    item => String(item.id) === String(productId)
  );

  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    removeFromCart(productId);
    return;
  }

  saveCart();
}

function getCartCount() {
  return cart.reduce(
    (total, item) => total + Number(item.quantity || 0),
    0
  );
}

function getCartTotal() {
  return cart.reduce((total, item) => {
    const product = getProductById(item.id);
    if (!product) return total;

    return total +
      Number(product.price || 0) *
      Number(item.quantity || 0);
  }, 0);
}

function updateCartUI() {
  const cartCount = document.getElementById("cartCount");
  const cartTotal = document.getElementById("cartTotal");
  const cartList = document.getElementById("cartList");

  if (cartCount) {
    cartCount.textContent =
      getCartCount().toLocaleString("fa-IR");
  }

  if (cartTotal) {
    cartTotal.textContent =
      formatPrice(getCartTotal());
  }

  if (cartList) renderCart();
}

function renderCart() {
  const cartList = document.getElementById("cartList");
  if (!cartList) return;

  if (cart.length === 0) {
    cartList.innerHTML = `
      <div class="empty-cart">
        <div style="font-size:40px;">🛒</div>
        <p>سبد خرید شما خالی است.</p>
      </div>
    `;
    return;
  }

  cartList.innerHTML = cart.map(item => {
    const product = getProductById(item.id);
    if (!product) return "";

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <strong>${escapeHTML(product.name)}</strong>
          <span>${formatPrice(product.price)}</span>
        </div>

        <div class="qty">
          <button type="button"
            onclick="changeQuantity('${product.id}', -1)">−</button>

          <span>${Number(item.quantity).toLocaleString("fa-IR")}</span>

          <button type="button"
            onclick="changeQuantity('${product.id}', 1)">+</button>
        </div>

        <button type="button"
          class="remove-cart-item"
          onclick="removeFromCart('${product.id}')">
          حذف
        </button>
      </div>
    `;
  }).join("");
}

function openCart() {
  const overlay = document.getElementById("cartOverlay");

  if (overlay) {
    overlay.classList.add("active");
    document.body.classList.add("no-scroll");
  }
}

function closeCart() {
  const overlay = document.getElementById("cartOverlay");

  if (overlay) {
    overlay.classList.remove("active");
    document.body.classList.remove("no-scroll");
  }
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const empty = document.getElementById("emptyProducts");

  if (!grid) return;

  const filteredProducts = productsData.filter(product => {
    const category = String(
      product.category ||
      product.categoryName ||
      ""
    ).toLowerCase();

    const name =
      String(product.name || "").toLowerCase();

    const flavor =
      String(product.flavor || "").toLowerCase();

    const matchesFilter =
      activeFilter === "all" ||
      category === activeFilter.toLowerCase() ||
      String(product.categoryName || "") === activeFilter;

    const matchesSearch =
      !searchTerm ||
      name.includes(searchTerm) ||
      flavor.includes(searchTerm);

    return matchesFilter && matchesSearch;
  });

  if (filteredProducts.length === 0) {
    grid.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }

  if (empty) empty.style.display = "none";

  grid.innerHTML = filteredProducts
    .map(product => createProductCard(product))
    .join("");
}

function createProductCard(product) {
  const category =
    product.categoryName ||
    (
      String(product.category || "").toLowerCase() === "jelly"
        ? "ژله"
        : "کاستر"
    );

  const image =
    product.image ||
    product.img ||
    "";

  const description =
    product.description ||
    `پودر ${product.name} ژینو با کیفیت بالا و طعمی لذیذ.`;

  return `
    <article class="product-card">

      <div class="product-image">

        <img
          src="${escapeHTML(image)}"
          alt="${escapeHTML(product.name)}"
          loading="lazy"
          onerror="this.style.display='none'"
        >

        <span class="product-type">
          ${escapeHTML(category)}
        </span>

      </div>

      <div class="product-info">

        <h3>${escapeHTML(product.name)}</h3>

        <p class="product-description">
          ${escapeHTML(description)}
        </p>

        <div class="product-meta">
          <span>
            ${escapeHTML(product.weight || "۲۵۰ گرم")}
          </span>
        </div>

        <div class="product-bottom">

          <strong class="price">
            ${formatPrice(product.price)}
          </strong>

          <div class="product-actions">

            <button
              type="button"
              class="details-btn"
              onclick="openProductModal('${product.id}')"
            >
              جزئیات
            </button>

            <button
              type="button"
              class="add-btn"
              onclick="addToCart('${product.id}')"
            >
              افزودن 🛒
            </button>

          </div>

        </div>

      </div>

    </article>
  `;
}

function setupSearch() {
  const searchInput =
    document.getElementById("searchInput");

  if (!searchInput) return;

  searchInput.addEventListener("input", function () {
    searchTerm =
      this.value.trim().toLowerCase();

    renderProducts();
  });
}

function setupFilters() {
  const buttons =
    document.querySelectorAll(".filter-btn");

  buttons.forEach(button => {
    button.addEventListener("click", function () {

      buttons.forEach(btn =>
        btn.classList.remove("active")
      );

      this.classList.add("active");

      activeFilter =
        this.dataset.filter || "all";

      renderProducts();
    });
  });
}

function openProductModal(productId) {
  const product = getProductById(productId);
  if (!product) return;

  selectedProduct = product;

  const modal =
    document.getElementById("productModal");

  const content =
    document.getElementById("productModalContent");

  if (!modal || !content) return;

  const image =
    product.image ||
    product.img ||
    "";

  const category =
    product.categoryName ||
    (
      String(product.category || "").toLowerCase() === "jelly"
        ? "ژله"
        : "کاستر"
    );

  content.innerHTML = `
    <div class="modal-product">

      <div class="modal-product-image">
        <img
          src="${escapeHTML(image)}"
          alt="${escapeHTML(product.name)}"
        >
      </div>

      <div class="modal-product-info">

        <span class="product-type">
          ${escapeHTML(category)}
        </span>

        <h2>${escapeHTML(product.name)}</h2>

        <p>
          ${escapeHTML(
            product.description ||
            `پودر ${product.name} ژینو با کیفیت بالا و طعمی لذیذ.`
          )}
        </p>

        <div class="product-meta">
          <span>
            وزن: ${escapeHTML(product.weight || "۲۵۰ گرم")}
          </span>
        </div>

        <div class="modal-product-price">
          ${formatPrice(product.price)}
        </div>

        <button
          type="button"
          class="add-btn"
          onclick="addToCart('${product.id}'); closeProductModal();"
        >
          افزودن به سبد خرید 🛒
        </button>

      </div>

    </div>
      modal.classList.add("active");
  document.body.classList.add("no-scroll");
}

function closeProductModal() {
  const modal =
    document.getElementById("productModal");

  if (modal) {
    modal.classList.remove("active");
    document.body.classList.remove("no-scroll");
  }

  selectedProduct = null;
}

function setupGallery() {
  const items =
    document.querySelectorAll(".gallery-item");

  const modal =
    document.getElementById("galleryModal");

  const modalImage =
    document.getElementById("galleryModalImage");

  if (!items.length || !modal || !modalImage) {
    return;
  }

  items.forEach(item => {
    item.addEventListener("click", function () {

      const image =
        this.querySelector("img");

      if (!image) return;

      modalImage.src = image.src;
      modalImage.alt =
        image.alt || "ژینو";

      modal.classList.add("active");
      document.body.classList.add("no-scroll");
    });
  });

  modal.addEventListener("click", function (event) {

    if (
      event.target === modal ||
      event.target.closest(".gallery-modal-close")
    ) {
      modal.classList.remove("active");
      document.body.classList.remove("no-scroll");
    }

  });
}

function setupMenu() {
  const menuBtn =
    document.getElementById("menuBtn");

  const navLinks =
    document.getElementById("navLinks");

  if (!menuBtn || !navLinks) return;

  menuBtn.addEventListener("click", function () {
    navLinks.classList.toggle("active");
    menuBtn.classList.toggle("active");
  });

  navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", function () {
      navLinks.classList.remove("active");
      menuBtn.classList.remove("active");
    });
  });
}

function setupNavigation() {
  document
    .querySelectorAll('a[href^="#"]')
    .forEach(link => {

      link.addEventListener("click", function (event) {

        const targetId =
          this.getAttribute("href");

        if (!targetId || targetId === "#") {
          return;
        }

        const target =
          document.querySelector(targetId);

        if (!target) return;

        event.preventDefault();

        const header =
          document.querySelector("header");

        const offset =
          header ? header.offsetHeight : 0;

        const top =
          target.getBoundingClientRect().top +
          window.scrollY -
          offset -
          10;

        window.scrollTo({
          top,
          behavior: "smooth"
        });
      });
    });
}

function setupScrollSpy() {
  const sections = [
    "home",
    "products",
    "recipes",
    "gallery",
    "about",
    "contact"
  ];

  const links =
    document.querySelectorAll(".nav-links a");

  window.addEventListener("scroll", function () {

    let current = "";

    const scrollPosition =
      window.scrollY + 160;

    sections.forEach(id => {

      const section =
        document.getElementById(id);

      if (!section) return;

      if (
        scrollPosition >= section.offsetTop
      ) {
        current = id;
      }
    });

    links.forEach(link => {

      link.classList.remove("active");

      const href =
        link.getAttribute("href");

      if (href === `#${current}`) {
        link.classList.add("active");
      }
    });
  });
}

function setupCart() {
  const cartBtn =
    document.getElementById("cartBtn");

  const cartOverlay =
    document.getElementById("cartOverlay");

  if (cartBtn) {
    cartBtn.addEventListener(
      "click",
      openCart
    );
  }

  if (cartOverlay) {
    cartOverlay.addEventListener(
      "click",
      function (event) {

        if (event.target === cartOverlay) {
          closeCart();
        }

      }
    );
  }
}

function checkout() {
  if (cart.length === 0) {
    alert("سبد خرید شما خالی است.");
    return;
  }

  const total = getCartTotal();

  let message =
    "سلام، برای ثبت سفارش محصولات ژینو پیام می‌دهم.\n\n";

  cart.forEach(item => {

    const product =
      getProductById(item.id);

    if (!product) return;

    message +=
      `• ${product.name} × ${item.quantity}\n`;
  });

  message +=
    `\nمبلغ تقریبی سفارش: ${formatPrice(total)}\n`;

  message +=
    "\nلطفاً برای نهایی کردن سفارش راهنمایی بفرمایید.";

  if (navigator.clipboard) {
    navigator.clipboard
      .writeText(message)
      .catch(() => {});
  }

  alert(
    "متن سفارش آماده شد و در صورت امکان کپی شد.\n\n" +
    "حالا در تلگرام پیام را ارسال کنید."
  );

  window.open(
    "https://t.me/+0qAvorUwSQEzNDc8",
    "_blank"
  );
}

function setupYear() {
  const year =
    document.getElementById("year");

  if (year) {
    year.textContent =
      new Date().getFullYear();
  }
}

function setupEscapeKey() {
  document.addEventListener(
    "keydown",
    function (event) {

      if (event.key !== "Escape") {
        return;
      }

      closeCart();
      closeProductModal();

      const galleryModal =
        document.getElementById("galleryModal");

      if (galleryModal) {
        galleryModal.classList.remove("active");
      }

      document.body.classList.remove("no-scroll");
    }
  );
}

window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeQuantity = changeQuantity;
window.openCart = openCart;
window.closeCart = closeCart;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.checkout = checkout;

document.addEventListener(
  "DOMContentLoaded",
  function () {

    loadCart();
    renderProducts();
    setupSearch();
    setupFilters();
    setupGallery();
    setupMenu();
    setupNavigation();
    setupScrollSpy();
    setupCart();
    setupYear();
    setupEscapeKey();

    console.log(
      "ZHENO website initialized successfully."
    );
  }
);
  `;
  /* ZHENO SCRIPT.JS - END */
