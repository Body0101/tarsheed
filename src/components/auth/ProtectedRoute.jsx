import { Navigate } from "react-router-dom";
import { useAuth } from "../../hook/useAuth";

export const ProtectedRoute = ({ children, requiredRole }) => {
  const { isAuthenticated, hasRole } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (requiredRole && !hasRole(requiredRole)) return <Navigate to="/dashboard" replace />;
  return children;
};
