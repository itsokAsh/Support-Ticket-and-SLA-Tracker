import { z } from "zod";

export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Ticket title is required.")
    .max(255, "Title must be 255 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(1, "Ticket description is required.")
    .max(5000, "Description must be 5000 characters or fewer."),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    errorMap: () => ({ message: "Priority must be LOW, MEDIUM, HIGH, or URGENT." }),
  }),
});

export const assignTicketSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
  assigneeId: z.string().min(1, "Assignee ID is required."),
});

export const changeStatusSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"], {
    errorMap: () => ({
      message: "Status must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED.",
    }),
  }),
});

export const resolveTicketSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type ResolveTicketInput = z.infer<typeof resolveTicketSchema>;
