-- V4: Bale messenger contact settings only; existing shop and order tables unchanged.
-- No customer receipts are uploaded to Cloudflare after this release.
CREATE TABLE IF NOT EXISTS shop_bale_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  bale_phone TEXT NOT NULL DEFAULT '',
  bale_username TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO shop_bale_settings(id) VALUES (1);
