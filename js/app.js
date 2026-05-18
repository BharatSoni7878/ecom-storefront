const STORAGE_KEY = 'nexus_cart';
const TAX_RATE = 0.08;
const SHIPPING_FLAT = 99;
const FREE_SHIPPING_THRESHOLD = 999;
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#24242e" width="400" height="400"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#9b9ba8" font-family="sans-serif" font-size="18">No image</text></svg>'
  );

const state = {
  products: [],
  cart: [],
  filters: {
    search: '',
    category: '',
  },
  activeView: 'catalog',
  isLoading: false,
  loadError: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {};

function cacheElements() {
  Object.assign(els, {
    productGrid: $('#product-grid'),
    loading: $('#loading'),
    errorMessage: $('#error-message'),
    noResults: $('#no-results'),
    searchInput: $('#search-input'),
    categoryFilter: $('#category-filter'),
    cartBadge: $('#cart-badge'),
    cartNavBtn: $('#cart-nav-btn'),
    catalogView: $('#catalog-view'),
    cartView: $('#cart-view'),
    cartEmpty: $('#cart-empty'),
    cartContent: $('#cart-content'),
    cartItems: $('#cart-items'),
    ledgerSubtotal: $('#ledger-subtotal'),
    ledgerTax: $('#ledger-tax'),
    ledgerShipping: $('#ledger-shipping'),
    ledgerTotal: $('#ledger-total'),
    freeShippingNote: $('#free-shipping-note'),
    checkoutBtn: $('#checkout-btn'),
    toast: $('#toast'),
  });
}

function formatCurrency(amount) {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safe);
}

function setLoadingVisible(visible) {
  if (!els.loading) return;
  els.loading.hidden = !visible;
  els.loading.setAttribute('aria-busy', visible ? 'true' : 'false');
}

function showToast(message, type = '') {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast visible${type ? ` ${type}` : ''}`;
  els.toast.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.remove('visible');
    setTimeout(() => {
      els.toast.hidden = true;
    }, 300);
  }, 3000);
}

function persistCart() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.cart));
  } catch {
    showToast('Could not save cart to storage.', 'error');
  }
}

function loadCartFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    state.cart = parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === 'number' &&
          typeof item.quantity === 'number' &&
          item.quantity > 0
      )
      .map((item) => ({
        id: item.id,
        quantity: Math.floor(item.quantity),
      }));
  } catch {
    state.cart = [];
    localStorage.removeItem(STORAGE_KEY);
  }
}

function sanitizeCart() {
  let changed = false;
  const next = [];

  state.cart.forEach((item) => {
    const product = getProductById(item.id);
    if (!product || product.stock <= 0) {
      changed = true;
      return;
    }

    const quantity = Math.min(Math.max(1, item.quantity), product.stock);
    if (quantity !== item.quantity) changed = true;
    next.push({ id: item.id, quantity });
  });

  if (changed || next.length !== state.cart.length) {
    state.cart = next;
    persistCart();
  }
}

function validateProduct(p, seenIds) {
  if (
    !p ||
    typeof p.id !== 'number' ||
    typeof p.title !== 'string' ||
    !p.title.trim() ||
    typeof p.price !== 'number' ||
    p.price < 0 ||
    typeof p.category !== 'string' ||
    !p.category.trim() ||
    typeof p.image !== 'string' ||
    !p.image.trim() ||
    typeof p.description !== 'string' ||
    typeof p.stock !== 'number' ||
    p.stock < 0 ||
    !Number.isInteger(p.stock)
  ) {
    return false;
  }

  if (seenIds.has(p.id)) return false;
  seenIds.add(p.id);
  return true;
}

async function fetchProducts() {
  state.isLoading = true;
  state.loadError = null;
  setLoadingVisible(true);
  els.errorMessage.hidden = true;
  els.productGrid.innerHTML = '';
  updateNoResultsVisibility();

  try {
    const response = await fetch('data.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    if (!Array.isArray(data)) {
      throw new Error('Invalid data format: expected an array of products.');
    }

    const seenIds = new Set();
    state.products = data.filter((p) => validateProduct(p, seenIds));

    if (state.products.length === 0) {
      throw new Error('No valid products found in catalog.');
    }

    sanitizeCart();
    populateCategoryFilter();
    updateUI();
  } catch (err) {
    state.loadError = err.message;
    els.errorMessage.textContent = `Failed to load products: ${err.message}`;
    els.errorMessage.hidden = false;
    state.products = [];
    updateNoResultsVisibility();
  } finally {
    state.isLoading = false;
    setLoadingVisible(false);
  }
}

function populateCategoryFilter() {
  const categories = [...new Set(state.products.map((p) => p.category))].sort();
  const validCategories = new Set(categories);

  if (state.filters.category && !validCategories.has(state.filters.category)) {
    state.filters.category = '';
    els.categoryFilter.value = '';
  }

  const current = state.filters.category;
  els.categoryFilter.innerHTML =
    '<option value="">All Categories</option>' +
    categories
      .map(
        (cat) =>
          `<option value="${escapeAttr(cat)}"${cat === current ? ' selected' : ''}>${escapeHtml(cat)}</option>`
      )
      .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function getFilteredProducts() {
  const { search, category } = state.filters;
  const query = search.trim().toLowerCase();

  return state.products.filter((product) => {
    const matchesCategory = !category || product.category === category;
    const matchesSearch =
      !query ||
      product.title.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
}

function getProductById(id) {
  return state.products.find((p) => p.id === id);
}

function getCartQuantity(productId) {
  const item = state.cart.find((c) => c.id === productId);
  return item ? item.quantity : 0;
}

function bindImageFallback(img) {
  img.addEventListener('error', () => {
    if (img.src !== PLACEHOLDER_IMAGE) {
      img.src = PLACEHOLDER_IMAGE;
    }
  }, { once: true });
}

function buildProductCartControl(product) {
  const inCart = getCartQuantity(product.id);
  const outOfStock = product.stock === 0;
  const atMax = inCart >= product.stock;
  const title = escapeAttr(product.title);

  if (outOfStock) {
    return `<button type="button" class="btn btn-add" disabled>Out of Stock</button>`;
  }

  if (inCart === 0) {
    return `<button type="button" class="btn btn-add" data-action="add" data-id="${product.id}" aria-label="Add ${title} to cart">Add to Cart</button>`;
  }

  return `
    <div class="product-qty-controls" role="group" aria-label="Quantity for ${title}">
      <button type="button" class="qty-btn product-qty-btn" data-action="decrease" data-id="${product.id}" aria-label="Decrease quantity">−</button>
      <span class="product-qty-value" aria-live="polite">${inCart}</span>
      <button type="button" class="qty-btn product-qty-btn" data-action="increase" data-id="${product.id}" ${atMax ? 'disabled' : ''} aria-label="Increase quantity">+</button>
    </div>
  `;
}

function createProductCard(product) {
  const stockClass =
    product.stock === 0 ? 'out' : product.stock <= 5 ? 'low' : '';

  const card = document.createElement('article');
  card.className = 'product-card';
  card.setAttribute('role', 'listitem');
  card.dataset.productId = String(product.id);

  card.innerHTML = `
    <div class="product-image-wrap">
      <img class="product-image" src="${escapeAttr(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" width="400" height="400">
    </div>
    <div class="product-body">
      <span class="product-category">${escapeHtml(product.category)}</span>
      <h3 class="product-title">${escapeHtml(product.title)}</h3>
      <p class="product-description">${escapeHtml(product.description)}</p>
      <div class="product-footer">
        <span class="product-price">${formatCurrency(product.price)}</span>
        <span class="product-stock ${stockClass}">${product.stock === 0 ? 'Out of stock' : `${product.stock} in stock`}</span>
      </div>
      ${buildProductCartControl(product)}
    </div>
  `;

  bindImageFallback(card.querySelector('.product-image'));
  return card;
}

function updateNoResultsVisibility() {
  if (!els.noResults) return;

  const filtered = getFilteredProducts();
  const show =
    !state.isLoading &&
    !state.loadError &&
    state.products.length > 0 &&
    filtered.length === 0;

  els.noResults.hidden = !show;
}

function renderProducts() {
  const filtered = getFilteredProducts();
  const fragment = document.createDocumentFragment();

  filtered.forEach((product) => {
    fragment.appendChild(createProductCard(product));
  });

  els.productGrid.innerHTML = '';
  els.productGrid.appendChild(fragment);
  updateNoResultsVisibility();
}

function addToCart(productId) {
  if (!Number.isFinite(productId)) return;

  const product = getProductById(productId);
  if (!product || product.stock === 0) return;

  const existing = state.cart.find((c) => c.id === productId);

  if (existing) {
    if (existing.quantity >= product.stock) {
      showToast(`Only ${product.stock} available in stock.`, 'warning');
      return;
    }
    existing.quantity += 1;
  } else {
    state.cart.push({ id: productId, quantity: 1 });
  }

  persistCart();
  updateUI();
  showToast(`${product.title} added to cart.`);
}

function updateCartQuantity(productId, delta) {
  const product = getProductById(productId);
  const item = state.cart.find((c) => c.id === productId);
  if (!item || !product) return;

  const newQty = item.quantity + delta;

  if (newQty <= 0) {
    removeFromCart(productId, false);
    return;
  }

  if (newQty > product.stock) {
    showToast(`Only ${product.stock} available in stock.`, 'warning');
    return;
  }

  item.quantity = newQty;
  persistCart();
  updateUI();
}

function removeFromCart(productId, showMessage = true) {
  state.cart = state.cart.filter((c) => c.id !== productId);
  persistCart();
  updateUI();
  if (showMessage) {
    showToast('Item removed from cart.');
  }
}

function getCartTotalQuantity() {
  return state.cart.reduce((sum, item) => sum + item.quantity, 0);
}

function calculateLedger() {
  let subtotal = 0;

  state.cart.forEach((item) => {
    const product = getProductById(item.id);
    if (product) {
      subtotal += product.price * item.quantity;
    }
  });

  const tax = subtotal * TAX_RATE;
  const shipping =
    subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FLAT;
  const total = subtotal + tax + shipping;

  return { subtotal, tax, shipping, total };
}

function createCartItemElement(item) {
  const product = getProductById(item.id);
  if (!product) return null;

  const lineTotal = product.price * item.quantity;
  const atMax = item.quantity >= product.stock;

  const el = document.createElement('div');
  el.className = 'cart-item';
  el.setAttribute('role', 'listitem');
  el.dataset.productId = String(product.id);

  el.innerHTML = `
    <img class="cart-item-image" src="${escapeAttr(product.image)}" alt="" width="80" height="80">
    <div class="cart-item-details">
      <h4>${escapeHtml(product.title)}</h4>
      <p class="item-price">${formatCurrency(product.price)} each</p>
    </div>
    <div class="cart-item-controls">
      <div class="qty-controls" role="group" aria-label="Quantity for ${escapeAttr(product.title)}">
        <button type="button" class="qty-btn" data-action="decrease" data-id="${product.id}" aria-label="Decrease quantity">−</button>
        <span class="qty-value" aria-live="polite">${item.quantity}</span>
        <button type="button" class="qty-btn" data-action="increase" data-id="${product.id}" ${atMax ? 'disabled' : ''} aria-label="Increase quantity">+</button>
      </div>
      <button type="button" class="btn btn-remove" data-action="remove" data-id="${product.id}">Remove</button>
      <span class="cart-item-total">${formatCurrency(lineTotal)}</span>
    </div>
  `;

  const img = el.querySelector('.cart-item-image');
  img.alt = product.title;
  bindImageFallback(img);
  return el;
}

function renderCart() {
  sanitizeCart();

  const isEmpty = state.cart.length === 0;

  els.cartEmpty.hidden = !isEmpty;
  els.cartContent.hidden = isEmpty;

  if (isEmpty) {
    els.cartItems.innerHTML = '';
    if (els.checkoutBtn) els.checkoutBtn.disabled = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  state.cart.forEach((item) => {
    const el = createCartItemElement(item);
    if (el) fragment.appendChild(el);
  });

  els.cartItems.innerHTML = '';
  els.cartItems.appendChild(fragment);

  const { subtotal, tax, shipping, total } = calculateLedger();

  els.ledgerSubtotal.textContent = formatCurrency(subtotal);
  els.ledgerTax.textContent = formatCurrency(tax);
  els.ledgerShipping.textContent =
    shipping === 0 && subtotal > 0 ? 'FREE' : formatCurrency(shipping);
  els.ledgerTotal.textContent = formatCurrency(total);

  const qualifiesForFree =
    subtotal > 0 && subtotal < FREE_SHIPPING_THRESHOLD;
  els.freeShippingNote.hidden = !qualifiesForFree;

  if (els.checkoutBtn) {
    els.checkoutBtn.disabled = false;
    els.checkoutBtn.title = 'Demo storefront — checkout is not connected';
  }
}

function updateCartBadge() {
  const qty = getCartTotalQuantity();
  els.cartBadge.textContent = String(qty);
  els.cartBadge.hidden = qty === 0;

  if (els.cartNavBtn) {
    els.cartNavBtn.setAttribute(
      'aria-label',
      qty === 0 ? 'Cart, empty' : `Cart, ${qty} item${qty === 1 ? '' : 's'}`
    );
  }
}

function switchView(viewName) {
  if (viewName !== 'catalog' && viewName !== 'cart') return;
  if (state.activeView === viewName) return;

  state.activeView = viewName;

  els.catalogView.classList.toggle('active', viewName === 'catalog');
  els.cartView.classList.toggle('active', viewName === 'cart');
  els.catalogView.hidden = viewName !== 'catalog';
  els.cartView.hidden = viewName !== 'cart';

  $$('.nav-btn').forEach((btn) => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  if (viewName === 'cart') {
    renderCart();
  } else {
    renderProducts();
  }
}

function updateUI() {
  updateCartBadge();
  if (state.activeView === 'catalog') {
    renderProducts();
  } else {
    renderCart();
  }
}

function handleGridClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.disabled) return;

  const id = Number(btn.dataset.id);
  if (!Number.isFinite(id)) return;

  const action = btn.dataset.action;

  switch (action) {
    case 'add':
      addToCart(id);
      break;
    case 'increase':
      updateCartQuantity(id, 1);
      break;
    case 'decrease':
      updateCartQuantity(id, -1);
      break;
    default:
      break;
  }
}

function handleCartClick(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;

  if (!Number.isFinite(id)) return;

  switch (action) {
    case 'increase':
      updateCartQuantity(id, 1);
      break;
    case 'decrease':
      updateCartQuantity(id, -1);
      break;
    case 'remove':
      removeFromCart(id);
      break;
    default:
      break;
  }
}

function handleViewClick(e) {
  const viewBtn = e.target.closest('[data-view]');
  if (!viewBtn?.dataset.view) return;
  switchView(viewBtn.dataset.view);
}

function handleCheckoutClick() {
  showToast('Checkout is disabled in this demo storefront.', 'warning');
}

function bindEvents() {
  els.searchInput.addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderProducts();
  });

  els.categoryFilter.addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    renderProducts();
  });

  els.productGrid.addEventListener('click', handleGridClick);
  els.cartItems.addEventListener('click', handleCartClick);

  document.querySelector('.site-header')?.addEventListener('click', handleViewClick);
  document.querySelector('.site-footer')?.addEventListener('click', handleViewClick);
  els.cartEmpty?.addEventListener('click', handleViewClick);

  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  els.checkoutBtn?.addEventListener('click', handleCheckoutClick);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.toast.hidden) {
      clearTimeout(showToast._timer);
      els.toast.classList.remove('visible');
      els.toast.hidden = true;
    }
  });
}

function init() {
  cacheElements();

  const required = ['productGrid', 'loading', 'searchInput', 'categoryFilter'];
  if (required.some((key) => !els[key])) {
    console.error('Storefront: required DOM elements are missing.');
    return;
  }

  els.catalogView.hidden = false;
  els.cartView.hidden = true;

  loadCartFromStorage();
  bindEvents();
  updateCartBadge();
  fetchProducts();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
