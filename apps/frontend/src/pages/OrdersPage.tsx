import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Order } from '../api/types';

export default function OrdersPage() {
  const [open, setOpen] = useState<Order[]>([]);
  const [history, setHistory] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const [o, h] = await Promise.all([
        api.get<Order[]>('/orders/open'),
        api.get<Order[]>('/orders/history?pageSize=50'),
      ]);
      setOpen(o);
      setHistory(h);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function cancel(id: string) {
    try {
      await api.delete(`/orders/${id}`);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const renderRows = (orders: Order[], withCancel: boolean) =>
    orders.map((order) => (
      <tr key={order.id}>
        <td>{order.market?.symbol}</td>
        <td className={order.side === 'BUY' ? 'up' : 'down'}>{order.side}</td>
        <td>{order.type}</td>
        <td className="num">{order.price}</td>
        <td className="num">{order.quantity}</td>
        <td className="num">{order.filledQuantity}</td>
        <td>{order.status}</td>
        <td className="muted">{new Date(order.createdAt).toLocaleString()}</td>
        <td>
          {withCancel && (
            <button className="btn ghost" onClick={() => cancel(order.id)} type="button">
              Cancel
            </button>
          )}
        </td>
      </tr>
    ));

  return (
    <div className="page">
      <h1>Orders</h1>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <h2>Open</h2>
      <div className="panel" style={{ padding: 0, marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th>Type</th>
              <th className="num">Price</th>
              <th className="num">Qty</th>
              <th className="num">Filled</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {open.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No open orders
                </td>
              </tr>
            ) : (
              renderRows(open, true)
            )}
          </tbody>
        </table>
      </div>

      <h2>History</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Side</th>
              <th>Type</th>
              <th className="num">Price</th>
              <th className="num">Qty</th>
              <th className="num">Filled</th>
              <th>Status</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No orders yet
                </td>
              </tr>
            ) : (
              renderRows(history, false)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
