import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Balance } from '../api/types';

export default function WalletPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Balance[]>('/balances')
      .then(setBalances)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="page">
      <h1>Wallet</h1>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Available</th>
              <th className="num">Locked (in orders)</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="muted">
                  No balances yet — register to receive 100,000 test USDT.
                </td>
              </tr>
            )}
            {balances.map((balance) => (
              <tr key={balance.asset}>
                <td>
                  <strong>{balance.asset}</strong>
                </td>
                <td className="num">{balance.available}</td>
                <td className="num">{balance.locked}</td>
                <td className="num">
                  {(Number(balance.available) + Number(balance.locked)).toLocaleString('en-US', {
                    maximumFractionDigits: 8,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        Deposits and withdrawals (sandbox simulator) arrive in Milestone 4.
      </p>
    </div>
  );
}
