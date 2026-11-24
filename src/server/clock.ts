/**
 * "Now" for the app. Services take `now` as an argument so tests can fix the clock.
 * APP_NOW (an ISO instant) pins the clock for the browser tests and demos only.
 */
export function appNow(): Date {
  const pinned = process.env.APP_NOW;
  if (pinned) {
    const date = new Date(pinned);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}
