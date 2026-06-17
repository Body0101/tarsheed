
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/auth";
import { useAuthContext } from "../context/AuthContext";

export const LoginPage = () => {
    const navigate = useNavigate();
    const { login, isAuthenticated } = useAuthContext();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [formData, setFormData] = useState({
        email: "",
        password: "",
        remember: false
    });

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        setError(""); // Clear error on input change
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.email || !formData.password) {
            setError("Please fill in all fields");
            return;
        }

        setLoading(true);
        setError("");

        try {
            const result = await login(formData.email, formData.password);
            
            if (result.success) {
                navigate('/dashboard');
            } else {
                setError(result.error || "Login failed. Please try again.");
            }
        } catch (err) {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
            <div className="w-full max-w-md p-4">
                {/* Logo and Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--accent-soft)' }}>
                        <svg className="w-8 h-8" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
                        Tarshid
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                        Smart Building Management System
                    </p>
                </div>

                {/* Login Form */}
                <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email Field */}
                        <div>
                            <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                                Email Address
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                placeholder="Enter your email"
                                className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2"
                                style={{
                                    background: 'var(--surface-2)',
                                    borderColor: error && !formData.email ? 'var(--error)' : 'var(--border)',
                                    color: 'var(--text)',
                                    focusRingColor: 'var(--accent-ring)'
                                }}
                                disabled={loading}
                                required
                            />
                        </div>

                        {/* Password Field */}
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                name="password"
                                value={formData.password}
                                onChange={handleInputChange}
                                placeholder="Enter your password"
                                className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2"
                                style={{
                                    background: 'var(--surface-2)',
                                    borderColor: error && !formData.password ? 'var(--error)' : 'var(--border)',
                                    color: 'var(--text)',
                                    focusRingColor: 'var(--accent-ring)'
                                }}
                                disabled={loading}
                                required
                            />
                        </div>

                        {/* Remember Me & Forgot Password */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="remember"
                                    checked={formData.remember}
                                    onChange={handleInputChange}
                                    className="w-4 h-4 rounded border-2 transition-colors focus:outline-none focus:ring-2"
                                    style={{
                                        borderColor: 'var(--border)',
                                        backgroundColor: formData.remember ? 'var(--accent)' : 'var(--surface)',
                                        focusRingColor: 'var(--accent-ring)'
                                    }}
                                    disabled={loading}
                                />
                                <span className="ml-2 text-sm" style={{ color: 'var(--text-2)' }}>
                                    Remember me
                                </span>
                            </label>
                            <button
                                type="button"
                                className="text-sm font-medium hover:underline"
                                style={{ color: 'var(--accent)' }}
                                onClick={() => {/* TODO: Implement forgot password */}}
                            >
                                Forgot password?
                            </button>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--off-soft)', color: 'var(--off)' }}>
                                {error}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-4 rounded-lg font-medium transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{
                                background: loading ? 'var(--border)' : 'var(--accent)',
                                color: 'white',
                                boxShadow: loading ? 'none' : 'var(--shadow-sm)'
                            }}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Signing in...
                                </span>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>

                    {/* Register Link */}
                    <div className="mt-6 text-center">
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            Don't have an account?{' '}
                            <button
                                type="button"
                                onClick={() => navigate('/register')}
                                className="font-medium hover:underline"
                                style={{ color: 'var(--accent)' }}
                            >
                                Sign up
                            </button>
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="mt-8 text-center">
                    <p className="text-xs" style={{ color: 'var(--soft)' }}>
                        © 2024 Tarshid Smart Building Management
                    </p>
                </div>
            </div>
        </div>
    );
};
