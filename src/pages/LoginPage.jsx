
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoginForm } from "../components/auth/LoginForm";
import { authService } from "../services/auth";
import { useToast } from "../hook/useToast";

export const LoginPage = () => {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleLogin = async (email, password) => {
        setLoading(true);
        
        try {
            const result = await authService.signIn(email, password);
            
            if (result.success) {
                showToast('Login successful!', 'success');
                navigate('/dashboard');
            } else {
                showToast(result.error, 'error');
            }
        } catch {
            showToast('Login failed. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900">
                        Smart Home Control
                    </h1>
                    <p className="mt-2 text-gray-600">
                        Sign in to your account
                    </p>
                </div>
                
                <LoginForm 
                    onSubmit={handleLogin}
                    loading={loading}
                />
                
                <div className="text-center">
                    <p className="text-sm text-gray-600">
                        Don't have an account?{' '}
                        <a 
                            href="/register" 
                            className="font-medium text-primary hover:text-primary-dark"
                        >
                            Sign up
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};
