import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, isLoggedIn } from '../api/client';
import { Balance, Market, Order } from '../api/types';
import CandleChart from '../components/CandleChart';
import { formatPrice, useTickers } from '../hooks/useTickers';

export default function TradePage() {
  const { symbol = 'BTCUSDT' } = useParams();
  const tickers = useTickers();
  const ticker = tickers[symbol.toUpperCase()];
  const loggedIn = isLoggedIn();

  const [market, setMarket] = useState<Market | null>(null);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Market>(`/markets/${symbol}`).then(setMarket).catch(() => setMarket(null));
  }, [symbol]);

  async function refreshPrivate() {
    if (!isLoggedIn()) return;
    try {
      const [b, o] = await Promise.all([
        api.get<Balance[]>('/balances'),
        api.get<Order[]>('/orders/open'),
      ]);
      setBalances(b);
      setOpenOrders(o);
    } catch {
      /* not logged in / backend offline */
    }
  }

  useEffect(() => {
    refreshPrivate();
  }, [symbol]);

  const total = useMemo(() => {
    const p = Number(price);
    const q = Number(quantity);
    if (!p || !q || Number.isNaN(p) || Number.isNaN(q)) return null;
    return p * q;
  }, [price, quantity]);

  async function submitOrder(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/orders', {
        symbol: symbol.toUpperCase(),
        side,
        type: 'LIMIT',
        price,
        quantity,
      });
      setMessage({ kind: 'success', text: `${side} order placed` });
      setPrice('');
      setQuantity('');
      await refreshPrivate();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function cancelOrder(id: string) {
    try {
      await api.delete(`/orders/${id}`);
      await refreshPrivate();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  const base = symbol.toUpperCase().replace('USDT', '');
  const change = ticker ? Number(ticker.priceChangePercent24h) : 0;

  return (
    <div className="page">
      <div className="trade-grid">
        {/* Left: market info */}
        <div className="panel">
          <h2>
            {base}
            <span className="muted">/USDT</span>
          </h2>
          <div className="ticker-big">{formatPrice(ticker?.lastPrice)}</div>
          <div className={change >= 0 ? 'up' : 'down'} style={{ marginBottom: 12 }}>
            {ticker ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}% (24h)` : '—'}
          </div>
          <table>
            <tbody>
              <tr>
                <td className="muted">24h high</td>
                <td className="num">{formatPrice(ticker?.high24h)}</td>
              </tr>
              <tr>
                <td className="muted">24h low</td>
                <td className="num">{formatPrice(ticker?.low24h)}</td>
              </tr>
              {market && (
                <>
                  <tr>
                    <td className="muted">Tick size</td>
                    <td className="num">{market.tickSize}</td>
                  </tr>
                  <tr>
                    <td className="muted">Min notional</td>
                    <td className="num">{market.minimumNotional} USDT</td>
                  </tr>
                  <tr>
                    <td className="muted">Fee (maker/taker)</td>
                    <td className="num">
                      {(Number(market.makerFee) * 100).toFixed(2)}% / {(Number(market.takerFee) * 100).toFixed(2)}%
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Middle: candlestick chart (live external data) */}
        <div className="panel" style={{ minHeight: 440 }}>
          <CandleChart symbol={symbol.toUpperCase()} />
        </div>

        {/* Right: order form */}
        <div className="panel">
          <div className="side-tabs">
            <button
              className={`buy-tab${side === 'BUY' ? ' active' : ''}`}
              onClick={() => setSide('BUY')}
              type="button"
            >
              Buy
            </button>
            <button
              className={`sell-tab${side === 'SELL' ? ' active' : ''}`}
              onClick={() => setSide('SELL')}
              type="button"
            >
              Sell
            </button>
          </div>

          {loggedIn ? (
            <form className="form" onSubmit={submitOrder}>
              <div>
                <label>Limit price (USDT)</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={ticker ? Number(ticker.lastPrice).toFixed(2) : '0.00'}
                  inputMode="decimal"
                  required
                />
              </div>
              <div>
                <label>Quantity ({base})</label>
                <input
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00000"
                  inputMode="decimal"
                  required
                />
              </div>
              <div className="muted">
                Total: <strong>{total ? total.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—'}</strong> USDT
                {market && total !== null && (
                  <> · fee ≈ {(total * Number(market.takerFee)).toFixed(2)} USDT</>
                )}
              </div>
              <div className="muted">
                Available:{' '}
                {side === 'BUY'
                  ? `${balances.find((b) => b.asset === 'USDT')?.available ?? '0'} USDT`
                  : `${balances.find((b) => b.asset === base)?.available ?? '0'} ${base}`}
              </div>
              {message && <div className={message.kind}>{message.text}</div>}
              <button className={`btn ${side.toLowerCase()}`} disabled={busy}>
                {busy ? 'Placing…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${base}`}
              </button>
            </form>
          ) : (
            <p className="muted">
              <Link to="/login">Log in</Link> or <Link to="/register">register</Link> to trade.
            </p>
          )}
        </div>
      </div>

      {/* Open orders */}
      {loggedIn && (
        <div className="panel" style={{ marginTop: 12, padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Open orders</th>
                <th>Side</th>
                <th className="num">Price</th>
                <th className="num">Quantity</th>
                <th className="num">Filled</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {openOrders.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    No open orders
                  </td>
                </tr>
              )}
              {openOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.market?.symbol ?? symbol}</td>
                  <td className={order.side === 'BUY' ? 'up' : 'down'}>{order.side}</td>
                  <td className="num">{order.price}</td>
                  <td className="num">{order.quantity}</td>
                  <td className="num">{order.filledQuantity}</td>
                  <td>{order.status}</td>
                  <td>
                    <button className="btn ghost" onClick={() => cancelOrder(order.id)} type="button">
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
