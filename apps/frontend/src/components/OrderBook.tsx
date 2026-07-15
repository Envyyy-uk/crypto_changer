import { api } from '../api/client';
import { OrderBookSnapshot } from '../api/types';
import { usePolling } from '../hooks/usePolling';

function formatQty(value: string): string {
  const num = Number(value);
  return Number.isNaN(num) ? value : num.toLocaleString('en-US', { maximumFractionDigits: 8 });
}

function formatPrice(value: string): string {
  const num = Number(value);
  return Number.isNaN(num) ? value : num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
}

export default function OrderBook({ symbol }: { symbol: string }) {
  const book = usePolling<OrderBookSnapshot>(
    () => api.get<OrderBookSnapshot>(`/orderbook/${symbol}`),
    2000,
    [symbol],
  );

  const bids = book?.bids ?? [];
  // Best ask sits closest to the spread, so render asks highest-to-lowest.
  const asks = [...(book?.asks ?? [])].reverse();
  const bestBid = bids[0];
  const bestAsk = book?.asks[0];
  const spread =
    bestBid && bestAsk ? (Number(bestAsk.price) - Number(bestBid.price)).toFixed(2) : null;

  const row = (level: { price: string; quantity: string }, side: 'bid' | 'ask') => (
    <div
      key={`${side}-${level.price}`}
      style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 8px', fontSize: 12 }}
    >
      <span className={side === 'bid' ? 'up' : 'down'}>{formatPrice(level.price)}</span>
      <span className="muted num">{formatQty(level.quantity)}</span>
    </div>
  );

  return (
    <div>
      <h2>Order Book</h2>
      {!book ? (
        <p className="muted">Loading…</p>
      ) : asks.length === 0 && bids.length === 0 ? (
        <p className="muted">No open orders on this market yet.</p>
      ) : (
        <div>
          <div>{asks.map((level) => row(level, 'ask'))}</div>
          <div
            style={{
              padding: '6px 8px',
              borderTop: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              fontSize: 12,
            }}
            className="muted"
          >
            {spread !== null ? `Spread: ${spread}` : '—'}
          </div>
          <div>{bids.map((level) => row(level, 'bid'))}</div>
        </div>
      )}
    </div>
  );
}
