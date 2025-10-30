module.exports = async function authMiddleware(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const token = m[1];

    const introspectUrl = process.env.AUTH_INTROSPECT_URL; // e.g., http://localhost:3001/api/auth/introspect
    if (introspectUrl) {
      try {
        const r = await fetch(introspectUrl, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token }) });
        if (!r.ok) return res.status(401).json({ success: false, message: 'Unauthorized' });
        const data = await r.json();
        if (!data.active) return res.status(401).json({ success: false, message: 'Unauthorized' });
        req.userId = data.user_id;
      } catch (e) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
    }

    // Optional: restrict by allowed audiences/roles via env ALLOWED_CLIENTS
    if (process.env.ALLOWED_CLIENTS) {
      const allowed = process.env.ALLOWED_CLIENTS.split(',').map(s => s.trim()).filter(Boolean);
      // In a full implementation, decode JWT and check 'azp' or 'aud'. Here we allow when list is empty or skip if no decode.
    }

    req.accessToken = token;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}
