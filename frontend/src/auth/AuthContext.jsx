import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Arise Authentication Provider Architecture
 *
 * Current Phase: Local/Mock Authentication Mode (MODE=local)
 * Target Architecture: React → Amazon Cognito User Pool → Google Identity Provider → JWT → FastAPI
 *
 * This abstraction enables seamless switching to real AWS Cognito User Pool federation
 * without altering any frontend dashboard components.
 */

const AuthContext = createContext(null);

const DEFAULT_LOCAL_USER = {
  id: 'usr_google_delhi_01',
  name: 'Yashansh Rastogi',
  email: 'yashansh.rastogi@example.com',
  initials: 'YR',
  provider: 'Google',
  role: 'Resident Analyst',
  location: 'Delhi-NCR',
  mode: 'Local Mock (Cognito Ready)',
};

export function AuthProvider({ children }) {
  // Read auth mode from environment or default to local
  const authMode = import.meta.env.VITE_AUTH_MODE || 'local';

  // In local mode, retrieve session state or default to authenticated developer profile
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('arise_user');
      return saved ? JSON.parse(saved) : DEFAULT_LOCAL_USER;
    } catch {
      return DEFAULT_LOCAL_USER;
    }
  });

  const [loading, setLoading] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    try {
      if (user) {
        sessionStorage.setItem('arise_user', JSON.stringify(user));
      } else {
        sessionStorage.removeItem('arise_user');
      }
    } catch {
      // Storage access gracefully handled
    }
  }, [user]);

  /**
   * Mock "Continue with Google" sign-in flow.
   * In AWS mode, this will redirect to the Cognito hosted UI federated to Google.
   */
  const loginWithGoogle = async () => {
    setLoading(true);
    // Simulate lightweight OAuth token exchange
    await new Promise(resolve => setTimeout(resolve, 350));
    setUser(DEFAULT_LOCAL_USER);
    setLoading(false);
    setAuthModalOpen(false);
  };

  /**
   * Logout flow.
   */
  const logout = async () => {
    setLoading(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    setUser(null);
    setLoading(false);
  };

  const value = {
    user,
    isAuthenticated: !!user,
    authMode,
    loading,
    authModalOpen,
    setAuthModalOpen,
    loginWithGoogle,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
