import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem('quickbite_cart');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('quickbite_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((p) => p.id === product.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + qty };
        return copy;
      }
      return [...prev, { ...product, qty }];
    });
  };

  const removeItem = (id) => setItems((prev) => prev.filter((p) => p.id !== id));
  const setQty = (id, qty) => setItems((prev) => prev.map((p) => (p.id === id ? { ...p, qty } : p)));
  const clear = () => setItems([]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((acc, it) => acc + (it.price || 0) * it.qty, 0);
    const tax = +(subtotal * 0.08).toFixed(2);
    const delivery = subtotal > 0 ? 2.5 : 0;
    const total = +(subtotal + tax + delivery).toFixed(2);
    return { subtotal, tax, delivery, total };
  }, [items]);

  const value = { items, addItem, removeItem, setQty, clear, totals, count: items.reduce((a, b) => a + b.qty, 0) };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
