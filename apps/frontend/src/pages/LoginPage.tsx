import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, setTokens } from '../api/client';

interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  requiresTwoFactor?: boolean;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<LoginResponse>('/auth/login', {
        email,
        password,
        ...(needsTwoFactor ? { twoFactorCode } : {}),
      });
      if (result.requiresTwoFactor) {
        setNeedsTwoFactor(true);
        return;
      }
      setTokens({ accessToken: result.accessToken!, refreshToken: result.refreshToken! });
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
              disabled={needsTwoFactor}
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
              disabled={needsTwoFactor}
              autoComplete="current-password"
            />
          </div>
          {needsTwoFactor && (
            <div>
              <label>Authenticator code</label>
              <input
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="123456 or a backup code"
                required
                autoFocus
              />
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={busy}>
            {busy ? 'Signing in…' : needsTwoFactor ? 'Verify' : 'Log in'}
          </button>
          {!needsTwoFactor && (
            <div className="muted">
              No account? <Link to="/register">Register</Link> — you get 100,000 test USDT.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
