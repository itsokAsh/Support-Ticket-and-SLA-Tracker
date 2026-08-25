export {
  createTicket,
  assignTicket,
  changeTicketStatus,
  resolveTicket,
} from "./ticketService.js";

export {
  isValidTransition,
  shouldFreezeResolutionClock,
  isReopenTransition,
} from "./statusTransitions.js";
