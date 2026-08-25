-- Database-level CHECK constraints (bonus)
-- These enforce data integrity at the database level in addition to application-level validation.

-- Ticket title must not be empty
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_title_not_empty" CHECK (length(trim("title")) > 0);

-- Ticket description must not be empty
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_description_not_empty" CHECK (length(trim("description")) > 0);

-- Comment content must not be empty
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_content_not_empty" CHECK (length(trim("content")) > 0);

-- User name must not be empty
ALTER TABLE "User" ADD CONSTRAINT "User_name_not_empty" CHECK (length(trim("name")) > 0);

-- User email must not be empty
ALTER TABLE "User" ADD CONSTRAINT "User_email_not_empty" CHECK (length(trim("email")) > 0);

-- Holiday name must not be empty
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_name_not_empty" CHECK (length(trim("name")) > 0);