export {
  createTicket,
  assignTicket,
  changeTicketStatus,
  resolveTicket,
} from "./ticketService.js";

export { addComment } from "./commentService.js";

export {
  isValidTransition,
  shouldFreezeResolutionClock,
  isReopenTransition,
} from "./statusTransitions.js";
