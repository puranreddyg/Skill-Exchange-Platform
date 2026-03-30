/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const storedUser = localStorage.getItem('skill_user');
    if (storedUser) {
        try {
            return JSON.parse(storedUser);
        } catch (e) {
            console.error("Failed to parse user", e);
            return null;
        }
    }
    return null;
  });
  const [loading] = useState(false);

  const login = (user, token) => {
    setCurrentUser(user);
    localStorage.setItem('skill_user', JSON.stringify(user));
    localStorage.setItem('skill_token', token);
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('skill_user');
    localStorage.removeItem('skill_token');
  };

  const updateCredits = (newCredits) => {
      setCurrentUser(prev => prev ? { ...prev, credits: newCredits } : null);
      if (currentUser) {
          const updatedUser = { ...currentUser, credits: newCredits };
          localStorage.setItem('skill_user', JSON.stringify(updatedUser));
      }
  };

  const fetchLatestProfile = async () => {
      if (!currentUser) return;
      try {
          const res = await fetch(`/api/auth/${currentUser.id}`);
          if (res.ok) {
              const data = await res.json();
              setCurrentUser(data);
              localStorage.setItem('skill_user', JSON.stringify(data));
          } else if (res.status === 404) {
              logout();
          }
      } catch (err) { console.error(err); }
  };

  const value = {
    currentUser,
    login,
    logout,
    updateCredits,
    fetchLatestProfile
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
