import { Link, useNavigate } from "@tanstack/react-router";
import {
  Fish,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
  Waves,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";

/** Pages anyone may visit. */
const publicLinks = [
  { to: "/", label: "Home" },
  { to: "/ocean-dashboard", label: "Ocean Dashboard" },
  { to: "/population-trends", label: "Trends" },
  { to: "/about", label: "About" },
] as const;

/** Pages that require a session — hidden entirely when signed out. */
const protectedLinks = [
  { to: "/fish-identification", label: "Fish ID" },
  { to: "/species-compare", label: "Compare" },
  { to: "/marine-ai", label: "Marine AI" },
  { to: "/research", label: "Research" },
] as const;

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [light, setLight] = useState(false);
  const { user, isAuthenticated, loading, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
  }, [light]);

  const links = isAuthenticated ? [...publicLinks, ...protectedLinks] : publicLinks;

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate({ to: "/", replace: true });
  }

  return (
    <header className="sticky top-0 z-50">
      <div className="glass mx-auto mt-3 flex max-w-7xl items-center gap-3 rounded-2xl px-4 py-3 sm:mx-4 lg:mx-auto">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[image:var(--gradient-ocean)] text-primary-foreground">
            <Waves className="size-5" />
          </span>
          <span className="truncate font-display text-lg font-bold">OceanMind AI</span>
        </Link>

        <nav className="ml-4 hidden flex-1 items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeProps={{ className: "bg-secondary text-foreground" }}
              activeOptions={{ exact: link.to === "/" }}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
            onClick={() => setLight((value) => !value)}
          >
            {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </Button>

          {/* Render nothing auth-related until the session check settles, so the
              bar doesn't flash "Login" at an already-signed-in user. */}
          {loading ? (
            <div className="size-9" aria-hidden="true" />
          ) : isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <span className="grid size-7 place-items-center rounded-full bg-[image:var(--gradient-ocean)] text-xs font-semibold text-primary-foreground">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/dashboard">
                    <LayoutDashboard className="size-4" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/profile">
                    <User className="size-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/profile" hash="settings">
                    <Settings className="size-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleLogout}>
                  <LogOut className="size-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Login</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/register">Register</Link>
              </Button>
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="glass mx-3 mt-2 grid gap-1 rounded-2xl p-3 lg:hidden">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}

          <div className="mt-2 border-t border-border/60 pt-2">
            {isAuthenticated && user ? (
              <>
                <p className="px-3 py-1 text-xs text-muted-foreground">
                  Signed in as <span className="font-medium text-foreground">{user.name}</span>
                </p>
                <Link
                  to="/dashboard"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Dashboard
                </Link>
                <Link
                  to="/profile"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  Profile
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-destructive hover:bg-secondary"
                >
                  Logout
                </button>
              </>
            ) : (
              <div className="grid gap-2 px-1 pt-1">
                <Button variant="outline" asChild onClick={() => setOpen(false)}>
                  <Link to="/login">Login</Link>
                </Button>
                <Button asChild onClick={() => setOpen(false)}>
                  <Link to="/register">Register</Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

export function MobileTabBar() {
  const { isAuthenticated } = useAuth();

  // The bottom bar mirrors the main nav: no protected destinations while signed out.
  const items = isAuthenticated
    ? ([
        { to: "/", label: "Home", icon: Waves },
        { to: "/fish-identification", label: "Identify", icon: Fish },
        { to: "/ocean-dashboard", label: "Ocean", icon: Waves },
        { to: "/dashboard", label: "Me", icon: User },
      ] as const)
    : ([
        { to: "/", label: "Home", icon: Waves },
        { to: "/ocean-dashboard", label: "Ocean", icon: Waves },
        { to: "/about", label: "About", icon: Fish },
        { to: "/login", label: "Login", icon: User },
      ] as const);

  return (
    <nav className="glass fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-2xl p-1 sm:hidden">
      {items.map((item) => (
        <Link
          key={item.label}
          to={item.to}
          activeProps={{ className: "text-ocean-cyan" }}
          activeOptions={{ exact: item.to === "/" }}
          className="flex flex-col items-center gap-1 rounded-xl py-2 text-[11px] text-muted-foreground"
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
