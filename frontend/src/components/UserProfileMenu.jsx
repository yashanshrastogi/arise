import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';

/**
 * User Profile & Google Authentication Control
 *
 * Implements "Continue with Google" sign-in and user profile dropdown
 * with explicit local development mock labeling.
 */
export default function UserProfileMenu() {
  const { user, isAuthenticated, loginWithGoogle, logout, loading, authMode } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (!isAuthenticated) {
    return (
      <button
        id="btn-sign-in"
        onClick={loginWithGoogle}
        disabled={loading}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black border transition-all hover:scale-105 active:scale-95 shadow-sm"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          color: 'var(--text-primary)',
        }}
        title="Sign in with Google (Local Development Mock)"
      >
        {/* Google 'G' icon */}
        <svg width="15" height="15" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.02h3.88c2.27-2.09 3.665-5.17 3.665-9.11z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.02c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.11C3.25 21.3 7.31 24 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.3c-.24-.72-.38-1.49-.38-2.3s.14-1.58.38-2.3V6.59H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.41l4.02-3.11z"
          />
          <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.26 6.59l4.02 3.11c.95-2.83 3.6-4.95 6.72-4.95z"
          />
        </svg>
        <span>{loading ? 'Connecting...' : 'Sign in'}</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        id="btn-user-profile"
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-2xl border transition-all hover:bg-[var(--surface-alt)] shadow-sm"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        aria-label="User Profile Menu"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo to-purple-600 text-white flex items-center justify-center text-xs font-black shadow-sm">
          {user.initials || 'U'}
        </div>
        <span className="hidden sm:inline text-xs font-black t1">{user.name}</span>
        <span className="text-[10px] tm">▾</span>
      </button>

      {menuOpen && (
        <div
          id="user-profile-dropdown"
          className="absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl p-4 border animate-in fade-in zoom-in-95 duration-150 z-[3000]"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          {/* User Details */}
          <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo to-purple-600 text-white flex items-center justify-center text-sm font-black shadow-md">
              {user.initials || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-black t1 truncate">{user.name}</div>
              <div className="text-[11px] font-semibold tm truncate">{user.email}</div>
            </div>
          </div>

          {/* Architecture Status Pill */}
          <div className="my-3 p-2.5 rounded-xl border space-y-1" style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between text-[10px] font-black t1">
              <span>Auth Architecture</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold uppercase">Cognito Ready</span>
            </div>
            <div className="text-[10px] font-medium tm leading-tight">
              Federation: Google IdP via AWS Cognito · Mode: {authMode}
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            id="btn-sign-out"
            onClick={() => {
              setMenuOpen(false);
              logout();
            }}
            className="w-full py-2 px-3 rounded-xl text-xs font-extrabold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors flex items-center justify-center gap-1.5 border border-rose-500/20"
          >
            <span>🚪</span>
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
