-- Store Studio v1. Safe, additive: preserves all legacy products and checkout records.
-- Execute only once in the correct D1 database before enabling /studio.html.
CREATE TABLE IF NOT EXISTS shop_categories (
 id TEXT PRIMARY KEY,
 name_fa TEXT NOT NULL,
 parent_id TEXT REFERENCES shop_categories(id) ON DELETE RESTRICT,
 sort_order INTEGER NOT NULL DEFAULT 1000,
 visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_shop_categories_sort ON shop_categories(parent_id,sort_order,id);
INSERT OR IGNORE INTO shop_categories(id,name_fa,parent_id,sort_order,visible) VALUES
 ('women','زنانه',NULL,10,1),
 ('men','مردانه',NULL,20,1),
 ('kids','بچگانه',NULL,30,1),
 ('socks','جوراب',NULL,40,1),
 ('accessories','اکسسوری',NULL,50,1);

CREATE TABLE IF NOT EXISTS shop_product_categories(
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 category_id TEXT NOT NULL REFERENCES shop_categories(id) ON DELETE CASCADE,
 PRIMARY KEY(product_id,category_id)
);
CREATE INDEX IF NOT EXISTS idx_shop_product_categories_cat ON shop_product_categories(category_id,product_id);
INSERT OR IGNORE INTO shop_product_categories(product_id,category_id)
 SELECT p.id,p.category FROM products p JOIN shop_categories c ON c.id=p.category;

CREATE TABLE IF NOT EXISTS shop_product_display(
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
 sort_order INTEGER NOT NULL DEFAULT 1000,
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1))
);
INSERT OR IGNORE INTO shop_product_display(product_id)
 SELECT id FROM products;

CREATE TABLE IF NOT EXISTS shop_home_sections(
 id TEXT PRIMARY KEY,
 name_fa TEXT NOT NULL,
 sort_order INTEGER NOT NULL,
 visible INTEGER NOT NULL DEFAULT 1 CHECK(visible IN (0,1))
);
INSERT OR IGNORE INTO shop_home_sections(id,name_fa,sort_order,visible) VALUES
 ('categories','دسته‌بندی‌ها',10,1),
 ('products','محصولات',20,1),
 ('collections','مجموعه‌های منتخب',30,1),
 ('promise','مزایای خرید',40,1),
 ('about','درباره فروشگاه',50,1);
