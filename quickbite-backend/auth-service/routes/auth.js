// Deprecated legacy routes (Mongo/old API). Do not use.
throw new Error('Deprecated file: use src/routes/*.routes.js instead.');
const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);

module.exports = router;
