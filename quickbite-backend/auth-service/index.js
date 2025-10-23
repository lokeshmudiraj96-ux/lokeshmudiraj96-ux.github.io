// Deprecated legacy file (Mongo/old API). Do not use.
// The service entrypoint is src/server.js using SQL Server. This stub remains only to avoid accidental usage.
throw new Error('Deprecated file: use src/server.js instead.');
const express = require('express');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const cors = require('cors');
const bodyParser = require('body-parser');

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
    res.send('Auth Service is running');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
