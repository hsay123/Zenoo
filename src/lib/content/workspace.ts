/**
 * Navigation for the authenticated product surfaces.
 *
 * Kept as data so the shell can render any role from one definition and
 * so the active state is derived from the path, not hard-coded per page.
 */

export type WorkspaceRole = "buyer" | "contributor" | "reviewer" | "admin";

export type WorkspaceNavItem = {
  label: string;
  href: string;
  /** Match nested routes as active, e.g. `/workspace/buyer` matches detail pages. */
  prefix?: boolean;
};

export type WorkspaceRoleConfig = {
  key: WorkspaceRole;
  label: string;
  /** One-line description of the role's primary job. */
  job: string;
  home: string;
  nav: WorkspaceNavItem[];
};

export const workspaceRoles: Record<WorkspaceRole, WorkspaceRoleConfig> = {
  buyer: {
    key: "buyer",
    label: "Buyer",
    job: "Commission and fund jobs, watch quality and spend, deliver datasets.",
    home: "/workspace/buyer",
    nav: [
      { label: "Dashboard", href: "/workspace/buyer" },
      { label: "New job", href: "/workspace/buyer/new" },
      { label: "Quality", href: "/workspace/buyer/quality" },
      { label: "Exports", href: "/workspace/buyer/exports" },
      { label: "API", href: "/workspace/buyer/api" },
      { label: "Alerts", href: "/workspace/buyer/alerts" },
    ],
  },
  contributor: {
    key: "contributor",
    label: "Contributor",
    job: "Claim scoped tasks, annotate in the browser, track outcomes and payouts.",
    home: "/workspace/contributor",
    nav: [
      { label: "Tasks", href: "/workspace/contributor" },
      { label: "Submissions", href: "/workspace/contributor/submissions" },
      { label: "Earnings", href: "/workspace/contributor/earnings" },
      { label: "Alerts", href: "/workspace/contributor/alerts" },
    ],
  },
  reviewer: {
    key: "reviewer",
    label: "Reviewer",
    job: "Evaluate submissions against the rubric and record reason-coded decisions.",
    home: "/workspace/reviewer",
    nav: [
      { label: "Queue", href: "/workspace/reviewer" },
      { label: "Disputes", href: "/workspace/reviewer/disputes" },
    ],
  },
  admin: {
    key: "admin",
    label: "Admin",
    job: "Administer users and roles; inspect any workspace.",
    home: "/workspace/admin",
    nav: [{ label: "Users", href: "/workspace/admin" }],
  },
};

export const workspaceOrder: WorkspaceRole[] = [
  "buyer",
  "contributor",
  "reviewer",
  "admin",
];

export function roleFromPath(pathname: string): WorkspaceRole {
  if (pathname.startsWith("/workspace/admin")) return "admin";
  if (pathname.startsWith("/workspace/contributor")) return "contributor";
  if (pathname.startsWith("/workspace/reviewer")) return "reviewer";
  return "buyer";
}
