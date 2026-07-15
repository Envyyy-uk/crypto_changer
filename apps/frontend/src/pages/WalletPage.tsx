import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { AssetInfo, Balance, Deposit, Withdrawal } from '../api/types';

export default function WalletPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [depositAsset, setDepositAsset] = useState('USDT');
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMessage, setDepositMessage] = useState<string | null>(null);
  const [depositBusy, setDepositBusy] = useState(false);

  const [withdrawAsset, setWithdrawAsset] = useState('USDT');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [withdrawMessage, setWithdrawMessage] = useState<string | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);

  async function refreshAll() {
    try {
      const [b, a, d, w] = await Promise.all([
        api.get<Balance[]>('/balances'),
        api.get<AssetInfo[]>('/assets'),
        api.get<Deposit[]>('/wallets/deposits'),
        api.get<Withdrawal[]>('/wallets/withdrawals'),
      ]);
      setBalances(b);
      setAssets(a);
      setDeposits(d);
      setWithdrawals(w);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    refreshAll();
    // Poll so pending deposits/withdrawals visibly progress without a manual refresh.
    const timer = setInterval(refreshAll, 2000);
    return () => clearInterval(timer);
  }, []);

  async function submitDeposit(event: FormEvent) {
    event.preventDefault();
    setDepositBusy(true);
    setDepositMessage(null);
    try {
      await api.post('/wallets/deposits', { asset: depositAsset, amount: depositAmount });
      setDepositMessage(`Deposit of ${depositAmount} ${depositAsset} submitted — confirming shortly.`);
      setDepositAmount('');
      await refreshAll();
    } catch (e) {
      setDepositMessage((e as Error).message);
    } finally {
      setDepositBusy(false);
    }
  }

  async function submitWithdrawal(event: FormEvent) {
    event.preventDefault();
    setWithdrawBusy(true);
    setWithdrawMessage(null);
    try {
      await api.post('/wallets/withdrawals', {
        asset: withdrawAsset,
        amount: withdrawAmount,
        address: withdrawAddress,
      });
      setWithdrawMessage(`Withdrawal of ${withdrawAmount} ${withdrawAsset} submitted for processing.`);
      setWithdrawAmount('');
      setWithdrawAddress('');
      await refreshAll();
    } catch (e) {
      setWithdrawMessage((e as Error).message);
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Wallet</h1>
      {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="panel" style={{ padding: 0, marginBottom: 24 }}>
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        <div className="panel">
          <h2>Add test funds</h2>
          <form className="form" onSubmit={submitDeposit}>
            <div>
              <label>Asset</label>
              <select value={depositAsset} onChange={(e) => setDepositAsset(e.target.value)}>
                {assets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Amount</label>
              <input
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                inputMode="decimal"
                placeholder="1000"
                required
              />
            </div>
            {depositMessage && <div className="muted">{depositMessage}</div>}
            <button className="btn" disabled={depositBusy}>
              {depositBusy ? 'Submitting…' : 'Add test funds'}
            </button>
          </form>
        </div>

        <div className="panel">
          <h2>Withdraw</h2>
          <form className="form" onSubmit={submitWithdrawal}>
            <div>
              <label>Asset</label>
              <select value={withdrawAsset} onChange={(e) => setWithdrawAsset(e.target.value)}>
                {assets.map((a) => (
                  <option key={a.symbol} value={a.symbol}>
                    {a.symbol}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Amount</label>
              <input
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                inputMode="decimal"
                placeholder="100"
                required
              />
            </div>
            <div>
              <label>Test address</label>
              <input
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="test-address-anything"
                required
              />
            </div>
            {withdrawMessage && <div className="muted">{withdrawMessage}</div>}
            <button className="btn ghost" disabled={withdrawBusy}>
              {withdrawBusy ? 'Submitting…' : 'Withdraw'}
            </button>
          </form>
        </div>
      </div>

      <h2>Deposit history</h2>
      <div className="panel" style={{ padding: 0, marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Amount</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {deposits.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No deposits yet
                </td>
              </tr>
            ) : (
              deposits.map((d) => (
                <tr key={d.id}>
                  <td>{d.asset.symbol}</td>
                  <td className="num">{d.amount}</td>
                  <td className={d.status === 'CONFIRMED' ? 'up' : d.status === 'FAILED' ? 'down' : ''}>
                    {d.status}
                  </td>
                  <td className="muted">{new Date(d.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <h2>Withdrawal history</h2>
      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th className="num">Amount</th>
              <th>Address</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No withdrawals yet
                </td>
              </tr>
            ) : (
              withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.asset.symbol}</td>
                  <td className="num">{w.amount}</td>
                  <td className="muted">{w.address}</td>
                  <td className={w.status === 'COMPLETED' ? 'up' : w.status === 'REJECTED' || w.status === 'FAILED' ? 'down' : ''}>
                    {w.status}
                  </td>
                  <td className="muted">{new Date(w.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
