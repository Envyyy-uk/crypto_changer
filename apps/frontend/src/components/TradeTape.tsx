import { api } from '../api/client';
import { RecentTrade } from '../api/types';
import { usePolling } from '../hooks/usePolling';

export default function TradeTape({ symbol }: { symbol: string }) {
  const trades = usePolling<RecentTrade[]>(
    () => api.get<RecentTrade[]>(`/trades/recent/${symbol}?limit=30`),
    2000,
    [symbol],
  );

  return (
    <div>
      <h2>Recent Trades</h2>
      {!trades ? (
        <p className="muted">Loading…</p>
      ) : trades.length === 0 ? (
        <p className="muted">No trades yet on this market.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Price</th>
              <th className="num">Quantity</th>
              <th className="num">Time</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td className={trade.side === 'BUY' ? 'up' : 'down'}>{trade.price}</td>
                <td className="num">{trade.quantity}</td>
                <td className="num muted">
                  {new Date(trade.createdAt).toLocaleTimeString('en-US', { hour12: false })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
