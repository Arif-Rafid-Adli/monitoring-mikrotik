import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('token'));
  const [username, setUsername] = useState(() => sessionStorage.getItem('username'));

  useEffect(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
  }, []);

  const login = useCallback(async (usernameInput, password) => {
    const { data } = await api.post('/api/auth/login', { username: usernameInput, password });
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('username', data.user.username);
    setToken(data.token);
    setUsername(data.user.username);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    setToken(null);
    setUsername(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, username, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
