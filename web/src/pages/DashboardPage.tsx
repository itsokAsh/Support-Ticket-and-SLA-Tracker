import { useState, useEffect } from "react";
import { gqlRequest } from "../api/graphql";
import { useAuth } from "../context/AuthContext";

interface DashboardStats {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  breachedActive: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await gqlRequest<{ dashboardStats: DashboardStats }>(`
          query {
            dashboardStats {
              open inProgress resolved closed breachedActive
            }
          }
        `);
        setStats(data.dashboardStats);
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!stats) return <div className="error-banner">Failed to load stats.</div>;

  const cards = [
    { label: "Open", value: stats.open, color: "var(--color-open)" },
    { label: "In Progress", value: stats.inProgress, color: "var(--color-in-progress)" },
    { label: "Resolved", value: stats.resolved, color: "var(--color-resolved)" },
    { label: "Closed", value: stats.closed, color: "var(--color-closed)" },
    { label: "SLA Breached", value: stats.breachedActive, color: "var(--color-breached)" },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p className="page-subtitle">
          {user?.role === "AGENT" ? "System-wide overview" : "Your ticket summary"}
        </p>
      </div>

      <div className="stats-grid">
        {cards.map((card) => (
          <div className="stat-card" key={card.label} style={{ borderTopColor: card.color }}>
            <span className="stat-value">{card.value}</span>
            <span className="stat-label">{card.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
