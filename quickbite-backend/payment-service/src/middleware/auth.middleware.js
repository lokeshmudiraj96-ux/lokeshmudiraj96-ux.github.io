module.exports = async function authMiddleware(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const token = m[1];
    const url = process.env.AUTH_INTROSPECT_URL; // e.g., http://localhost:3001/api/auth/introspect
    if (url) {
      try {
        const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token }) });
        const data = await r.json();
        if (!data.active) return res.status(401).json({ success: false, message: 'Unauthorized' });
        req.userId = data.user_id;
      } catch (e) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
    }
    req.accessToken = token;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}
