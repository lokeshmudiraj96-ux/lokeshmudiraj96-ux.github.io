// backend/routes/products.js
const express = require('express');
const router = express.Router();
const Product = require('../models/Product'); // your Product model

// GET /products?category=pizza&veg=true&minPrice=100&maxPrice=300&offer=true&sort=price_asc
router.get('/', async (req, res) => {
  try {
    const { category, veg, minPrice, maxPrice, offer, sort } = req.query;

    let filter = {};
    if (category) filter.category = category;
    if (veg) filter.veg = veg === 'true';
    if (offer) filter.offer = offer === 'true';
    if (minPrice || maxPrice) filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);

    // Sorting
    let sortOption = {};
    if (sort === 'price_asc') sortOption.price = 1;
    if (sort === 'price_desc') sortOption.price = -1;
    if (sort === 'rating') sortOption.rating = -1;
    if (sort === 'popularity') sortOption.popularity = -1;

    const products = await Product.find(filter).sort(sortOption);
    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
