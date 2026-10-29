# Zebar Sangari Shop | فروشگاه زبرسنگری

A luxury, mobile-first **Persian RTL** storefront concept for women's, men's, and children's underwear, socks, and accessories, styled from the shop's supplied brand image. Prepared as a **Cloudflare Workers static-assets preview**.

> **IMPORTANT — DESIGN PROTOTYPE, NOT A LIVE E-COMMERCE SHOP**
>
> All 8 initial products, all prices, and artwork are placeholders. The "admin" at `/admin.html` writes into **this browser's localStorage only**. Updates do NOT sync to other browsers or customers, and there is NO admin authentication. The checkout button is deliberately disabled; no orders or payments are processed. Do not advertise or deploy the admin page as a production service.

## Contents

- `site/index.html` — single-file, responsive RTL storefront preview with embedded assets, CSS and JavaScript.
- `site/admin.html` — demo catalog editor. Data is saved to this browser only.
- `wrangler.jsonc` — Cloudflare Workers static asset configuration.

**This GitHub snapshot is the self-contained preview build.** The modular original sources, branding image and illustrations are available in the project's downloadable v1 ZIP.

## Run locally (free)

In the repository root:

```bash
python -m http.server 8787 --directory site
```

Open `http://localhost:8787/` and `http://localhost:8787/admin.html`. No npm install required for local preview.

## Deploy a free static *preview* to Cloudflare

Install Wrangler (Node.js 22+ recommended) or use `npx`:

```bash
npx wrangler login
npx wrangler deploy
```

Worker name is `zebarsangari-shop`; actual `workers.dev` URL depends on your Cloudflare account. Do not buy the `.com` before testing access from inside Iran. Do not enable real orders until the production backend and admin access control are built.

## Next milestone (production store)

1. Confirm the preview design, actual products, category tree, legal owner and business info.
2. Implement **authenticated** admin with protected API routes (login throttling, CSRF defense, file validation, sessions), not browser-only localStorage.
3. Use **Cloudflare D1** for products, per-size/per-color stock, order state and transactional inventory updates; **R2 or KV** for optimized images after cost/activation analysis. Minshop is a promising MIT-licensed Cloudflare-native backend reference: https://github.com/ddyy/minshop. **No code from Minshop has been copied into this prototype.**
4. Implement payment through a compatible Iranian gateway *only after* verifying merchant requirements, fee structure, secure callbacks, internet accessibility from Iran, and reconciliation. Provide a manual order test path first.
5. Add product and image CSV imports, order notifications, shipping rules, backups, privacy/return policies, size guide, SEO and accessibility testing.
6. Validate Workers/KV/D1 limits and availability before asserting a permanently zero-cost deployment. Use the same domain after tests.

**Designed for:** zebarsangarishop.com (domain availability is unverified).

## Ownership & license

The source files created for this prototype are provided for the store owner's adaptation. The supplied original brand image remains the property of its respective owner. No third-party store code is bundled.