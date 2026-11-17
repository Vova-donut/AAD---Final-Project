import { useState } from 'react';
import { api } from '../lib/api.js';
import { credentialsSchema, registerSchema } from '../../shared/validation.js';
// Accessible controlled form shares validation rules with the API.
export default function AuthForm({ onLogin }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const data = (register ? registerSchema : credentialsSchema).parse(values);
      const result = await api(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: data,
      });
      onLogin(result.user);
    } catch (e) {
      setError(e.issues?.map((i) => i.message).join('. ') || e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-intro">
        <div className="wordmark">
          SP <span>Study Planner</span>
        </div>
        <p className="eyebrow">A LITTLE STRUCTURE. MORE ROOM TO LEARN.</p>
        <h1>
          Make space
          <br />
          for your next
          <br />
          <em>good idea.</em>
        </h1>
        <p>Keep coursework in view, plan focused study time, and take your schedule with you.</p>
        <div className="auth-foot">YOUR WORK, AT YOUR PACE.</div>
      </section>
      <section className="auth-form">
        <p className="eyebrow">YOUR STUDY SPACE</p>
        <h2>{register ? 'Start your planner' : 'Welcome back'}</h2>
        <p>
          {register
            ? 'Create an account to organise your semester.'
            : 'Sign in to pick up where you left off.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Your name
              <input name="name" autoComplete="name" required minLength={2} maxLength={60} />
            </label>
          )}
          <label>
            Email address
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={10}
              maxLength={128}
            />
            <small>At least 10 characters</small>
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
        <p className="privacy-note">Your tasks and study sessions are private to your account.</p>
      </section>
    </div>
  );
}
