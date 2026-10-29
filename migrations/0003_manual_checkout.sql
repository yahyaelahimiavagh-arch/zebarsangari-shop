-- V3: manual checkout and editable public contact/payment settings.
-- Run after catalog and admin login migrations. No customer payment credentials stored.
CREATE TABLE IF NOT EXISTS shop_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  whatsapp TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  card_number TEXT NOT NULL DEFAULT '',
  card_holder TEXT NOT NULL DEFAULT '',
  orders_enabled INTEGER NOT NULL DEFAULT 0 CHECK (orders_enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO shop_settings(id) VALUES (1);

CREATE TABLE IF NOT EXISTS manual_orders (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  buyer_name TEXT NOT NULL,
  buyer_phone TEXT NOT NULL,
  city TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  contact_channel TEXT NOT NULL CHECK(contact_channel IN ('whatsapp','telegram','card')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','receipt_submitted','confirmed','shipped','cancelled')),
  subtotal_toman INTEGER NOT NULL CHECK(subtotal_toman>=0),
  receipt_object_key TEXT,
  receipt_mime TEXT,
  receipt_uploaded_at TEXT,
  upload_token_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_manual_orders_created ON manual_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_orders_status ON manual_orders(status,created_at DESC);

CREATE TABLE IF NOT EXISTS manual_order_lines (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES manual_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  variant_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  size_label TEXT NOT NULL,
  color_label TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  unit_price_toman INTEGER NOT NULL CHECK(unit_price_toman>=0),
  line_total_toman INTEGER NOT NULL CHECK(line_total_toman>=0)
);
CREATE INDEX IF NOT EXISTS idx_manual_order_lines_order ON manual_order_lines(order_id);

CREATE TABLE IF NOT EXISTS manual_order_rate (
  ip_hash TEXT PRIMARY KEY,
  window_start_ms INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
