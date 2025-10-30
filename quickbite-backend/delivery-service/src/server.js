const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const compression = require('compression');

dotenv.config();

const routes = require('./routes/delivery.routes');
const { ensureSchema, seedAgentsIfEmpty } = require('./models/delivery.model');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(compression());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'delivery-service', time: new Date().toISOString() }));
app.use('/api/delivery', routes);

const PORT = process.env.PORT || 3006;
ensureSchema().then(async () => {
  if ((process.env.SEED_AGENTS || '').toLowerCase() === 'true' || process.env.NODE_ENV !== 'production') {
    try {
      const r = await seedAgentsIfEmpty();
      if (r.created) console.log(`Seeded demo delivery agent: ${r.agent_id}`);
    } catch (e) {
      console.warn('Agent seeding skipped/failed:', e.message);
    }
  }
  app.listen(PORT, () => console.log(`🚚 Delivery Service running on ${PORT}`));
}).catch((e) => {
  console.error('Failed to init schema', e);
  process.exit(1);
});

module.exports = app;
