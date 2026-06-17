import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/auth";
import { useAuthContext } from "../context/AuthContext";

export const RegisterPage = () => {
    const navigate = useNavigate();
    const { isAuthenticated } = useAuthContext();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [formData, setFormData] = useState({
        displayName: "",
        email: "",
        password: "",
        confirmPassword: ""
    });

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated) {
            navigate('/dashboard');
        }
    }, [isAuthenticated, navigate]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError(""); // Clear error on input change
    };

    const validateForm = () => {
        if (!formData.displayName.trim()) {
            setError("Display name is required");
            return false;
        }
        if (!formData.email.trim()) {
            setError("Email is required");
            return false;
        }
        if (!formData.password) {
            setError("Password is required");
            return false;
        }
        if (formData.password.length < 6) {
            setError("Password must be at least 6 characters");
            return false;
        }
        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match");
            return false;
        }
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!validateForm()) {
            return;
        }

        setLoading(true);
        setError("");

        try {
            const result = await authService.signUp(formData.email, formData.password, formData.displayName);
            
            if (result.success) {
                setSuccess(true);
                // Redirect to login after 2 seconds
                setTimeout(() => {
                    navigate('/login');
                }, 2000);
            } else {
                setError(result.error || "Registration failed. Please try again.");
            }
        } catch (err) {
            setError("An unexpected error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
                <div className="w-full max-w-md p-4">
                    <div className="rounded-2xl p-6 text-center" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}>
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: 'var(--on-soft)' }}>
                            <svg className="w-8 h-8" style={{ color: 'var(--on)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--text)' }}>
                            Registration Successful!
                        </h2>
                        <p className="text-sm mb-4" style={{ color: 'var(--text-2)' }}>
                            Your account has been created. Redirecting to login...
                        </p>
                        <div className="w-8 h-1 rounded-full mx-auto animate-pulse" style={{ background: 'var(--accent)' }}></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
            <div className="w-full max-w-md p-4">
                {/* Logo and Header */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'var(--accent-soft)' }}>
                        <svg className="w-8 h-8" style={{ color: 'var(--accent)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
                        Create Account
                    </h1>
                    <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                        Join Tarshid Smart Building Management
                    </p>
                </div>

                {/* Registration Form */}
                <div className="rounded-2xl p-6" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Display Name Field */}
                        <div>
                            <label htmlFor="displayName" className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                                Display Name
                            </label>
                            <input
                                type="text"
                                id="displayName"
                                name="displayName"
                                value={formData.displayName}
                                onChange={handleInputChange}
                                placeholder="Enter your name"
                                className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2"
                                style={{
                                    background: 'var(--surface-2)',
                                    borderColor: error && !formData.displayName ? 'var(--error)' : 'var(--border)',
                                    color: 'var(--text)',
                                    focusRingColor: 'var(--accent-ring)'
                                }}
                                disabled={loading}
                                required
                            />
                        </div>

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
                                placeholder="Create a password (min. 6 characters)"
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

                        {/* Confirm Password Field */}
                        <div>
                            <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                name="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={handleInputChange}
                                placeholder="Confirm your password"
                                className="w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2"
                                style={{
                                    background: 'var(--surface-2)',
                                    borderColor: error && formData.password !== formData.confirmPassword ? 'var(--error)' : 'var(--border)',
                                    color: 'var(--text)',
                                    focusRingColor: 'var(--accent-ring)'
                                }}
                                disabled={loading}
                                required
                            />
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
                                    Creating Account...
                                </span>
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </form>

                    {/* Login Link */}
                    <div className="mt-6 text-center">
                        <p className="text-sm" style={{ color: 'var(--text-2)' }}>
                            Already have an account?{' '}
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="font-medium hover:underline"
                                style={{ color: 'var(--accent)' }}
                            >
                                Sign in
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
