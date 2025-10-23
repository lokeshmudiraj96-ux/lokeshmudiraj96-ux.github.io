import axios from 'axios';

const DEMO_MODE = process.env.REACT_APP_DEMO_MODE === 'true';

const demoProducts = [
  { id: 'p1', name: 'Margherita Pizza', price: 8.99, image: 'https://images.unsplash.com/photo-1548365328-9f547fb095de', tags: ['pizza', 'veg'] },
  { id: 'p2', name: 'Chicken Burger', price: 6.49, image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330', tags: ['burger'] },
  { id: 'p3', name: 'Pasta Alfredo', price: 7.99, image: 'https://images.unsplash.com/photo-1525755662778-989d0524087e', tags: ['pasta', 'veg'] },
  { id: 'p4', name: 'Sushi Combo', price: 12.5, image: 'https://images.unsplash.com/photo-1541542684-4a9c56d511d8', tags: ['sushi'] }
];

export async function fetchProducts() {
  if (DEMO_MODE) return { products: demoProducts };
  const res = await axios.get('/catalog/products');
  return res.data;
}
