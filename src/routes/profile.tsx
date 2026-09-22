import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Fish, LogOut, Mail, Trash2, User as UserIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth-context";
import { clearHistoryFn, getHistoryFn } from "@/lib/history-server";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — OceanMind AI" }] }),
  component: GuardedProfile,
});

function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const history = useQuery({
    queryKey: ["fish-history", user?.id],
    queryFn: () => getHistoryFn(),
    // Scoping the key by user id means one account's rows can never be served
    // from cache to another account after a switch.
    enabled: user != null,
  });

  async function handleLogout() {
    await logout();
    navigate({ to: "/", replace: true });
  }

  async function handleClear() {
    await clearHistoryFn();
    await history.refetch();
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-24 pt-12">
      <h1 className="font-display text-3xl font-bold sm:text-4xl">Profile</h1>
      <p className="mt-2 text-muted-foreground">Your account and identification history.</p>

      <section className="glass mt-8 rounded-2xl p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[image:var(--gradient-ocean)] text-2xl font-bold text-primary-foreground">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold">{user.name}</p>
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="size-3.5" />
              {user.email}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Member since {new Date(user.created_at + "Z").toLocaleDateString()}
            </p>
          </div>
          <Button variant="outline" className="ml-auto" onClick={handleLogout}>
            <LogOut className="size-4" />
            Logout
          </Button>
        </div>
      </section>

      <section id="settings" className="glass mt-6 scroll-mt-24 rounded-2xl p-6">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-4">
          <div>
            <p className="text-sm font-medium">Identification history</p>
            <p className="text-xs text-muted-foreground">
              Permanently delete every identification recorded on your account.
            </p>
          </div>
          <Button variant="destructive" size="sm" onClick={handleClear}>
            <Trash2 className="size-4" />
            Clear history
          </Button>
        </div>
      </section>

      <section className="glass mt-6 rounded-2xl p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Fish className="size-5 text-ocean-cyan" />
          Your identifications
        </h2>

        {history.isPending ? (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : history.isError ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            Could not load your history.
          </p>
        ) : !history.data?.history.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No identifications yet. Upload a fish photo on the Fish ID page to get started.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60">
            {history.data.history.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  {record.status === "identified" ? (
                    <>
                      <p className="truncate text-sm font-medium">{record.common_name}</p>
                      <p className="truncate text-xs italic text-muted-foreground">
                        {record.scientific_name}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {record.status === "not_fish" ? "Not a fish" : "Unidentified"}
                    </p>
                  )}
                </div>
                {record.confidence != null && (
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                    {record.confidence.toFixed(1)}%
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {new Date(record.created_at + "Z").toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GuardedProfile() {
  return (
    <ProtectedRoute>
      <Profile />
    </ProtectedRoute>
  );
}
