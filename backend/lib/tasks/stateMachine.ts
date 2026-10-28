/**
 * Task state machine.
 *
 * Legal transitions (PRD §7):
 *
 *   claimed  -> draft           (autosave)
 *   draft    -> submitted       (submit)
 *   submitted -> needs_revision (reviewer decision)
 *   submitted -> accepted       (reviewer decision)
 *   submitted -> rejected       (reviewer decision)
 *   needs_revision -> draft     (contributor re-opens)
 *   accepted -> paid            (settlement)
 *   rejected -> appealed        (contributor appeals)
 *   appealed -> accepted        (appeal upheld)
 *   appealed -> rejected        (appeal dismissed)
 *
 * A rejected task is NEVER paid.
 * An accepted task is paid AT MOST ONCE.
 */

export type TaskStatus =
  | "available"   // unclaimed, ready for contributors
  | "claimed"     // lease held, not yet saved as draft
  | "draft"       // contributor is editing
  | "submitted"   // waiting in review queue
  | "needs_revision"
  | "accepted"
  | "rejected"
  | "appealed"
  | "paid";

type TransitionMap = Partial<Record<TaskStatus, TaskStatus[]>>;

const TRANSITIONS: TransitionMap = {
  available: ["claimed"],
  claimed: ["draft", "available"],       // available = lease expired / released
  draft: ["submitted", "available"],     // available = contributor abandons
  submitted: ["needs_revision", "accepted", "rejected"],
  needs_revision: ["draft"],
  accepted: ["paid"],
  rejected: ["appealed"],
  appealed: ["accepted", "rejected"],
  paid: [],
};

export function isLegalTransition(from: TaskStatus, to: TaskStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertLegalTransition(from: TaskStatus, to: TaskStatus): void {
  if (!isLegalTransition(from, to)) {
    throw new Error(
      `Illegal task state transition: ${from} -> ${to}`,
    );
  }
}

/** Tasks that can accept a submission */
export const SUBMITTABLE_STATUSES: TaskStatus[] = ["draft", "needs_revision"];

/** Tasks eligible for settlement */
export const PAYABLE_STATUSES: TaskStatus[] = ["accepted"];

/** Tasks that are terminal (no further progress possible) */
export const TERMINAL_STATUSES: TaskStatus[] = ["paid", "rejected"];
