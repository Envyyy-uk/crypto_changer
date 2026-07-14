import { useNavigate } from 'react-router-dom';
import { formatPrice, useTickers } from '../hooks/useTickers';

const MARKETS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin' },
  { symbol: 'ETHUSDT', name: 'Ethereum' },
  { symbol: 'SOLUSDT', name: 'Solana' },
];

export default function MarketsPage() {
  const tickers = useTickers();
  const navigate = useNavigate();

  return (
    <div className="page">
      <h1>Markets</h1>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th className="num">Last price</th>
              <th className="num">24h change</th>
              <th className="num">24h high</th>
              <th className="num">24h low</th>
              <th className="num">24h volume (USDT)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {MARKETS.map(({ symbol, name }) => {
              const t = tickers[symbol];
              const change = t ? Number(t.priceChangePercent24h) : 0;
              return (
                <tr key={symbol} className="clickable" onClick={() => navigate(`/trade/${symbol}`)}>
                  <td>
                    <strong>{symbol.replace('USDT', '')}</strong>
                    <span className="muted"> /USDT</span>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {name}
                    </div>
                  </td>
                  <td className="num">{formatPrice(t?.lastPrice)}</td>
                  <td className={`num ${change >= 0 ? 'up' : 'down'}`}>
                    {t ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : '—'}
                  </td>
                  <td className="num">{formatPrice(t?.high24h)}</td>
                  <td className="num">{formatPrice(t?.low24h)}</td>
                  <td className="num">
                    {t ? Number(t.quoteVolume24h).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
                  </td>
                  <td>
                    {t && <span className={`badge ${t.stale ? 'stale' : 'live'}`}>{t.stale ? 'STALE' : 'LIVE'}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Prices are streamed live from an external exchange. Trading on CX uses its own order book.
      </p>
    </div>
  );
}
