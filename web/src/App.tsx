import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardPage from "./pages/DashboardPage";
import TicketListPage from "./pages/TicketListPage";
import TicketDetailPage from "./pages/TicketDetailPage";
import CreateTicketPage from "./pages/CreateTicketPage";
import type { ReactNode } from "react";

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return <>{children}</>;

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-brand">
          <h2>SLA Tracker</h2>
          <span className={`role-badge ${user.role.toLowerCase()}`}>{user.role}</span>
        </div>

        <div className="sidebar-nav">
          <Link to="/" className={`nav-link ${location.pathname === "/" ? "active" : ""}`}>
            📊 Dashboard
          </Link>
          <Link to="/tickets" className={`nav-link ${isActive("/tickets") ? "active" : ""}`}>
            🎫 Tickets
          </Link>
        </div>

        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className="user-email">{user.email}</span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>
            Sign Out
          </button>
        </div>
      </nav>

      <main className="main-content">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route
              path="/login"
              element={<GuestRoute><LoginPage /></GuestRoute>}
            />
            <Route
              path="/register"
              element={<GuestRoute><RegisterPage /></GuestRoute>}
            />
            <Route
              path="/"
              element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
            />
            <Route
              path="/tickets"
              element={<ProtectedRoute><TicketListPage /></ProtectedRoute>}
            />
            <Route
              path="/tickets/new"
              element={<ProtectedRoute><CreateTicketPage /></ProtectedRoute>}
            />
            <Route
              path="/tickets/:id"
              element={<ProtectedRoute><TicketDetailPage /></ProtectedRoute>}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </AuthProvider>
    </BrowserRouter>
  );
}
