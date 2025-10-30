const pool = require('../config/database');

function isFiniteNumber(n) { return typeof n === 'number' && Number.isFinite(n); }
function toNumber(v) { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) ? n : NaN; }

function validateLatLng(latRaw, lngRaw) {
  const lat = toNumber(latRaw);
  const lng = toNumber(lngRaw);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return { ok: false };
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { ok: false };
  return { ok: true, lat, lng };
}

// GET /api/catalog/merchants
// Query params: lat, lng (required), radius (m, optional), q (optional), min_rating (optional), page, page_size
exports.discoverMerchants = async (req, res) => {
  const { lat: latRaw, lng: lngRaw, radius: radiusRaw, q, min_rating, page: pageRaw, page_size: sizeRaw } = req.query;

  const loc = validateLatLng(latRaw, lngRaw);
  if (!loc.ok) {
    return res.status(400).json({ success: false, message: 'Invalid or missing lat/lng', code: 'INVALID_LOCATION' });
  }

  const lat = loc.lat, lng = loc.lng;
  const radius = Math.max(0, toNumber(radiusRaw) || 5000); // default 5km
  const minRating = toNumber(min_rating);
  const page = Math.max(1, parseInt(pageRaw || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(sizeRaw || '20', 10)));

  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) {
    return res.status(400).json({ success: false, message: 'Invalid page or page_size', code: 'INVALID_PAGINATION' });
  }

  // Base SQL with distance using Haversine formula (meters)
  const whereClauses = ['r.is_active = true'];
  const params = [lat, lng, lat]; // used in distance formula
  let paramIdx = params.length;

  if (q && typeof q === 'string' && q.trim().length > 0) {
    params.push(`%${q.trim().toLowerCase()}%`);
    paramIdx = params.length;
    whereClauses.push(`(LOWER(r.name) LIKE $${paramIdx} OR LOWER(r.cuisine_type) LIKE $${paramIdx})`);
  }
  if (Number.isFinite(minRating)) {
    params.push(minRating);
    whereClauses.push(`r.average_rating >= $${params.length}`);
  }

  const distanceExpr = `(
    6371000 * acos(
      cos(radians($1)) * cos(radians(r.latitude)) * cos(radians(r.longitude) - radians($2)) +
      sin(radians($3)) * sin(radians(r.latitude))
    )
  )`;

  // Count first
  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM restaurants r
    WHERE ${whereClauses.join(' AND ')}
      AND ${distanceExpr} <= $${params.length + 1}
  `;
  const countParams = [...params, radius];

  // Page
  const offset = (page - 1) * pageSize;
  const dataSql = `
    SELECT r.id, r.name, r.latitude AS lat, r.longitude AS lng, r.average_rating AS rating_avg,
           ${distanceExpr} AS distance_m
    FROM restaurants r
    WHERE ${whereClauses.join(' AND ')}
      AND ${distanceExpr} <= $${params.length + 1}
    ORDER BY distance_m ASC, r.average_rating DESC NULLS LAST, r.name ASC
    LIMIT $${params.length + 2} OFFSET $${params.length + 3}
  `;
  const dataParams = [...params, radius, pageSize, offset];

  try {
    const client = await pool.connect();
    try {
      const countRes = await client.query(countSql, countParams);
      const dataRes = await client.query(dataSql, dataParams);
      return res.json({
        page,
        page_size: pageSize,
        total_items: countRes.rows[0]?.total || 0,
        merchants: dataRes.rows,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('discoverMerchants error', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

// GET /api/catalog/merchants/:id
exports.getMerchantById = async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, name, latitude AS lat, longitude AS lng, average_rating AS rating_avg FROM restaurants WHERE id = $1 AND is_active = true',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: 'Merchant not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('getMerchantById error', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};

// GET /api/catalog/merchants/:id/menu
exports.getMerchantMenu = async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await pool.query('SELECT id FROM restaurants WHERE id = $1 AND is_active = true', [id]);
    if (merchant.rows.length === 0) return res.status(404).json({ success: false, message: 'Merchant not found' });

    const { rows } = await pool.query(
      `SELECT id, name, ROUND(price * 100)::int AS price_cents, (NOT is_available) AS is_out_of_stock
       FROM menu_items WHERE restaurant_id = $1 ORDER BY is_featured DESC, display_order ASC, name ASC`,
      [id]
    );
    return res.json({ items: rows });
  } catch (err) {
    console.error('getMerchantMenu error', err);
    return res.status(500).json({ success: false, message: 'Internal error' });
  }
};
