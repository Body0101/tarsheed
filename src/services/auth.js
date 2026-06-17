import { supabase } from "./supabase";

class AuthService {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: error.message };
    return { success: true, user: data.user, role: "user" };
  }

  async signUp(email, password, displayName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, user: data.user };
  }

  async signOut() {
    await supabase.auth.signOut();
  }

  async getCurrentSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  }

  async resetPassword(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { success: !error, error: error?.message ?? null };
  }

  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }

  hasRole(currentRole, requiredRole) {
    const roleHierarchy = { guest: 0, user: 1, moderator: 2, admin: 3 };
    return (roleHierarchy[currentRole] ?? 0) >= (roleHierarchy[requiredRole] ?? 0);
  }

  hasPermission(currentRole, permission) {
    if (permission === "admin") return this.hasRole(currentRole, "admin");
    return this.hasRole(currentRole, "user");
  }
}

export const authService = new AuthService();