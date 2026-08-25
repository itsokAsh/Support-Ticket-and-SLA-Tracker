import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { gqlRequest } from "../api/graphql";
import { useAuth } from "../context/AuthContext";
import SLABadge from "../components/SLABadge";

interface Ticket {
  id: string;
  title: string;
  priority: string;
  status: string;
  createdAt: string;
  reporter: { name: string };
  assignee: { name: string } | null;
  sla: {
    firstResponseState: "ON_TRACK" | "AT_RISK" | "BREACHED";
    resolutionState: "ON_TRACK" | "AT_RISK" | "BREACHED";
    firstResponseRemainingMinutes: number;
    resolutionRemainingMinutes: number;
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

const TICKETS_QUERY = `
  query GetTickets($first: Int, $after: String, $status: TicketStatus, $priority: Priority) {
    tickets(first: $first, after: $after, status: $status, priority: $priority) {
      edges {
        id title priority status createdAt
        reporter { name }
        assignee { name }
        sla {
          firstResponseState resolutionState
          firstResponseRemainingMinutes resolutionRemainingMinutes
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export default function TicketListPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo>({ hasNextPage: false, endCursor: null });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const { isAgent } = useAuth();

  const fetchTickets = useCallback(
    async (after?: string) => {
      setLoading(true);
      try {
        const vars: Record<string, unknown> = { first: 15 };
        if (after) vars.after = after;
        if (statusFilter) vars.status = statusFilter;
        if (priorityFilter) vars.priority = priorityFilter;

        const data = await gqlRequest<{
          tickets: { edges: Ticket[]; pageInfo: PageInfo };
        }>(TICKETS_QUERY, vars);

        if (after) {
          setTickets((prev) => [...prev, ...data.tickets.edges]);
        } else {
          setTickets(data.tickets.edges);
        }
        setPageInfo(data.tickets.pageInfo);
      } catch (err) {
        console.error("Failed to load tickets:", err);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, priorityFilter]
  );

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const priorityClass = (p: string) => `priority-${p.toLowerCase()}`;
  const statusClass = (s: string) => `status-${s.toLowerCase().replace("_", "-")}`;

  return (
    <div className="ticket-list-page">
      <div className="page-header">
        <h1>Tickets</h1>
        <Link to="/tickets/new" className="btn btn-primary">
          + New Ticket
        </Link>
      </div>

      <div className="filters-bar">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {loading && tickets.length === 0 ? (
        <div className="loading">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="empty-state">
          <p>No tickets found. {!isAgent && "Create one to get started!"}</p>
        </div>
      ) : (
        <>
          <div className="ticket-table-wrapper">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Reporter</th>
                  {isAgent && <th>Assignee</th>}
                  <th>First Response</th>
                  <th>Resolution</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/tickets/${t.id}`} className="ticket-link">
                        {t.title}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${priorityClass(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${statusClass(t.status)}`}>
                        {t.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>{t.reporter.name}</td>
                    {isAgent && <td>{t.assignee?.name ?? "—"}</td>}
                    <td>
                      <SLABadge
                        state={t.sla.firstResponseState}
                        remainingMinutes={t.sla.firstResponseRemainingMinutes}
                        label="FR"
                      />
                    </td>
                    <td>
                      <SLABadge
                        state={t.sla.resolutionState}
                        remainingMinutes={t.sla.resolutionRemainingMinutes}
                        label="RES"
                      />
                    </td>
                    <td className="date-cell">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageInfo.hasNextPage && (
            <button
              className="btn btn-secondary load-more"
              onClick={() => fetchTickets(pageInfo.endCursor ?? undefined)}
              disabled={loading}
            >
              {loading ? "Loading..." : "Load More"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
