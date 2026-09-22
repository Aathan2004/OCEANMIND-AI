import { Waves } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Shared frame for the login and register pages so both use one visual system:
 * a deep-ocean field with light rays behind a single glass card.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-10">
      {/* Decorative depth wash. Sits behind the card and is hidden from AT. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--ocean-cyan)_18%,transparent),transparent_70%)] blur-2xl" />
        <div className="absolute bottom-0 right-0 h-[28rem] w-[28rem] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--ocean-teal)_14%,transparent),transparent_70%)] blur-2xl" />
      </div>

      <div className="glass w-full max-w-md rounded-3xl p-7 shadow-[var(--shadow-glass)] sm:p-9">
        <div className="flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-primary-foreground shadow-[var(--shadow-glow)]">
            <Waves className="size-6" />
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">
            <span className="text-gradient-ocean">OCEANMIND AI</span>
          </h1>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Marine Intelligence Platform
          </p>
          <h2 className="mt-6 text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="mt-7">{children}</div>

        <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>
      </div>
    </div>
  );
}
