/**
 * Site-wide navigation and footer structure.
 *
 * Every entry points at a real route that exists in this app. There are
 * no dead links: entries that are not yet implemented are marked
 * `status: "planned"` and rendered as clearly-disabled, labelled items
 * rather than links that appear functional.
 */

export type NavStatus = "live" | "planned";

export type NavLink = {
  label: string;
  href: string;
  description?: string;
  status?: NavStatus;
};

export type NavGroup = {
  label: string;
  href: string;
  columns: { heading: string; links: NavLink[] }[];
  footnote?: NavLink;
};

export const primaryNav: NavGroup[] = [
  {
    label: "Platform",
    href: "/platform",
    columns: [
      {
        heading: "Workflow",
        links: [
          {
            label: "Annotate and structure",
            href: "/platform#annotate",
            description: "Footage becomes timestamped, schema-validated labels.",
          },
          {
            label: "Review and validate",
            href: "/platform#review",
            description: "Human review against a rubric, with reason-coded outcomes.",
          },
          {
            label: "Deliver and verify",
            href: "/platform#deliver",
            description: "Accepted work becomes a versioned, exportable dataset.",
          },
        ],
      },
      {
        heading: "Capabilities",
        links: [
          {
            label: "Quality system",
            href: "/platform#quality",
            description: "Gold tasks, schema validation, audit sampling.",
          },
          {
            label: "Provenance and receipts",
            href: "/platform#provenance",
            description: "Trace an export back to the decisions behind it.",
          },
          {
            label: "Data export",
            href: "/platform#export",
            description: "JSONL and CSV plus schema, quality report and manifest.",
          },
        ],
      },
    ],
    footnote: {
      label: "See how the workflow fits together",
      href: "/how-it-works",
    },
  },
  {
    label: "Solutions",
    href: "/solutions",
    columns: [
      {
        heading: "By use case",
        links: [
          {
            label: "Robotics manipulation",
            href: "/solutions#manipulation",
            description: "Reach, grasp, place and failure events.",
          },
          {
            label: "Humanoid and embodied AI",
            href: "/solutions#humanoid",
            description: "Task phases from egocentric and third-person capture.",
          },
          {
            label: "Industrial automation",
            href: "/solutions#industrial",
            description: "Workcell actions, handoffs and defects.",
          },
          {
            label: "Autonomous systems",
            href: "/solutions#autonomous",
            description: "Navigation and interaction events over time.",
          },
        ],
      },
      {
        heading: "By role",
        links: [
          {
            label: "For data and ML teams",
            href: "/solutions#buyers",
            description: "Commission reviewed data and export it into training.",
          },
          {
            label: "For contributors",
            href: "/solutions#contributors",
            description: "Scoped paid tasks with visible criteria.",
          },
          {
            label: "For reviewers",
            href: "/solutions#reviewers",
            description: "Rubric-driven review with an audit trail.",
          },
        ],
      },
    ],
  },
  {
    label: "Resources",
    href: "/resources",
    columns: [
      {
        heading: "Learn",
        links: [
          {
            label: "How it works",
            href: "/how-it-works",
            description: "The end-to-end data lifecycle.",
          },
          {
            label: "About Zeno",
            href: "/about",
            description: "Why we build quality-assured data operations.",
          },
          {
            label: "Documentation",
            href: "/resources#docs",
            description: "Export schema, API surface and setup guides.",
            status: "planned",
          },
        ],
      },
      {
        heading: "Talk to us",
        links: [
          {
            label: "Contact",
            href: "/contact",
            description: "Start a pilot or ask a question.",
          },
          {
            label: "Changelog",
            href: "/resources#changelog",
            description: "What shipped, with dates.",
            status: "planned",
          },
        ],
      },
    ],
  },
];

export const headerActions = {
  signIn: { label: "Sign in", href: "/login" },
  explore: { label: "Explore product", href: "/explore" },
  primary: { label: "Get started", href: "/signup" },
} as const;

export const footerColumns = [
  {
    heading: "Platform",
    links: [
      { label: "Overview", href: "/platform" },
      { label: "Annotate and structure", href: "/platform#annotate" },
      { label: "Review and validate", href: "/platform#review" },
      { label: "Deliver and verify", href: "/platform#deliver" },
      { label: "Quality system", href: "/platform#quality" },
    ],
  },
  {
    heading: "Solutions",
    links: [
      { label: "Robotics manipulation", href: "/solutions#manipulation" },
      { label: "Humanoid and embodied AI", href: "/solutions#humanoid" },
      { label: "Industrial automation", href: "/solutions#industrial" },
      { label: "Autonomous systems", href: "/solutions#autonomous" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "How it works", href: "/how-it-works" },
      { label: "Contact", href: "/contact" },
      { label: "Sign in", href: "/login" },
    ],
  },
  {
    heading: "Product access",
    links: [
      { label: "Buyer workspace", href: "/workspace/buyer" },
      { label: "Contributor workspace", href: "/workspace/contributor" },
      { label: "Reviewer console", href: "/workspace/reviewer" },
      { label: "Get started", href: "/signup" },
    ],
  },
] as const;

export const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

export const brand = {
  name: "Zeno",
  tagline: "The data infrastructure for intelligent machines.",
} as const;
