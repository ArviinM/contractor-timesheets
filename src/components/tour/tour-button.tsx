"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Compass, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CLIENT_STEPS, CONTRACTOR_STEPS, type TourStep } from "./steps";
import { TourOverlay, visibleSteps } from "./tour-overlay";

// The first-visit hint is remembered per user in localStorage. Storage can be blocked
// (private windows, strict settings), so every access is wrapped and the hint still works.
function readSeen(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSeen(key: string) {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Blocked storage: the hint just comes back next visit.
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function TourButton({ role, userId }: { role: "contractor" | "client"; userId: number }) {
  const key = `timesheets.tour-seen.${userId}`;
  // On the server (and first paint) treat it as seen, so the hint never flashes in.
  const seen = useSyncExternalStore(subscribe, () => readSeen(key), () => "1");
  const [dismissed, setDismissed] = useState(false);
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const showHint = !dismissed && seen === null;

  function dismiss() {
    setDismissed(true);
    writeSeen(key);
  }

  function start() {
    dismiss();
    const found = visibleSteps(role === "contractor" ? CONTRACTOR_STEPS : CLIENT_STEPS);
    if (found.length === 0) {
      toast("Nothing to show on this page yet", {
        description: role === "contractor" ? "Open your timesheet and try again." : "Open Review and try again.",
      });
      return;
    }
    setSteps(found);
  }

  function close() {
    setSteps(null);
    trigger.current?.focus();
  }

  return (
    <div className="flex items-center gap-1">
      {showHint && (
        <span className="hidden items-center gap-1 rounded-md bg-primary/10 py-0.5 pr-0.5 pl-2 text-xs text-primary sm:inline-flex">
          New here? Take a one-minute tour.
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss tour hint"
            className="text-primary hover:bg-primary/10 hover:text-primary"
            onClick={dismiss}
          >
            <X />
          </Button>
        </span>
      )}
      <Button ref={trigger} variant="ghost" size="sm" onClick={start}>
        <Compass />
        <span className="hidden sm:inline">Take the tour</span>
        <span className="sr-only sm:hidden">Take the tour</span>
      </Button>
      {steps && <TourOverlay steps={steps} onClose={close} />}
    </div>
  );
}
