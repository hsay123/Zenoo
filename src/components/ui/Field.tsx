import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils/cn";

const controlClasses =
  "w-full rounded-md border border-line-strong bg-surface px-3.5 text-body text-ink placeholder:text-ink-4 transition-colors focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25 disabled:cursor-not-allowed disabled:bg-surface-muted";

function FieldShell({
  id,
  label,
  hint,
  required,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-body-sm font-medium text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-ink-4" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-1.5 text-caption font-normal text-ink-4">optional</span>
        )}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-caption text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  className,
  required,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} required={required} className={className}>
      <input
        id={id}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(controlClasses, "h-11")}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  id,
  label,
  hint,
  className,
  required,
  rows = 5,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} required={required} className={className}>
      <textarea
        id={id}
        required={required}
        rows={rows}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(controlClasses, "resize-y py-2.5 leading-relaxed")}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectField({
  id,
  label,
  hint,
  className,
  required,
  children,
  ...rest
}: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell id={id} label={label} hint={hint} required={required} className={className}>
      <select
        id={id}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={cn(controlClasses, "h-11 appearance-none pr-9")}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
