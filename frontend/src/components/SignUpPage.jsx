import React, { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import {
  directCognitoSignUp,
  directCognitoConfirmSignUp,
  directCognitoResendCode,
} from '../auth/cognitoAuth';

export default function SignUpPage({ onNavigateLogin, onContinueGuest, onBack }) {
  const { loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleBack = onBack || onContinueGuest;

  // Confirmation step state
  const [step, setStep] = useState('signup'); // 'signup' | 'confirm' | 'confirmed'
  const [confirmationCode, setConfirmationCode] = useState('');
  const [resending, setResending] = useState(false);

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setFormError('Please fill in all required fields.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSymbol = /[^A-Za-z0-9]/.test(password);

    if (password.length < 8 || !hasUpper || !hasLower || !hasNumber || !hasSymbol) {
      setFormError(
        'Password must be at least 8 characters and include uppercase (A-Z), lowercase (a-z), numbers (0-9), and at least one special symbol (e.g. @, #, $, !).'
      );
      return;
    }

    setLoading(true);
    try {
      await directCognitoSignUp({ email: cleanEmail, password });
      setStep('confirm');
      setSuccessMsg(`Verification code sent to ${cleanEmail}. Please enter it below to activate your account.`);
    } catch (err) {
      let msg = err.message || 'Registration failed. Please try again.';
      if (err.code === 'UsernameExistsException') {
        msg = 'An account with this email already exists. Please sign in instead.';
      } else if (err.code === 'InvalidPasswordException' || /symbol|character policy/i.test(err.message || '')) {
        msg = 'Password must be at least 8 characters and include uppercase, lowercase, numbers, and at least one special symbol (e.g. @, #, $, !).';
      }
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccessMsg('');

    if (!confirmationCode.trim()) {
      setFormError('Please enter the 6-digit confirmation code.');
      return;
    }

    setLoading(true);
    try {
      await directCognitoConfirmSignUp({
        email: email.trim(),
        code: confirmationCode.trim(),
      });
      setStep('confirmed');
      setSuccessMsg('Account successfully verified! You can now sign in.');
      setTimeout(() => {
        if (onNavigateLogin) onNavigateLogin();
      }, 2000);
    } catch (err) {
      let msg = err.message || 'Verification failed. Please check the code.';
      if (err.code === 'CodeMismatchException') {
        msg = 'Invalid 6-digit code. Please check the code in your email and try again.';
      } else if (err.code === 'ExpiredCodeException') {
        msg = 'The verification code has expired. Click below to request a new one.';
      }
      setFormError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setFormError('');
    setResending(true);
    try {
      await directCognitoResendCode({ email: email.trim() });
      setSuccessMsg(`A fresh 6-digit activation code has been resent to ${email.trim()}.`);
    } catch (err) {
      setFormError(err.message || 'Unable to resend code right now. Please wait a moment.');
    } finally {
      setResending(false);
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
          id="btn-signup-back"
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
          aria-label="Close signup dialog"
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
        <h2 className="text-xl font-black mt-1 t1">
          {step === 'confirm' ? 'Verify Your Email' : step === 'confirmed' ? 'Account Verified!' : 'Create an Account'}
        </h2>
        <p className="text-xs tm text-center mt-1">
          {step === 'confirm'
            ? 'Enter the 6-digit activation code sent to your inbox.'
            : step === 'confirmed'
            ? 'Your account is now active and ready to use.'
            : 'Join Arise to personalize environmental verdicts for your home, work, and family.'}
        </p>
      </div>

      {/* STEP 1: Registration Form */}
      {step === 'signup' && (
        <div className="relative z-10">
          {/* Google OAuth Button */}
          <button
            id="btn-signup-google"
            type="button"
            onClick={loginWithGoogle}
            disabled={loading}
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
            <span>Sign Up with Google</span>
          </button>

          {/* Divider */}
          <div className="flex items-center my-4 text-xs">
            <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
            <span className="px-3 uppercase tracking-wider font-extrabold text-[10px] tm">or direct in-app registration</span>
            <div className="flex-1 border-t" style={{ borderColor: 'var(--border)' }} />
          </div>

          <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold t1 mb-1">Email Address</label>
              <input
                id="input-signup-email"
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
              <label className="block text-xs font-bold t1 mb-1">Password (min. 8 characters)</label>
              <div className="relative">
                <input
                  id="input-signup-password"
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
                  className="absolute right-3 top-2.5 text-xs font-semibold tm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>

              {/* Live Password Requirements Checklist */}
              {password.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-semibold p-2.5 rounded-xl border bg-[var(--surface)]" style={{ borderColor: 'var(--border)' }}>
                  <span className={`flex items-center gap-1 ${password.length >= 8 ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'tm'}`}>
                    <span>{password.length >= 8 ? '✓' : '○'}</span>
                    <span>8+ characters</span>
                  </span>
                  <span className={`flex items-center gap-1 ${/[A-Z]/.test(password) && /[a-z]/.test(password) ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'tm'}`}>
                    <span>{/[A-Z]/.test(password) && /[a-z]/.test(password) ? '✓' : '○'}</span>
                    <span>Upper &amp; lower case</span>
                  </span>
                  <span className={`flex items-center gap-1 ${/[0-9]/.test(password) ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'tm'}`}>
                    <span>{/[0-9]/.test(password) ? '✓' : '○'}</span>
                    <span>Number (0–9)</span>
                  </span>
                  <span className={`flex items-center gap-1 ${/[^A-Za-z0-9]/.test(password) ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-amber-600 dark:text-amber-400 font-bold'}`}>
                    <span>{/[^A-Za-z0-9]/.test(password) ? '✓' : '○'}</span>
                    <span>Symbol (!@#$%)</span>
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold t1 mb-1">Confirm Password</label>
              <input
                id="input-signup-confirm-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 font-medium"
                style={{
                  background: 'var(--surface-alt)',
                  borderColor: 'var(--border)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>

            {formError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 font-medium">
                {formError}
              </p>
            )}

            <button
              id="btn-signup-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/25 transition-all active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? 'Creating Account…' : 'Create Account'}
            </button>
          </form>
        </div>
      )}

      {/* STEP 2: In-App Email Code Confirmation */}
      {step === 'confirm' && (
        <form onSubmit={handleConfirmSubmit} className="space-y-4 relative z-10">
          {successMsg && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 font-medium">
              {successMsg}
            </p>
          )}

          <div>
            <label className="block text-xs font-bold t1 mb-1">6-Digit Verification Code</label>
            <input
              id="input-signup-code"
              type="text"
              maxLength={6}
              required
              autoFocus
              value={confirmationCode}
              onChange={(e) => setConfirmationCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              className="w-full text-center text-2xl tracking-widest font-mono py-3 rounded-xl border text-indigo-600 dark:text-indigo-400 font-black outline-none transition-all focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              style={{
                background: 'var(--surface-alt)',
                borderColor: 'var(--border)',
              }}
            />
          </div>

          <div
            className="text-[11px] p-3 rounded-xl border space-y-1"
            style={{
              background: 'var(--surface-alt)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="font-bold flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
              <span>💡</span>
              <span>Didn't receive the email in your inbox?</span>
            </div>
            <p className="text-[10.5px] leading-relaxed tm">
              1. Check your <strong>Spam</strong>, <strong>Junk</strong>, or <strong>Promotions</strong> folder for an email from <code>no-reply@verificationemail.com</code>.
            </p>
            <p className="text-[10.5px] leading-relaxed tm">
              2. You can also sign in directly using <strong>Google OAuth</strong> (no verification code required).
            </p>
          </div>

          {formError && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 p-2.5 rounded-xl border border-red-500/20 font-medium">
              {formError}
            </p>
          )}

          <button
            id="btn-confirm-code-submit"
            type="submit"
            disabled={loading || confirmationCode.length < 6}
            className="w-full py-3 px-4 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/25 transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? 'Verifying Code…' : 'Verify & Confirm Account'}
          </button>

          <div className="flex items-center justify-between text-xs tm pt-2">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resending}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-bold disabled:opacity-50"
            >
              {resending ? 'Resending code…' : 'Resend verification code'}
            </button>
            <button
              type="button"
              onClick={() => setStep('signup')}
              className="tm hover:t1 underline"
            >
              Change email
            </button>
          </div>
        </form>
      )}

      {/* STEP 3: Confirmed Success State */}
      {step === 'confirmed' && (
        <div className="text-center py-6 space-y-3 relative z-10">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-3xl mx-auto animate-bounce font-black">
            ✓
          </div>
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{successMsg}</p>
        </div>
      )}

      {/* Footer links */}
      <div
        className="mt-6 pt-4 border-t flex flex-col items-center gap-2.5 text-xs tm relative z-10"
        style={{ borderColor: 'var(--border)' }}
      >
        <p>
          Already have an account?{' '}
          <button
            id="link-go-to-login"
            type="button"
            onClick={onNavigateLogin}
            className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Sign In
          </button>
        </p>

        <button
          id="btn-continue-guest-from-signup"
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
