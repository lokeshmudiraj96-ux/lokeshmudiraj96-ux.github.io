import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const OrdersContext = createContext(null);

export const useOrders = () => {
  const ctx = useContext(OrdersContext);
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider');
  return ctx;
};

const LS_KEY = 'quickbite_orders';

const STAGES = [
  { key: 'PLACED', at: 0 },
  { key: 'CONFIRMED', at: 5 },
  { key: 'PREPARING', at: 10 },
  { key: 'PICKED_UP', at: 15 },
  { key: 'OUT_FOR_DELIVERY', at: 25 },
  { key: 'DELIVERED', at: 40 },
];

function computeStatus(createdAtIso) {
  const createdAt = new Date(createdAtIso).getTime();
  const elapsed = Math.max(0, Math.floor((Date.now() - createdAt) / 1000));
  let current = STAGES[0].key;
  for (const s of STAGES) {
    if (elapsed >= s.at) current = s.key; else break;
  }
  return current;
}

function etaSeconds(createdAtIso) {
  const createdAt = new Date(createdAtIso).getTime();
  const eta = createdAt + STAGES[STAGES.length - 1].at * 1000;
  return Math.max(0, Math.floor((eta - Date.now()) / 1000));
}

export const OrdersProvider = ({ children }) => {
  const [orders, setOrders] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  // Tick every second to update derived statuses in UI
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(orders)); } catch {}
  }, [orders]);

  const placeOrder = useCallback((payload) => {
    const id = `ord_${Math.random().toString(36).slice(2, 10)}`;
    const createdAt = new Date().toISOString();
    const order = { id, createdAt, ...payload };
    setOrders((prev) => [order, ...prev]);
    return order;
  }, []);

  const clearOrders = useCallback(() => setOrders([]), []);

  const value = useMemo(() => ({
    orders,
    placeOrder,
    clearOrders,
    // Derived helpers
    getStatus: (o) => computeStatus(o.createdAt),
    getEtaSeconds: (o) => etaSeconds(o.createdAt),
    stages: STAGES,
    tick,
  }), [orders, placeOrder, clearOrders, tick]);

  return <OrdersContext.Provider value={value}>{children}</OrdersContext.Provider>;
};
