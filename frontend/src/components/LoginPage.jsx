import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage({ onNavigateSignUp, onContinueGuest }) {
  const { loginWithGoogle, loginWithEmailPassword, loading, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError('');
    if (!email.trim() || !password.trim()) {
      setFormError('Please enter both email and password.');
      return;
    }
    // Launch Cognito authentication flow
    loginWithEmailPassword('login', { email: email.trim() });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
      <div className="w-full max-w-md p-8 rounded-3xl backdrop-blur-xl bg-white/10 dark:bg-slate-900/80 border border-white/20 shadow-2xl relative overflow-hidden">
        {/* Glow accents */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-purple-500/30 rounded-full blur-3xl pointer-events-none" />

        {/* Brand header */}
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center gap-3 mb-2">
            <img src="/icon.png" alt="Arise" className="w-11 h-11 rounded-2xl shadow-md shadow-indigo-500/30" />
            <span className="text-2xl font-black tracking-tight">Arise</span>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Delhi-NCR
            </span>
          </div>
          <h2 className="text-xl font-black mt-2">Welcome Back</h2>
          <p className="text-xs text-slate-300 text-center mt-1">
            Sign in to access personalized air telemetry, alerts, and saved locations.
          </p>
        </div>

        {/* Google OAuth Button */}
        <button
          id="btn-login-google"
          type="button"
          onClick={loginWithGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl font-bold text-sm bg-white text-slate-900 hover:bg-slate-100 transition-all shadow-md active:scale-[0.99] disabled:opacity-60"
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
        <div className="flex items-center my-5 text-xs text-slate-400">
          <div className="flex-1 border-t border-white/10" />
          <span className="px-3 uppercase tracking-wider font-semibold text-[10px]">or with Cognito credentials</span>
          <div className="flex-1 border-t border-white/10" />
        </div>

        {/* Email & Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Email Address</label>
            <input
              id="input-login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Password</label>
            <div className="relative">
              <input
                id="input-login-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/20 border border-white/10 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-200"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {(formError || authError) && (
            <p role="alert" className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-xl border border-red-500/20">
              {formError || authError}
            </p>
          )}

          <button
            id="btn-login-submit"
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition-all active:scale-[0.99] disabled:opacity-60"
          >
            {loading ? 'Authenticating…' : 'Sign In with Email'}
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-6 pt-4 border-t border-white/10 flex flex-col items-center gap-2.5 text-xs text-slate-300">
          <p>
            Don't have an account?{' '}
            <button
              id="link-go-to-signup"
              type="button"
              onClick={onNavigateSignUp}
              className="font-bold text-indigo-400 hover:text-indigo-300 underline"
            >
              Sign Up
            </button>
          </p>

          <button
            id="btn-continue-guest-from-login"
            type="button"
            onClick={onContinueGuest}
            className="text-slate-400 hover:text-slate-200 underline mt-1 text-[11px]"
          >
            ← Continue as Guest (Skip Sign In)
          </button>
        </div>
      </div>
    </div>
  );
}
