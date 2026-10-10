import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import ProfileSettingsModal from './ProfileSettingsModal';

export default function UserProfileMenu({ onNavigateAuth, onProfileUpdated }) {
  const {
    user,
    isAuthenticated,
    logout,
    error,
  } = useAuth();

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

  const handleGoToLogin = () => {
    if (onNavigateAuth) {
      onNavigateAuth('login');
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/login';
    }
  };

  const handleGoToSignUp = () => {
    if (onNavigateAuth) {
      onNavigateAuth('signup');
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/signup';
    }
  };

  // Unauthenticated / Guest View: Show Sign In and Contextual "Save Locations" CTA
  if (!isAuthenticated || !user) {
    return (
      <div className="flex items-center gap-2">
        <button
          id="btn-header-login"
          type="button"
          onClick={handleGoToLogin}
          className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all hover:bg-[var(--surface-alt)] shadow-xs"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
          }}
          title="Sign in with email or Google"
        >
          Sign In
        </button>

        <button
          id="btn-header-signup"
          type="button"
          onClick={handleGoToSignUp}
          className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5"
          title="Registered users can save Home and Work locations to personalize environmental insights"
        >
          <span className="hidden xl:inline">Save Locations &amp; Personalize Insights</span>
          <span className="xl:hidden">Sign Up</span>
        </button>

        {error && (
          <p role="alert" className="text-xs text-red-500 hidden xl:block max-w-40 truncate" title={error}>
            {error}
          </p>
        )}
      </div>
    );
  }

  // Authenticated View: Show User Pill + Dropdown
  return (
    <div className="relative" ref={menuRef}>
      <button
        id="btn-user-profile"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-expanded={menuOpen}
        aria-label="User profile menu"
        className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-2xl border shadow-sm transition-transform active:scale-[0.99] hover:bg-[var(--surface-alt)]"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
          {user.initials || 'U'}
        </div>
        <span className="hidden sm:inline text-xs font-bold t1 max-w-[120px] truncate">
          {user.name}
        </span>
        <span className="text-xs tm" aria-hidden="true">▾</span>
      </button>

      {menuOpen && (
        <div
          id="user-profile-dropdown"
          className="absolute right-0 mt-2 w-72 max-w-[90vw] rounded-2xl shadow-2xl p-4 border z-[3000] animate-in fade-in zoom-in-95 duration-150"
          style={{
            background: 'var(--surface)',
            borderColor: 'var(--border)',
          }}
        >
          <div
            className="flex items-center gap-3 pb-3 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
              {user.initials || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold t1 truncate">{user.name}</p>
              <p className="text-xs tm truncate">{user.email || 'Verified User'}</p>
            </div>
          </div>

          <div
            className="my-3 p-3 rounded-xl border"
            style={{
              background: 'var(--surface-alt)',
              borderColor: 'var(--border)',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold t1">Account Security</span>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                Cognito
              </span>
            </div>
            <p className="text-xs tm mt-1.5">
              Provider: <span className="font-semibold">{user.provider || 'Cognito'}</span>
            </p>
          </div>

          <button
            id="btn-profile-settings"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(true);
            }}
            className="w-full mb-2 rounded-xl border px-3 py-2.5 text-xs font-bold hover:bg-[var(--surface-alt)] transition-colors text-left flex items-center justify-between"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <span>Saved Locations &amp; Preferences</span>
            <span>⚙️</span>
          </button>

          <button
            id="btn-sign-out"
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void logout();
            }}
            className="w-full rounded-xl border border-rose-500/30 px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-500/10 transition-colors text-left flex items-center justify-between"
          >
            <span>Sign out</span>
            <span>↪</span>
          </button>
        </div>
      )}

      {profileOpen && (
        <ProfileSettingsModal
          onClose={() => setProfileOpen(false)}
          onProfileSaved={(updated) => {
            if (onProfileUpdated) onProfileUpdated(updated);
          }}
        />
      )}
    </div>
  );
}
