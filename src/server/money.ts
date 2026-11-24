/**
 * Money rules:
 * - Rates are integer cents per hour, durations integer minutes. No floats touch money.
 * - An invoice line is one approved week. Its amount is rounded once, half up, to the cent.
 * - The invoice total is the sum of the line amounts.
 */

/** minutes x rate / 60, rounded half up to the cent, using integers only. */
export function lineAmountCents(minutes: number, rateCents: number): number {
  if (!Number.isSafeInteger(minutes) || minutes < 0) {
    throw new RangeError(`Minutes must be a whole number of zero or more, got ${minutes}`);
  }
  if (!Number.isSafeInteger(rateCents) || rateCents < 0) {
    throw new RangeError(`Rate must be a whole number of cents, got ${rateCents}`);
  }
  const scaled = minutes * rateCents + 30; // + 30 = half of 60, so floor() rounds half up
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError("Amount is too large to calculate exactly");
  }
  return Math.floor(scaled / 60);
}

export function sumCents(amounts: number[]): number {
  const total = amounts.reduce((sum, cents) => sum + cents, 0);
  if (!Number.isSafeInteger(total)) throw new RangeError("Total is too large");
  return total;
}

/** 24442 -> '$244.42'. Formatting happens only for display. */
export function formatUsd(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = String(abs % 100).padStart(2, "0");
  return `${sign}$${dollars}.${rest}`;
}

/** 440 -> '7:20'. Hours are shown as h:mm so the display never rounds. */
export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}
