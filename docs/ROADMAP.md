# Zebar Sangari Shop — Production roadmap

**Status:** static demo only. This is not a secure order-taking application.

## Phase 1: demo (current)
- Persian RTL, mobile-first categories for women, men, kids.
- Product cards, size/color selection, search and local demo cart.
- Browser-only admin demo using localStorage.
- Self-contained artwork for the GitHub source preview.
- Cloudflare Workers static assets configuration.

## Phase 2: secure backend (not implemented)
- D1 database for products, variants, inventory, orders and migrations.
- Authenticated admin with session expiry, input validation and authorization.
- Secure upload pipeline with file type/size verification and image optimization.
- Transactional stock reservation, order cancellation and concurrency handling.
- Seller-owned product content, contact details, shipping and refund policies.
- Backups and data export.

## Phase 3: live commerce (not implemented)
- Verify Iranian users can reliably reach Cloudflare before launch.
- Iranian gateway integration (if eligible) with verified server-side callback and idempotency.
- Shipping, invoice, SMS/email notifications, audit logs and basic fraud prevention.
- Security, mobile UX, accessibility, SEO and real-device testing.

## Hosting / cost

Static Workers free-tier deployment can be tested with a free workers.dev hostname.
The future data and image storage design must be checked against current D1/KV/R2
free limits and any payment method requirements before promising $0 operation.
The .com domain has **not** been purchased or connected.

## Important

Do not use the public demo admin to manage real product data. Its content is
not private and its edits are saved only in the local browser. Real authentication
and database synchronization are required before accepting customers.
