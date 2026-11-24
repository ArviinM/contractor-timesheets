"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertCircle, Lock, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteEntryAction, submitWeekAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatHours, formatUsd } from "@/server/money";
import type { EngagementWeek, EntryView } from "@/server/queries";
import { dayLabel } from "@/server/time";

function useServerCall(onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const call = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(success);
      onDone();
      router.refresh();
    });
  };
  return { error, pending, call };
}

export function DeleteEntryDialog({ entry, onClose }: { entry: EntryView; onClose: () => void }) {
  const { error, pending, call } = useServerCall(onClose);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this entry?</DialogTitle>
          <DialogDescription>
            {dayLabel(entry.workDate)}, {entry.startTime} to {entry.endTime}
            {entry.note ? `: ${entry.note}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error && <ErrorAlert message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending} onClick={() => call(() => deleteEntryAction(entry.id), "Entry deleted")}>
            <Trash2 />
            Delete entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SubmitWeekDialog({
  engagement,
  weekStart,
  weekRange,
  inProgress,
  onClose,
}: {
  engagement: EngagementWeek;
  weekStart: string;
  weekRange: string;
  inProgress: boolean;
  onClose: () => void;
}) {
  const { error, pending, call } = useServerCall(onClose);
  const resubmit = engagement.status === "rejected";
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {resubmit ? "Resubmit" : "Submit"} this week to {engagement.clientName}?
          </DialogTitle>
          <DialogDescription>{weekRange}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-3 rounded-lg border p-3">
          <Fact label="Hours" value={formatHours(engagement.minutes)} />
          <Fact label="Rate" value={`${formatUsd(engagement.rateCents)}/h`} />
          <Fact label="Amount" value={formatUsd(engagement.amountCents)} />
        </dl>
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Its entries lock until {engagement.clientName} decides. If they reject it, it opens again.
        </p>
        {inProgress && (
          <Alert>
            <AlertCircle />
            <AlertDescription>
              This week isn&apos;t over yet. You can submit now, but you won&apos;t be able to add more time to it
              unless the client rejects it.
            </AlertDescription>
          </Alert>
        )}
        {error && <ErrorAlert message={error} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              call(
                () => submitWeekAction(engagement.engagementId, weekStart),
                `Week submitted to ${engagement.clientName}`,
              )
            }
          >
            <Send />
            {resubmit ? "Resubmit week" : "Submit week"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-base font-medium tabular">{value}</dd>
    </div>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
