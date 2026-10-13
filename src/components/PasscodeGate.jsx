import { useState } from 'react';
import { api, AuthError, clearPasscode, setPasscode } from '../api.js';

export default function PasscodeGate({ onUnlock }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setPasscode(code.trim());
    try {
      await api.people(); // any authenticated call proves the code
      onUnlock();
    } catch (err) {
      clearPasscode();
      setError(err instanceof AuthError ? 'No group has that code.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={submit}>
        <h1 className="wordmark">
          <em>FRIFT</em>
        </h1>
        <label className="dark-field">
          What is your group code?
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </label>
        {error && (
          <p className="dark-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Checking…' : 'Enter group'}
        </button>
      </form>
    </main>
  );
}
