<p align="center">
  <img src="assets/logo.svg" alt="SR's Catalogue" width="64" height="64">
</p>

<h1 align="center">SR's Catalogue</h1>

<p align="center">
  A client-side e-commerce storefront built with vanilla JavaScript — no frameworks, no build tools.
</p>

---

## About

SR's Catalogue is a dynamic online shopping experience that simulates a real storefront entirely in the browser. Instead of static pages, the app loads product data asynchronously, builds the interface at runtime, and updates the UI in response to user actions without full-page reloads.

The project bridges the gap between simple static websites and full single-page applications: it uses a clear data flow, in-memory state, and selective DOM updates while staying lightweight and dependency-free.

## Highlights

- Catalog — Twelve curated products across Electronics, Clothing, Accessories, and Home, with realistic INR pricing
- Search & filter — Instant text search across titles and descriptions, plus category filtering
- Smart cart — Add to cart from the grid; cards switch to inline + / − controls when an item is already in the cart
- Stock awareness — Quantity cannot exceed available inventory; controls disable at the limit
- Persistent cart — Cart contents survive refresh via localStorage
- Checkout summary — Live subtotal, 8% tax, and shipping (₹99 flat, free on orders over ₹999)
- Polished UI — Dark theme, responsive layout, accessible navigation, and custom branding

## Architecture

The HTML provides an empty structural shell. On load, the app fetches data.json, validates each product, and renders cards into the grid using a DocumentFragment to avoid layout thrashing.

User interactions flow through a single application state object: filters, cart items, and the active view (shop or cart). Every cart change serializes to storage and triggers a targeted re-render of the affected UI.

```
data.json  →  fetch & validate  →  state.products
                                        ↓
User input  →  state (filters / cart)  →  DOM update
                                        ↓
                              localStorage (cart)
```

## Built with

| Layer | Technology |
|-------|------------|
| Markup | HTML5 (semantic, accessible) |
| Styling | CSS3 (custom properties, Grid, Flexbox) |
| Logic | Vanilla JavaScript (ES6+) |
| Data | JSON product catalog |
| Persistence | localStorage |

## Author

Developed by Bharat Soni

---

<p align="center">
  <sub>Demo project · Product images via Unsplash</sub>
</p>