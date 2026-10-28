/**
 * Hand-drawn, stroke-based icon set.
 *
 * Kept deliberately small and semantic — no icon library dependency, and
 * no decorative icons. Every icon here conveys meaning that the adjacent
 * text also carries, so nothing is colour- or glyph-only.
 *
 * All icons inherit `currentColor` and size via `className`.
 */

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = (props: IconProps) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...props,
});

export const ArrowRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 12h15" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

export const ArrowUpRight = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </svg>
);

export const ChevronDown = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const Menu = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const Close = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const Play = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l11-6.5-11-6.5Z" />
  </svg>
);

export const Pause = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M9 5v14M15 5v14" />
  </svg>
);

export const Check = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const AlertTriangle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4.5 3 19.5h18L12 4.5Z" />
    <path d="M12 10v4" />
    <path d="M12 17.2h.01" />
  </svg>
);

export const Clock = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const Lock = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);

export const Layers = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
    <path d="m4 12.5 8 4.3 8-4.3" />
    <path d="m4 16.5 8 4.3 8-4.3" />
  </svg>
);

export const Film = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <path d="M8 5v14M16 5v14M3.5 12h17" />
  </svg>
);

export const Scissors = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6.5" cy="6.5" r="2.5" />
    <circle cx="6.5" cy="17.5" r="2.5" />
    <path d="M8.7 8.3 20 18M8.7 15.7 20 6" />
  </svg>
);

export const ShieldCheck = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5 5 6v6c0 4 2.9 7.4 7 8.5 4.1-1.1 7-4.5 7-8.5V6l-7-2.5Z" />
    <path d="m9 12 2 2 4-4.5" />
  </svg>
);

export const FileText = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3.5h7.5L18.5 8v12.5h-12.5v-17Z" />
    <path d="M13 3.5V8h5" />
  </svg>
);

export const Database = (p: IconProps) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="6.5" rx="7" ry="3" />
    <path d="M5 6.5v11c0 1.7 3.1 3 7 3s7-1.3 7-3v-11" />
    <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
  </svg>
);

export const Users = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.9c2 .6 3.5 2.2 3.5 4.6" />
  </svg>
);

export const Scale = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v16M7 20h10" />
    <path d="M4 9h16M4 9l-2.5 5.5a3.2 3.2 0 0 0 5 0L4 9Zm16 0-2.5 5.5a3.2 3.2 0 0 0 5 0L20 9Z" />
  </svg>
);

export const Sparkle = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 3.5 13.8 9l5.7 1.9-5.7 1.9L12 18l-1.8-5.2L4.5 10.9 10.2 9 12 3.5Z" />
  </svg>
);

export const Info = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5M12 7.8h.01" />
  </svg>
);

export const Grid = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </svg>
);

export const List = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M8 6h12M8 12h12M8 18h12" />
    <path d="M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);

export const Download = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 4v10" />
    <path d="m8 10.5 4 4 4-4" />
    <path d="M5 19.5h14" />
  </svg>
);

export const Upload = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M12 15V5" />
    <path d="m8 8.5 4-4 4 4" />
    <path d="M5 19.5h14" />
  </svg>
);

export const Wand = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M5 19 15.5 8.5" />
    <path d="M14 4.5l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2Z" />
    <path d="M19 12.5l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7.7-1.4Z" />
  </svg>
);

export const Receipt = (p: IconProps) => (
  <svg {...base(p)}>
    <path d="M6 3.5h12v17l-3-1.8-3 1.8-3-1.8-3 1.8v-17Z" />
    <path d="M9.5 8.5h5M9.5 12.5h5" />
  </svg>
);

export const Wallet = (p: IconProps) => (
  <svg {...base(p)}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M9 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M9 18v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const Route = (p: IconProps) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6.5" r="2.5" />
    <circle cx="18" cy="17.5" r="2.5" />
    <path d="M8.5 6.5h5a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3" />
  </svg>
);