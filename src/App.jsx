import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OnlineStatusProvider } from "./context/OnlineStatusContext";

import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { Layout } from "./components/layout/Layout";

// Pages
import { RegisterPage } from "./pages/RegisterPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";

// Assets
import reactLogo from "./assets/react.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";

import { handleGitHubPagesRedirect } from "./utils/redirects";

import "./App.css";

// Home Page
function HomePage() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    handleGitHubPagesRedirect();
  }, []);

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>

        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.jsx</code> and save to test HMR
          </p>
        </div>

        <button
          type="button"
          className="counter"
          onClick={() => setCount((prev) => prev + 1)}
        >
          Count is {count}
        </button>
      </section>
    </>
  );
}

const basename = import.meta.env.BASE_URL || "/";

export const App = () => {
  return (
    <ErrorBoundary>
      <OnlineStatusProvider>
        <ThemeProvider>
          <AuthProvider>
            <Router basename={basename}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />

                {/* Protected Routes */}
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <DashboardPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />

                {/* Admin Route */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute>
                      <Layout>
                        <AdminDashboardPage />
                      </Layout>
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </AuthProvider>
        </ThemeProvider>
      </OnlineStatusProvider>
    </ErrorBoundary>
  );
};

export default App;