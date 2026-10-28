import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "inverse"
  | "inverse-outline"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  // The single accent action — Encord Lime Green (#CCFF00) with black text
  primary:
    "bg-[#CCFF00] text-[#000000] font-semibold hover:bg-[#B8E600] active:bg-[#A3CC00] shadow-[0_1px_2px_rgba(0,0,0,0.08)] rounded-sm",
  // Neutral supporting action on light surfaces.
  secondary:
    "bg-white text-[#000000] border border-[#CCCCCC] hover:border-[#999999] hover:bg-[#F5F5F5] font-medium rounded-sm",
  ghost: "text-[#333333] hover:text-[#000000] hover:bg-[#F5F5F5] font-medium rounded-sm",
  // On dark/night surfaces.
  inverse: "bg-white text-[#000000] hover:bg-white/90 rounded-sm",
  "inverse-outline":
    "border border-white/20 text-white hover:bg-white/10 hover:border-white/30 rounded-sm",
  danger: "bg-[#DC2626] text-white hover:bg-[#B91C1C] rounded-sm",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-body-sm gap-1.5",
  md: "h-11 px-5 text-body-sm gap-2",
  lg: "h-12 px-6 text-body gap-2",
};

const baseClasses =
  "inline-flex select-none items-center justify-center font-semibold transition-colors duration-150 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: CommonProps & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = CommonProps & {
  href: string;
  /** External links open in a new tab and get a rel guard. */
  external?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">;

export function ButtonLink({
  href,
  external,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = cn(baseClasses, variantClasses[variant], sizeClasses[size], className);

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={classes} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes} {...rest}>
      {children}
    </Link>
  );
}