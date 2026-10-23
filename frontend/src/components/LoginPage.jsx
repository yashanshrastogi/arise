import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage({ onNavigateSignUp, onContinueGuest, onBack }) {
  const { loginWithGoogle, loginWithDirectCredentials, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const handleBack = onBack || onContinueGuest;

  // Support Escape key to close modal
  React.useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && handleBack) {
        handleBack();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setFormError('Please enter both email and password.');
      return;
    }

    setSubmitting(true);
    try {
      await loginWithDirectCredentials(cleanEmail, password);
      if (handleBack) {
        handleBack();
      }
    } catch (err) {
      let msg = err.message || 'Incorrect email or password.';
      if (err.code === 'NotAuthorizedException' || /incorrect/i.test(msg)) {
        msg = 'Incorrect email or password.';
      } else if (err.code === 'UserNotFoundException') {
        msg = 'No account found with this email. Please sign up.';
      } else if (err.code === 'UserNotConfirmedException') {
        msg = 'Account not verified. Please check your email for the verification code.';
      } else if (err.code === 'PasswordResetRequiredException') {
        msg = 'Password reset required for this account.';
      }
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md p-5 sm:p-8 rounded-3xl border shadow-2xl relative overflow-hidden my-auto animate-scaleUp"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Subtle brand glow accents */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navigation Strip: Back button & Close */}
      <div className="flex items-center justify-between w-full mb-3 relative z-10">
        <button
          id="btn-login-back"
          type="button"
          onClick={handleBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all border active:scale-95 t2 hover:t1"
          style={{
            background: 'var(--surface-alt)',
            borderColor: 'var(--border)',
          }}
          title="Return to previous page"
        >
          <span>←</span>
          <span>Back</span>
        </button>
        <button
          type="button"
          onClick={handleBack}
          className="w-7 h-7 rounded-xl flex items-center justify-center tm hover:bg-[var(--surface-alt)] hover:t1 transition-colors"
          aria-label="Close login dialog"
        >
          ✕
        </button>
      </div>

      {/* Brand header */}
      <div className="flex flex-col items-center mb-5 relative z-10">
        <div className="flex items-center gap-2.5 mb-2">
          <img src="/icon.png" alt="Arise" className="w-10 h-10 rounded-2xl shadow-md shadow-indigo-500/20" />
          <span className="text-2xl font-black tracking-tight t1">Arise</span>
        </div>
        <h2 className="text-xl font-black mt-1 t1">Welcome Back</h2>
        <p className="text-xs tm text-center mt-1">
          Sign in to access personalized air telemetry, alerts, and saved locations.
        </p>
      </div>

      {/* Google OAuth Button */}
      <button
        id="btn-login-google"
        type="button"
        onClick={loginWithGoogle}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-bold text-sm transition-all shadow-xs active:scale-[0.99] disabled:opacity-60 relative z-10 border hover:bg-[var(--surface-alt)]"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.02h3.88c2.27-2.09 3.665-5.17 3.665-9.11z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.02c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.11C3.25 21.3 7.31 24 12 24z" />
          <path fill="#FBBC05" d="M5.28 14.3c-.24-.72-.38-1.49-.38-2.3s.14-1.58.38-2.3V6.59H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.41l4.02-3.11z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.26 6.59l4.02 3.11c.95-2.83 3.6-4.95 6.72-4.95z" />
        </svg>
        <span>Continue with Google</span>
      </button>

      {/* Divider */}
      <div className="flex items-center my-4 text-xs relative z-10">
        <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
        <span className="px-3 uppercase tracking-wider font-extrabold text-[11px] tm">or with Cognito credentials</span>
        <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
      </div>

      {/* Email & Password Form */}
      <form onSubmit={handleSubmit} className="space-y-3.5 relative z-10">
        <div>
          <label htmlFor="input-login-email" className="block text-xs font-bold t1 mb-1">Email Address</label>
          <input
            id="input-login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
            style={{
              background: 'var(--surface-alt)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        <div>
          <label htmlFor="input-login-password" className="block text-xs font-bold t1 mb-1">Password</label>
          <div className="relative">
            <input
              id="input-login-password"
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium pr-12"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password as plain text'}
              className="absolute right-3 top-2.5 text-xs font-semibold tm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {(formError || authError) && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 font-medium">
            {formError || authError}
          </p>
        )}

        <button
          id="btn-login-submit"
          type="submit"
          disabled={submitting}
          className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/25 transition-all active:scale-[0.99] disabled:opacity-60"
        >
          {submitting ? 'Authenticating…' : 'Sign In with Email'}
        </button>
      </form>

      {/* Footer links */}
      <div
        className="mt-5 pt-4 border-t flex flex-col items-center gap-2 text-xs tm relative z-10"
        style={{ borderColor: 'var(--border)' }}
      >
        <p>
          Don't have an account?{' '}
          <button
            id="link-go-to-signup"
            type="button"
            onClick={onNavigateSignUp}
            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Sign Up
          </button>
        </p>

        <button
          id="btn-continue-guest-from-login"
          type="button"
          onClick={handleBack}
          className="tm hover:t1 underline mt-1 text-[11px] transition-colors"
        >
          ← Continue as Guest (Return to Dashboard)
        </button>
      </div>
    </div>
  );
}
