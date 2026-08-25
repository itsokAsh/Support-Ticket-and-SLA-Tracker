import { z } from "zod";

export const getTicketsSchema = z.object({
  first: z.number().int().min(1).max(50).default(20),
  after: z.string().optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assigneeId: z.string().optional(),
  // For SLA filtering we expect ON_TRACK, AT_RISK, or BREACHED
  // Note: Backend SLA filtering is tricky because state is dynamic. 
  // We'll handle this in the service layer if needed, or document limitations.
  slaState: z.enum(["ON_TRACK", "AT_RISK", "BREACHED"]).optional(),
});

export const getTicketByIdSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
});

export type GetTicketsInput = z.infer<typeof getTicketsSchema>;
export type GetTicketByIdInput = z.infer<typeof getTicketByIdSchema>;
