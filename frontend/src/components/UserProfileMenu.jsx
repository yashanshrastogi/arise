import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import ProfileSettingsModal from './ProfileSettingsModal';

export default function UserProfileMenu() {
  const {
    user,
    isAuthenticated,
    loginWithGoogle,
    logout,
    loading,
    error,
    authMode,
    isGuest,
  } = useAuth();

  // In guest mode (when VITE_AUTH_MODE isn't cognito-google), hide login and profile menu completely
  if (authMode !== 'cognito-google' || isGuest) {
    return null;
  }

  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  if (!isAuthenticated || !user) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          id="btn-sign-in"
          type="button"
          onClick={loginWithGoogle}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border shadow-sm disabled:opacity-60"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3.02h3.88c2.27-2.09 3.665-5.17 3.665-9.11z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.02c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.11C3.25 21.3 7.31 24 12 24z" />
            <path fill="#FBBC05" d="M5.28 14.3c-.24-.72-.38-1.49-.38-2.3s.14-1.58.38-2.3V6.59H1.26C.46 8.18 0 9.99 0 12s.46 3.82 1.26 5.41l4.02-3.11z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.26 6.59l4.02 3.11c.95-2.83 3.6-4.95 6.72-4.95z" />
          </svg>
          <span>{loading ? 'Connecting…' : 'Continue with Google'}</span>
        </button>

        {error && (
          <p role="alert" className="text-xs text-red-600 max-w-56">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        id="btn-user-profile"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="User profile menu"
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-2xl border shadow-sm"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
          {user.initials || 'U'}
        </div>
        <span className="hidden sm:inline text-xs font-bold t1">
          {user.name}
        </span>
        <span className="text-xs tm" aria-hidden="true">▾</span>
      </button>

      {menuOpen && (
        <div
          id="user-profile-dropdown"
          className="absolute right-0 mt-2 w-72 max-w-[90vw] rounded-2xl shadow-2xl p-4 border z-[3000]"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <div className="flex items-center gap-3 pb-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              {user.initials || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold t1 truncate">{user.name}</p>
              <p className="text-xs tm truncate">{user.email}</p>
            </div>
          </div>

          <div
            className="my-3 p-3 rounded-xl border"
            style={{
              background: 'var(--surface-alt)',
              borderColor: 'var(--border)',
            }}
          >
            <p className="text-xs font-bold t1">Account security</p>
            <p className="text-xs tm mt-1">
              Signed in through Google · Amazon Cognito
            </p>
            <p className="text-xs tm mt-1">{authMode}</p>
          </div>

          <button
            id="btn-profile-settings"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(true);
            }}
            className="w-full mb-2 rounded-xl border px-3 py-2.5 text-xs font-bold"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            Profile &amp; Locations
          </button>

          <button
            id="btn-sign-out"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void logout();
            }}
            className="w-full rounded-xl border border-rose-500/30 px-3 py-2.5 text-xs font-bold text-rose-600"
          >
            Sign out
          </button>
        </div>
      )}

      {profileOpen && (
        <ProfileSettingsModal
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}
