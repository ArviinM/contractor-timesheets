"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { approveWeekAction, rejectWeekAction } from "@/app/actions";
import { ErrorAlert } from "@/components/timesheet/confirm-dialogs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  weekId: number;
  /** As shown on this page. The server refuses the decision if the week was resubmitted since. */
  submittedAt: string;
  contractorName: string;
  weekLabel: string;
  hours: string;
  rate: string;
  amount: string;
  nextWaitingWeekId: number | null;
};

export function DecisionButtons(props: Props) {
  const [open, setOpen] = useState<"approve" | "reject" | null>(null);
  return (
    <div className="flex flex-col gap-2 border-t pt-4" data-tour="decision">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setOpen("approve")}>
          <Check /> Approve week
        </Button>
        <Button variant="destructive" onClick={() => setOpen("reject")}>
          <X /> Reject with comment
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Approving is final and locks this week&apos;s rate for the invoice. Rejecting needs a comment and
        reopens the week for {props.contractorName}.
      </p>
      {open === "approve" && <ApproveDialog {...props} onClose={() => setOpen(null)} />}
      {open === "reject" && <RejectDialog {...props} onClose={() => setOpen(null)} />}
    </div>
  );
}

function useDecision(nextWaitingWeekId: number | null, onClose: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(success, {
        description: nextWaitingWeekId ? "Showing the next week waiting for you." : "Nothing else is waiting.",
      });
      onClose();
      router.push(nextWaitingWeekId ? `/review/${nextWaitingWeekId}` : "/review");
      router.refresh();
    });
  };
  const reload = () => {
    onClose();
    router.refresh();
  };
  return { error, pending, decide, reload };
}

/** The server's message, plus a Reload button when the week changed since this page loaded. */
function DecisionError({ message, onReload }: { message: string; onReload: () => void }) {
  return (
    <div className="grid gap-2">
      <ErrorAlert message={message} />
      {/resubmitted/i.test(message) && (
        <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={onReload}>
          Reload the latest version
        </Button>
      )}
    </div>
  );
}

function ApproveDialog({ weekId, submittedAt, contractorName, weekLabel, hours, rate, amount, nextWaitingWeekId, onClose }: Props & { onClose: () => void }) {
  const { error, pending, decide, reload } = useDecision(nextWaitingWeekId, onClose);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {contractorName}&apos;s week?</DialogTitle>
          <DialogDescription>{weekLabel}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          <span className="font-mono tabular">{hours}</span> hours at <span className="font-mono tabular">{rate}</span>{" "}
          = <span className="font-mono font-medium tabular">{amount}</span>. This is final: the rate is locked for
          the invoice and the week can&apos;t be changed.
        </p>
        {error && <DecisionError message={error} onReload={reload} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => decide(() => approveWeekAction(weekId, submittedAt), "Week approved")}>
            <Check /> Approve week
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ weekId, submittedAt, contractorName, weekLabel, nextWaitingWeekId, onClose }: Props & { onClose: () => void }) {
  const { error, pending, decide, reload } = useDecision(nextWaitingWeekId, onClose);
  const [comment, setComment] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            decide(() => rejectWeekAction(weekId, comment, submittedAt), "Week rejected");
          }}
        >
          <DialogHeader>
            <DialogTitle>Reject {contractorName}&apos;s week?</DialogTitle>
            <DialogDescription>{weekLabel}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="reject-comment">Comment for {contractorName}</Label>
            <Textarea
              id="reject-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What needs fixing?"
              rows={3}
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground">
              Required. The week reopens so {contractorName} can fix it and resubmit.
            </p>
          </div>
          {error && <DecisionError message={error} onReload={reload} />}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              <X /> Reject week
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
