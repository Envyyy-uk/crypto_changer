import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setTokens } from '../api/client';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tokens = await api.post<{ accessToken: string; refreshToken: string }>('/auth/login', {
        email,
        password,
      });
      setTokens(tokens);
      navigate('/markets');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h1>Log in</h1>
        <form className="form" onSubmit={submit}>
          <div>
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={busy}>
            {busy ? 'Signing in…' : 'Log in'}
          </button>
          <div className="muted">
            No account? <Link to="/register">Register</Link> — you get 100,000 test USDT.
          </div>
        </form>
      </div>
    </div>
  );
}
