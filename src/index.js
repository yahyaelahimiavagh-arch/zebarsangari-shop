// Worker entry point: static storefront + read-only catalog API. No checkout/admin writes.
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

const response = (body, status = 200) =>
  new Response(JSON.stringify(body), {status, headers: JSON_HEADERS});

const CATEGORY_SET = new Set(["women", "men", "kids", "socks", "accessories"]);

async function catalog(env, category) {
  const selected = CATEGORY_SET.has(category) ? category : null;
  const query = selected
    ? "SELECT id, slug, title_fa, description_fa, category, price_toman, compare_at_toman, created_at FROM products WHERE active = 1 AND category = ? ORDER BY created_at DESC LIMIT 48"
    : "SELECT id, slug, title_fa, description_fa, category, price_toman, compare_at_toman, created_at FROM products WHERE active = 1 ORDER BY created_at DESC LIMIT 48";
  const result = selected
    ? await env.DB.prepare(query).bind(selected).all()
    : await env.DB.prepare(query).all();
  const products = result.results || [];
  if (!products.length) return response({products: [], count: 0});

  const ids = products.map(p => p.id);
  const placeholders = ids.map(() => "?").join(",");
  const [variantRows, imageRows] = await Promise.all([
    env.DB.prepare(`SELECT id, product_id, sku, size_label, color_label, stock
      FROM product_variants WHERE active = 1 AND product_id IN (${placeholders})
      ORDER BY product_id, size_label, color_label`).bind(...ids).all(),
    env.DB.prepare(`SELECT id, product_id, object_key, alt_fa, position
      FROM product_images WHERE product_id IN (${placeholders})
      ORDER BY product_id, position`).bind(...ids).all()
  ]);
  const variantsById = new Map(ids.map(id => [id, []]));
  for (const v of (variantRows.results || [])) variantsById.get(v.product_id)?.push({
    id: v.id, sku: v.sku, size: v.size_label, color: v.color_label, stock: v.stock
  });
  const imagesById = new Map(ids.map(id => [id, []]));
  for (const im of (imageRows.results || [])) imagesById.get(im.product_id)?.push({
    id: im.id, key: im.object_key, alt: im.alt_fa, position: im.position
  });
  return response({
    count: products.length,
    products: products.map(p => ({
      id: p.id, slug: p.slug, title: p.title_fa, description: p.description_fa,
      category: p.category, priceToman: p.price_toman,
      compareAtToman: p.compare_at_toman,
      variants: variantsById.get(p.id), images: imagesById.get(p.id)
    }))
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "GET") {
      return response({error: "method_not_allowed"}, 405);
    }
    if (url.pathname === "/api/health") {
      return response({ok: true, catalogConfigured: Boolean(env.DB)});
    }
    if (url.pathname !== "/api/products") {
      return response({error: "not_found"}, 404);
    }
    if (!env.DB) {
      return response({error: "catalog_not_configured"}, 503);
    }
    try {
      return await catalog(env, url.searchParams.get("category"));
    } catch (error) {
      console.error("D1 catalog query failed:", error?.message);
      return response({error: "catalog_unavailable"}, 503);
    }
  }
};
