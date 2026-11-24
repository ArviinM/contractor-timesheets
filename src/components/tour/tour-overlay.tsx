"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "./steps";

const GAP = 12;
const EDGE = 16;
const PAD = 6;

type Layout = { rect: DOMRect | null; cardHeight: number; vw: number; vh: number };

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
}

/** Only steps whose target is on the page and visible (sidebar items are hidden on phones). */
export function visibleSteps(steps: TourStep[]): TourStep[] {
  return steps.filter((s) => {
    const el = findTarget(s.target);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/**
 * A spotlight on the step's target plus a small card. Esc closes it, focus moves into the
 * card and goes back to the button that opened it. Nothing behind it can be clicked meanwhile.
 */
export function TourOverlay({ steps, onClose }: { steps: TourStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [layout, setLayout] = useState<Layout | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const step = steps[index]!;
  const last = index === steps.length - 1;

  // Follow the target: scroll it into view, then measure on every resize or scroll.
  useEffect(() => {
    const el = findTarget(step.target);
    el?.scrollIntoView({ block: "center", inline: "nearest" });
    const measure = () =>
      setLayout({
        rect: findTarget(step.target)?.getBoundingClientRect() ?? null,
        cardHeight: card.current?.offsetHeight ?? 180,
        vw: window.innerWidth,
        vh: window.innerHeight,
      });
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  // Focus the card on each step; Esc closes.
  useEffect(() => {
    card.current?.focus();
  }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep Tab inside the card.
  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !card.current) return;
    const focusable = [...card.current.querySelectorAll<HTMLElement>("button:not(:disabled)")];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const lastEl = focusable[focusable.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === card.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      first.focus();
    }
  };

  const rect = layout?.rect ?? null;
  const vw = layout?.vw ?? 1024;
  const vh = layout?.vh ?? 768;
  const cardWidth = Math.min(352, vw - EDGE * 2);
  let top = vh - (layout?.cardHeight ?? 180) - EDGE;
  let left = (vw - cardWidth) / 2;
  if (rect) {
    const height = layout?.cardHeight ?? 180;
    const below = rect.bottom + PAD + GAP;
    const above = rect.top - PAD - GAP - height;
    if (below + height <= vh - EDGE) top = below;
    else if (above >= EDGE) top = above;
    left = Math.min(Math.max(rect.left, EDGE), vw - cardWidth - EDGE);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]">
      {/* Catches clicks so the page can't be changed mid-tour. */}
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-lg ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.45)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 bg-black/45" />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={trapTab}
        className="absolute flex flex-col gap-3 rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none"
        style={{ top, left, width: cardWidth }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground tabular">
              Step {index + 1} of {steps.length}
            </p>
            <h2 id="tour-title" className="font-medium">
              {step.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon-sm" aria-label="Close tour" onClick={onClose} className="-mt-1 -mr-1">
            <X />
          </Button>
        </div>
        <p id="tour-body" className="text-muted-foreground">
          {step.body}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.target} className={`size-1.5 rounded-full ${i === index ? "bg-primary" : "bg-muted-foreground/30"}`} />
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Back
            </Button>
            {last ? (
              <Button size="sm" onClick={onClose}>
                Done
              </Button>
            ) : (
              <Button size="sm" onClick={() => setIndex(index + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
