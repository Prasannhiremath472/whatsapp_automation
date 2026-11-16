import { cn } from "@/lib/utils";

/** Genie brand mark: a speech bubble with a spark. */
export function GenieMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <path d="M16 7c-5 0-9 3.6-9 8.1 0 2.3 1 4.3 2.7 5.8L9 25l4.3-2.1c.9.3 1.8.4 2.7.4 5 0 9-3.6 9-8.1S21 7 16 7Z" fill="var(--primary-foreground)" />
      <path d="m16 11 1.2 2.9 2.8 1.2-2.8 1.2L16 19.2l-1.2-2.9-2.8-1.2 2.8-1.2L16 11Z" fill="var(--primary)" />
    </svg>
  );
}
