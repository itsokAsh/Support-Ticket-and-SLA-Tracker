import { useState, useEffect, type FormEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gqlRequest } from "../api/graphql";
import { useAuth } from "../context/AuthContext";
import SLABadge from "../components/SLABadge";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string; role: string };
}

interface TicketDetail {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  reporter: { id: string; name: string };
  assignee: { id: string; name: string } | null;
  sla: {
    firstResponseState: "ON_TRACK" | "AT_RISK" | "BREACHED";
    resolutionState: "ON_TRACK" | "AT_RISK" | "BREACHED";
    firstResponseRemainingMinutes: number;
    resolutionRemainingMinutes: number;
    firstResponseDueAt: string;
    resolutionDueAt: string;
  };
  comments: Comment[];
}

const TICKET_QUERY = `
  query GetTicket($id: ID!) {
    ticket(id: $id) {
      id title description priority status createdAt
      firstResponseAt resolvedAt
      reporter { id name }
      assignee { id name }
      sla {
        firstResponseState resolutionState
        firstResponseRemainingMinutes resolutionRemainingMinutes
        firstResponseDueAt resolutionDueAt
      }
      comments {
        id content createdAt
        author { id name role }
      }
    }
  }
`;

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAgent } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchTicket = async () => {
    try {
      const data = await gqlRequest<{ ticket: TicketDetail }>(TICKET_QUERY, { id });
      setTicket(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [id]);

  const handleAddComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setCommenting(true);
    try {
      await gqlRequest(`
        mutation AddComment($ticketId: ID!, $content: String!) {
          addComment(ticketId: $ticketId, content: $content) { id }
        }
      `, { ticketId: id, content: comment });
      setComment("");
      await fetchTicket(); // Refresh to get updated comments and SLA
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add comment");
    } finally {
      setCommenting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      await gqlRequest(`
        mutation ChangeStatus($ticketId: ID!, $status: TicketStatus!) {
          changeTicketStatus(ticketId: $ticketId, status: $status) { id }
        }
      `, { ticketId: id, status: newStatus });
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change status");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!user) return;
    setActionLoading(true);
    try {
      await gqlRequest(`
        mutation Assign($ticketId: ID!, $assigneeId: ID!) {
          assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { id }
        }
      `, { ticketId: id, assigneeId: user.id });
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading ticket...</div>;
  if (error && !ticket) return <div className="error-banner">{error}</div>;
  if (!ticket) return <div className="error-banner">Ticket not found.</div>;

  const statusTransitions: Record<string, string[]> = {
    OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
    IN_PROGRESS: ["RESOLVED", "OPEN", "CLOSED"],
    RESOLVED: ["CLOSED", "IN_PROGRESS"],
    CLOSED: ["OPEN"],
  };

  const allowedTransitions = statusTransitions[ticket.status] ?? [];

  return (
    <div className="ticket-detail-page">
      <button className="btn btn-ghost back-btn" onClick={() => navigate("/tickets")}>
        ← Back to Tickets
      </button>

      {error && <div className="error-banner">{error}</div>}

      <div className="ticket-detail-grid">
        {/* Main content */}
        <div className="ticket-main">
          <div className="ticket-header">
            <h1>{ticket.title}</h1>
            <div className="ticket-meta">
              <span className={`badge priority-${ticket.priority.toLowerCase()}`}>
                {ticket.priority}
              </span>
              <span className={`badge status-${ticket.status.toLowerCase().replace("_", "-")}`}>
                {ticket.status.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="ticket-description">
            <h3>Description</h3>
            <p>{ticket.description}</p>
          </div>

          {/* Comments */}
          <div className="comments-section">
            <h3>Comments ({ticket.comments.length})</h3>

            {ticket.comments.length === 0 ? (
              <p className="no-comments">No comments yet.</p>
            ) : (
              <div className="comment-list">
                {ticket.comments.map((c) => (
                  <div
                    key={c.id}
                    className={`comment ${c.author.role === "AGENT" ? "comment-agent" : "comment-reporter"}`}
                  >
                    <div className="comment-header">
                      <strong>{c.author.name}</strong>
                      <span className={`comment-role badge-sm ${c.author.role.toLowerCase()}`}>
                        {c.author.role}
                      </span>
                      <span className="comment-date">
                        {new Date(c.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="comment-body">{c.content}</p>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddComment} className="comment-form">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment..."
                rows={3}
                required
              />
              <button type="submit" className="btn btn-primary" disabled={commenting}>
                {commenting ? "Posting..." : "Post Comment"}
              </button>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div className="ticket-sidebar">
          <div className="sidebar-section">
            <h3>SLA Status</h3>
            <div className="sla-group">
              <SLABadge
                state={ticket.sla.firstResponseState}
                remainingMinutes={ticket.sla.firstResponseRemainingMinutes}
                label="First Response"
              />
              <div className="sla-due">
                Due: {new Date(ticket.sla.firstResponseDueAt).toLocaleString()}
              </div>
            </div>
            <div className="sla-group">
              <SLABadge
                state={ticket.sla.resolutionState}
                remainingMinutes={ticket.sla.resolutionRemainingMinutes}
                label="Resolution"
              />
              <div className="sla-due">
                Due: {new Date(ticket.sla.resolutionDueAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="sidebar-section">
            <h3>Details</h3>
            <div className="detail-row">
              <span>Reporter</span>
              <span>{ticket.reporter.name}</span>
            </div>
            <div className="detail-row">
              <span>Assignee</span>
              <span>{ticket.assignee?.name ?? "Unassigned"}</span>
            </div>
            <div className="detail-row">
              <span>Created</span>
              <span>{new Date(ticket.createdAt).toLocaleString()}</span>
            </div>
            {ticket.firstResponseAt && (
              <div className="detail-row">
                <span>First Response</span>
                <span>{new Date(ticket.firstResponseAt).toLocaleString()}</span>
              </div>
            )}
            {ticket.resolvedAt && (
              <div className="detail-row">
                <span>Resolved</span>
                <span>{new Date(ticket.resolvedAt).toLocaleString()}</span>
              </div>
            )}
          </div>

          {/* Agent actions */}
          {isAgent && (
            <div className="sidebar-section">
              <h3>Actions</h3>
              {!ticket.assignee && (
                <button
                  className="btn btn-secondary btn-full"
                  onClick={handleAssignToMe}
                  disabled={actionLoading}
                >
                  Assign to Me
                </button>
              )}
              {ticket.assignee && (
                <div className="status-actions">
                  {allowedTransitions.map((s) => (
                    <button
                      key={s}
                      className="btn btn-outline btn-full"
                      onClick={() => handleStatusChange(s)}
                      disabled={actionLoading}
                    >
                      → {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
