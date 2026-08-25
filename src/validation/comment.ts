import { z } from "zod";

export const addCommentSchema = z.object({
  ticketId: z.string().min(1, "Ticket ID is required."),
  content: z.string().trim().min(1, "Comment content cannot be empty.").max(5000, "Comment is too long."),
});

export type AddCommentInput = z.infer<typeof addCommentSchema>;
