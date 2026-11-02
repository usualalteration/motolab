import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Bike,
  Wrench,
  Cpu,
  FileText,
  LogOut,
  Gauge,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/garage", label: "My Garage", icon: Bike },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/components", label: "Components", icon: Cpu },
  { to: "/documents", label: "Documents", icon: FileText },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/15">
            <Gauge className="h-5 w-5 text-primary" />
          </div>
          <div className="leading-tight">
            <div className="font-mono text-sm font-bold tracking-widest text-primary">
              MOTO<span className="text-foreground">LAB</span>
            </div>
            <div className="label-tech">garage control</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )
              }
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 truncate px-2 text-xs text-muted-foreground">
            {user?.email}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Disconnect
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/50 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Gauge className="h-5 w-5 text-primary" />
            <span className="font-mono text-sm font-bold tracking-widest text-primary">
              MOTO<span className="text-foreground">LAB</span>
            </span>
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            Motorcycle diagnostic workstation
          </div>
          <div className="flex items-center gap-1 md:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-9 w-9 items-center justify-center rounded-md",
                    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive"
              aria-label="Disconnect"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
