import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { DateTime } from "luxon";
import { StatusBadge } from "@/components/status-badge";
import { ErrorAlert } from "@/components/timesheet/confirm-dialogs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getDb } from "@/server/app-db";
import { appNow } from "@/server/clock";
import { ValidationError } from "@/server/errors";
import { getInvoice, type Invoice } from "@/server/invoice";
import { formatHours, formatUsd } from "@/server/money";
import { todayFor } from "@/server/queries";
import { homeFor, requireActor } from "@/server/session";
import { dayLabel, longDayLabel } from "@/server/time";

/** Every page here reads the dev-login cookie, the clock and the database per request, so it renders on
 * the server for each navigation (with the loading skeleton meanwhile) instead of from a prerendered shell. */
export const instant = false;

const DATE = "yyyy-MM-dd";

export default async function InvoicePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const actor = await requireActor();
  if (actor.role !== "client") redirect(homeFor(actor));
  await connection();

  const today = DateTime.fromISO(todayFor(actor, appNow()));
  const presets = [
    { label: "This month", from: today.startOf("month"), to: today.endOf("month") },
    { label: "Last month", from: today.minus({ months: 1 }).startOf("month"), to: today.minus({ months: 1 }).endOf("month") },
  ].map((p) => ({ label: p.label, from: p.from.toFormat(DATE), to: p.to.toFormat(DATE) }));

  const params = await searchParams;
  const from = params.from ?? presets[0]!.from;
  const to = params.to ?? presets[0]!.to;

  let invoice: Invoice | null = null;
  let error: string | null = null;
  try {
    invoice = getInvoice(getDb(), actor, from, to);
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    error = e.message;
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoice</h1>
        <p className="text-sm text-muted-foreground">
          Approved hours times the hourly rate, in USD. Dates are the contractor&apos;s work days, the same days the
          weeks use.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="inv-from">From</Label>
          <Input id="inv-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inv-to">To</Label>
          <Input id="inv-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
        <div className="flex gap-1">
          {presets.map((p) => (
            <Button
              key={p.label}
              asChild
              size="sm"
              variant={p.from === from && p.to === to ? "secondary" : "ghost"}
            >
              <Link href={`/invoice?from=${p.from}&to=${p.to}`}>{p.label}</Link>
            </Button>
          ))}
        </div>
      </form>

      {error && <ErrorAlert message={error} />}
      {invoice && <InvoiceDocument invoice={invoice} />}
    </>
  );
}

function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const example = invoice.lines[0];
  return (
    <Card role="region" className="gap-5 p-5 md:p-6" aria-label="Invoice">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Invoice preview</div>
          <h2 className="text-xl font-semibold">{invoice.clientName}</h2>
          <p className="text-sm text-muted-foreground">
            {longDayLabel(invoice.from)} to {longDayLabel(invoice.to)}
          </p>
        </div>
        <div className="sm:text-right">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Total due, USD</div>
          <div className="font-mono text-3xl font-semibold tabular" data-testid="invoice-total">
            {formatUsd(invoice.totalCents)}
          </div>
        </div>
      </div>

      {invoice.lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No approved time in this range.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contractor</TableHead>
              <TableHead>Approved week</TableHead>
              <TableHead className="text-right">Hours</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.lines.map((l) => (
              <TableRow key={l.weekId}>
                <TableCell className="font-medium">{l.contractorName}</TableCell>
                <TableCell>
                  Week of {dayLabel(l.weekStart)}
                  {l.partial && (
                    <span className="block text-xs text-muted-foreground">
                      Only {dayLabel(l.periodFrom)} to {dayLabel(l.periodTo)} is in this range
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono tabular">{formatHours(l.minutes)}</TableCell>
                <TableCell className="text-right font-mono tabular">{formatUsd(l.rateCents)}</TableCell>
                <TableCell className="text-right font-mono tabular">{formatUsd(l.amountCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right font-mono tabular">{formatHours(invoice.totalMinutes)}</TableCell>
              <TableCell />
              <TableCell className="text-right font-mono tabular">{formatUsd(invoice.totalCents)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      )}

      {example && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">How a line is worked out.</span> Hours are whole minutes and
          rates are whole cents, so no floating-point money. Each line is minutes x cents per hour / 60, rounded half up
          once. For example {example.contractorName}: {example.minutes.toLocaleString("en-US")} min x{" "}
          {example.rateCents.toLocaleString("en-US")}c / 60 = {formatUsd(example.amountCents)}.
        </p>
      )}

      {invoice.notInvoiced.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Not on this invoice</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {invoice.notInvoiced.map((n) => (
              <li
                key={`${n.contractorName}-${n.weekStart}`}
                className={cn("flex flex-wrap items-center gap-2 text-muted-foreground")}
              >
                <span className="text-foreground">{n.contractorName}</span>
                <span>week of {dayLabel(n.weekStart)}:</span>
                <span className="font-mono tabular">{formatHours(n.minutes)}</span>
                <StatusBadge status={n.status} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Only approved weeks are billed.</p>
        </div>
      )}
    </Card>
  );
}
