export type TourStep = {
  /** Matches a data-tour="..." attribute on the page. Steps whose target isn't on screen are skipped. */
  target: string;
  title: string;
  body: string;
};

export const CONTRACTOR_STEPS: TourStep[] = [
  {
    target: "week-views",
    title: "Three views of the same week",
    body: "List, Table and Timeline all show the same entries. Pick the one that suits you; it stays picked when you reload.",
  },
  {
    target: "new-entry",
    title: "One form for adding and editing",
    body: "New entry, Add on a day, or clicking an empty hour in Timeline all open the same form. The server checks every save.",
  },
  {
    target: "day-strip",
    title: "Your days, with a 12-hour limit",
    body: "Each day is a day in your own time zone. The bar fills up to 12 hours, which is the most a day can hold across all clients.",
  },
  {
    target: "client-card",
    title: "Submit the week to each client",
    body: "When the week is done, submit it. Its entries lock until the client approves, or rejects it with a comment.",
  },
  {
    target: "rejection",
    title: "A rejected week opens again",
    body: "The client's comment shows here. Fix the entries, then resubmit the week.",
  },
  {
    target: "recent-weeks",
    title: "Recent weeks",
    body: "Jump to an earlier week and see where each one stands: draft, waiting, approved or rejected.",
  },
  {
    target: "switch-user",
    title: "Switch user",
    body: "This sample uses a dev login. Switch to a client to see the other side of the same week.",
  },
];

export const CLIENT_STEPS: TourStep[] = [
  {
    target: "review-queue",
    title: "Weeks waiting for you",
    body: "Submitted weeks from your own contractors, oldest first. Decided weeks stay below for reference.",
  },
  {
    target: "week-detail",
    title: "Your times, your days",
    body: "Entries are grouped by your days in your time zone. The contractor's Jakarta times sit under each entry.",
  },
  {
    target: "decision",
    title: "Approve, or reject with a comment",
    body: "Approving is final and locks the hourly rate. Rejecting needs a comment and reopens the week for the contractor.",
  },
  {
    target: "invoice-nav",
    title: "The invoice",
    body: "Approved hours times the rate locked at approval, in USD. Each week is rounded once, to the cent.",
  },
  {
    target: "switch-user",
    title: "Switch user",
    body: "This sample uses a dev login. Switch to a contractor to log time and submit a week.",
  },
];
