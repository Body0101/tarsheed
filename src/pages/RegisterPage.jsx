import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RegisterForm } from "../components/auth/RegisterForm";
import { authService } from "../services/auth";

export const RegisterPage = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async ({ email, password, displayName }) => {
    setLoading(true);
    const result = await authService.signUp(email, password, displayName);
    setLoading(false);
    if (result.success) navigate("/login");
  };

  return (
    <div style={{ maxWidth: 420, margin: "2rem auto" }}>
      <h1>Create account</h1>
      <RegisterForm onSubmit={handleSubmit} loading={loading} />
    </div>
  );
};
