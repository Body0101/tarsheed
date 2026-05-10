import { createContext, useContext, useState } from "react";
import { authService } from "../services/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    const result = await authService.signIn(email, password);
    if (result.success) {
      setUser(result.user);
      setRole(result.role);
    }
    setLoading(false);
    return result;
  };

  const logout = async () => {
    await authService.signOut();
    setUser(null);
    setRole(null);
  };

  const hasRole = (requiredRole) => authService.hasRole(role, requiredRole);
  const hasPermission = (permission) => authService.hasPermission(role, permission);

  const value = {
    user,
    role,
    loading,
    isAuthenticated: Boolean(user),
    login,
    logout,
    hasRole,
    hasPermission,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within AuthProvider");
  }
  return context;
};