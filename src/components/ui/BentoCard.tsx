"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "large" | "full";
  href?: string;
}

export function BentoCard({
  children,
  className,
  variant = "default",
  href,
}: BentoCardProps) {
  const baseClasses = "bento-card";
  const variantClasses = {
    default: "",
    large: "lg:col-span-2",
    full: "lg:col-span-[1_-1]",
  };

  const Content = ({ children }: { children: ReactNode }) => (
    <div className="flex flex-col h-full">
      {children}
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        className={cn(
          "bento-card",
          variant !== "default" && "lg:col-span-2",
          "flex flex-col h-full",
        )}
      >
        <div className="flex flex-col h-full flex-1">{children}</div>
      </a>
    );
  }

  return (
    <div className="bento-card flex flex-col h-full">
      {children}
    </div>
  );
}

export function BentoCardImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-auto rounded-lg mb-6 object-cover"
    />
  );
}