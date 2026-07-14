import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/register', { email, password });
      navigate('/login');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="panel" style={{ maxWidth: 420, margin: '40px auto' }}>
        <h1>Create account</h1>
        <p className="muted" style={{ marginBottom: 16 }}>
          Sandbox exchange — new accounts receive 100,000 virtual USDT. No real funds.
        </p>
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
            <label>Password (min 10 characters)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" disabled={busy}>
            {busy ? 'Creating…' : 'Register'}
          </button>
          <div className="muted">
            Already registered? <Link to="/login">Log in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
