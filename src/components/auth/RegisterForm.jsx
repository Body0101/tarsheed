import { useState } from "react";

export const RegisterForm = ({ onSubmit, loading }) => {
  const [form, setForm] = useState({ displayName: "", email: "", password: "" });

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.75rem" }}>
      <input name="displayName" value={form.displayName} onChange={handleChange} placeholder="Display name" required />
      <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="Email" required />
      <input type="password" name="password" value={form.password} onChange={handleChange} placeholder="Password" required />
      <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create account"}</button>
    </form>
  );
};
