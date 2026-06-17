import { Link } from "react-router-dom";
import { useAuth } from "../../hook/useAuth";

export const Navigation = () => {
  const { logout } = useAuth();
  return (
    <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      <Link to="/">Home</Link>
      <Link to="/dashboard">Dashboard</Link>
      <Link to="/admin">Admin</Link>
      <button type="button" onClick={logout}>Sign out</button>
    </nav>
  );
};
