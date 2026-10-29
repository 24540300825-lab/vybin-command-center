import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';

export default function SignIn() {
  const { sendLink } = useAuth();
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setPhase('sending'); setError('');
    const err = await sendLink(email.trim());
    if (err) {
      setPhase('idle');
      setError(/rate|seconds|too many/i.test(err)
        ? 'Too many sign-in emails were requested. Wait a few minutes, then try again.'
        : "We couldn't send the email. Check the address and try again.");
    } else setPhase('sent');
  };

  return (
    <main className="centered">
      <div className="card narrow signin">
        <span className="mark big" aria-hidden>VB</span>
        <h1>VY/BIN Command Center</h1>
        {phase === 'sent' ? (
          <>
            <p>We sent a sign-in link to <strong>{email}</strong>. Open it on this device and you'll land back here, signed in.</p>
            <button className="btn" onClick={() => setPhase('idle')}>Use a different email</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p className="muted">Plan, brief and review everything for your 3D world in one place.</p>
            <label htmlFor="email">Your email</label>
            <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary" disabled={phase === 'sending'}>{phase === 'sending' ? 'Sending…' : 'Email me a sign-in link'}</button>
          </form>
        )}
      </div>
    </main>
  );
}
