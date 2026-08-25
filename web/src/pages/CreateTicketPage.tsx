import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { gqlRequest } from "../api/graphql";

export default function CreateTicketPage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await gqlRequest<{ createTicket: { id: string } }>(`
        mutation CreateTicket($title: String!, $description: String!, $priority: Priority!) {
          createTicket(title: $title, description: $description, priority: $priority) {
            id
          }
        }
      `, { title, description, priority });

      navigate(`/tickets/${data.createTicket.id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="create-ticket-page">
      <div className="page-header">
        <h1>Create New Ticket</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <form onSubmit={handleSubmit} className="ticket-form">
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief description of the issue"
            maxLength={255}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detailed description of the problem..."
            rows={6}
            maxLength={5000}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="filter-select"
          >
            <option value="LOW">Low — 24h response / 72h resolution</option>
            <option value="MEDIUM">Medium — 8h response / 48h resolution</option>
            <option value="HIGH">High — 4h response / 24h resolution</option>
            <option value="URGENT">Urgent — 1h response / 4h resolution</option>
          </select>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => navigate("/tickets")}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Creating..." : "Create Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}
