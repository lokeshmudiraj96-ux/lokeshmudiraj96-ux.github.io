import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export async function fetchProducts() {
  try {
    const res = await axios.get(`${API_BASE_URL}/catalog/products`);
    return res.data;
  } catch (error) {
    console.error('Failed to fetch products:', error);
    // Return fallback products for development
    return {
      products: [
        { id: 'p1', name: 'Margherita Pizza', price: 8.99, image: 'https://images.unsplash.com/photo-1548365328-9f547fb095de', tags: ['pizza', 'veg'] },
        { id: 'p2', name: 'Chicken Burger', price: 6.49, image: 'https://images.unsplash.com/photo-1561758033-d89a9ad46330', tags: ['burger'] },
        { id: 'p3', name: 'Pasta Alfredo', price: 7.99, image: 'https://images.unsplash.com/photo-1525755662778-989d0524087e', tags: ['pasta', 'veg'] },
        { id: 'p4', name: 'Sushi Combo', price: 12.5, image: 'https://images.unsplash.com/photo-1541542684-4a9c56d511d8', tags: ['sushi'] }
      ]
    };
  }
}
