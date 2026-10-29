-- Zebar Sangari catalog schema v1 (Cloudflare D1 / SQLite).
-- Prices use integer Tomans, never floating-point amounts.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_fa TEXT NOT NULL CHECK(length(title_fa) BETWEEN 1 AND 180),
  description_fa TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK(category IN ('women','men','kids','socks','accessories')),
  price_toman INTEGER NOT NULL CHECK(price_toman >= 0),
  compare_at_toman INTEGER CHECK(compare_at_toman IS NULL OR compare_at_toman >= 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category,active,created_at DESC);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT UNIQUE,
  size_label TEXT NOT NULL DEFAULT 'فری‌سایز',
  color_label TEXT NOT NULL DEFAULT 'پیش‌فرض',
  stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  UNIQUE(product_id,size_label,color_label)
);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL,
  alt_fa TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(product_id,object_key)
);
CREATE INDEX IF NOT EXISTS idx_images_product_position ON product_images(product_id,position);
