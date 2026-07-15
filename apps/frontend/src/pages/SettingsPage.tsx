import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { UserProfile } from '../api/types';

interface SetupResponse {
  secret: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshProfile() {
    try {
      setProfile(await api.get<UserProfile>('/users/me'));
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  useEffect(() => {
    refreshProfile();
  }, []);

  async function startSetup() {
    setBusy(true);
    setMessage(null);
    try {
      setSetup(await api.post<SetupResponse>('/auth/2fa/setup'));
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function confirmSetup(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<{ backupCodes: string[] }>('/auth/2fa/confirm', { code: confirmCode });
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setConfirmCode('');
      await refreshProfile();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function disableTwoFactor(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/auth/2fa/disable', { password: disablePassword, code: disableCode });
      setDisablePassword('');
      setDisableCode('');
      setMessage({ kind: 'success', text: 'Two-factor authentication disabled.' });
      await refreshProfile();
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h2>Two-factor authentication</h2>
        {message && <div className={message.kind} style={{ marginBottom: 12 }}>{message.text}</div>}

        {backupCodes ? (
          <div>
            <p className="success">2FA enabled. Save these backup codes — each works once, shown only now:</p>
            <div className="panel" style={{ background: 'var(--bg)', fontFamily: 'monospace', fontSize: 13 }}>
              {backupCodes.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
          </div>
        ) : profile?.twoFactorEnabled ? (
          <div>
            <p className="muted" style={{ marginBottom: 16 }}>
              2FA is currently <strong className="up">enabled</strong> on your account.
            </p>
            <form className="form" onSubmit={disableTwoFactor}>
              <div>
                <label>Password</label>
                <input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  required
                />
              </div>
              <div>
                <label>Authenticator or backup code</label>
                <input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} required />
              </div>
              <button className="btn ghost" disabled={busy}>
                {busy ? 'Disabling…' : 'Disable 2FA'}
              </button>
            </form>
          </div>
        ) : setup ? (
          <div>
            <p className="muted">Scan with your authenticator app, or enter the secret manually:</p>
            <img src={setup.qrCodeDataUrl} alt="2FA QR code" style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
            <p className="muted" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{setup.secret}</p>
            <form className="form" onSubmit={confirmSetup}>
              <div>
                <label>Enter the 6-digit code to confirm</label>
                <input
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  maxLength={6}
                  required
                  autoFocus
                />
              </div>
              <button className="btn" disabled={busy}>
                {busy ? 'Confirming…' : 'Confirm & enable'}
              </button>
            </form>
          </div>
        ) : (
          <div>
            <p className="muted" style={{ marginBottom: 16 }}>
              2FA is currently <strong className="down">disabled</strong> on your account.
            </p>
            <button className="btn" onClick={startSetup} disabled={busy}>
              {busy ? 'Starting…' : 'Enable 2FA'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
