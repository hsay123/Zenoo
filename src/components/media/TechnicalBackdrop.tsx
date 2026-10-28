import { cn } from "@/lib/utils/cn";

/**
 * Abstract, low-contrast technical backdrop for media placeholders.
 *
 * It hints at robotics and industrial machinery using thin line work —
 * an articulated arm, sensor arcs and a sparse node lattice — rather than
 * mock dashboards, stock photography or decorative gradients. It carries
 * no information, so it is hidden from assistive technology.
 */
export function TechnicalBackdrop({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  const stroke = tone === "dark" ? "rgba(246,245,251,0.30)" : "rgba(22,19,14,0.20)";
  const strokeFaint = tone === "dark" ? "rgba(246,245,251,0.14)" : "rgba(22,19,14,0.10)";
  const node = tone === "dark" ? "rgba(246,245,251,0.42)" : "rgba(22,19,14,0.28)";

  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
      className={cn("absolute inset-0 h-full w-full", className)}
    >
      <defs>
        <radialGradient id="tb-glow" cx="72%" cy="26%" r="62%">
          <stop
            offset="0%"
            stopColor={tone === "dark" ? "#7c61f2" : "#6547e4"}
            stopOpacity={tone === "dark" ? 0.22 : 0.07}
          />
          <stop
            offset="100%"
            stopColor={tone === "dark" ? "#14111f" : "#f4f2ef"}
            stopOpacity="0"
          />
        </radialGradient>
      </defs>

      <rect width="800" height="450" fill="url(#tb-glow)" />

      {/* Node lattice — suggests a point field / sensor sampling grid. */}
      <g fill={node}>
        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 5 }).map((_, col) => (
            <circle
              key={`${row}-${col}`}
              cx={560 + col * 46}
              cy={70 + row * 46}
              r={1.4}
              opacity={0.55 + ((row + col) % 3) * 0.15}
            />
          )),
        )}
      </g>

      {/* Sensor arcs from the top-right sample point. */}
      <g stroke={strokeFaint} fill="none">
        <path d="M560 70 A 120 120 0 0 0 440 190" />
        <path d="M560 70 A 190 190 0 0 0 370 260" />
        <path d="M560 70 A 265 265 0 0 0 295 335" />
      </g>

      {/* Articulated arm — base, two links, gripper. */}
      <g stroke={stroke} strokeWidth="1.5" fill="none" strokeLinecap="round">
        <path d="M120 392 h-44" strokeWidth="2" />
        <path d="M98 392 V 330" />
        <path d="M98 330 L 236 214" />
        <path d="M236 214 L 408 268" />
        <path d="M408 268 L 520 196" />
        {/* gripper */}
        <path d="M520 196 l 30 -14" />
        <path d="M536 182 l 8 16 M550 178 l 8 16" />
      </g>
      <g fill={tone === "dark" ? "#14111f" : "#faf9f7"} stroke={stroke} strokeWidth="1.5">
        <circle cx="98" cy="330" r="7" />
        <circle cx="236" cy="214" r="6.5" />
        <circle cx="408" cy="268" r="6" />
        <circle cx="520" cy="196" r="5" />
      </g>

      {/* Ground line + work surface. */}
      <path d="M60 392 H 740" stroke={strokeFaint} strokeWidth="1.5" />
      <path d="M300 392 v -22 h 150 v 22" stroke={strokeFaint} strokeWidth="1.5" fill="none" />
    </svg>
  );
}
