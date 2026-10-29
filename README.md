# Zebar Sangari Shop | فروشگاه زبرسنگری

A luxury, mobile-first **Persian RTL** storefront concept for women's, men's, and children's underwear, socks, and accessories, styled from the shop's supplied brand image. Prepared as a **Cloudflare Workers storefront preview**, with a read-only API script and static assets.

> **IMPORTANT — DESIGN PROTOTYPE, NOT A LIVE E-COMMERCE SHOP**
>
> The initial mock catalog and old `/admin.html` localStorage demo are superseded in the secure-admin branch. The storefront reads live product data from D1, and `/manage.html` contains an authenticated catalog editor. Payment and customer orders are **not** implemented. This remains a pre-launch test version, and must pass the checklist in `docs/SMOKE-TEST-FA.md` before real products are added.

## Contents

- `site/index.html` — Persian RTL storefront using the live `/api/products` catalog. When D1 is empty, no demo products appear.
- `site/manage.html` — protected catalog editing interface (requires Cloudflare Secrets, D1 and KV); `/admin.html` redirects here.
- `site/admin.html` — retained legacy demo file, not the active admin interface.
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

Worker name is `zebarsangari-shop`; current test site is https://zebarsangari-shop.yahyaelahimiavagh.workers.dev/. The D1 binding is configured and the user has confirmed `/api/health` returned `catalogConfigured: true`. Do not buy the `.com` before testing access from inside Iran. Do not enable real orders or payments; only catalog editing is present. See `docs/SMOKE-TEST-FA.md`.

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