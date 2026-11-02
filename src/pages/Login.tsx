import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Gauge, Mail, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import type { AuthResponse } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.post<AuthResponse>("/api/my/v1/login", { email, password });
      login(data.token, data.user);
      toast.success("Session established");
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left brand panel */}
      <div className="relative hidden flex-col justify-between border-r border-border bg-card/30 p-10 lg:flex">
        <div className="grid-bg absolute inset-0 opacity-40" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-primary/15">
            <Gauge className="h-6 w-6 text-primary" />
          </div>
          <div className="font-mono text-xl font-bold tracking-widest">
            MOTO<span className="text-primary">LAB</span>
          </div>
        </div>
        <div className="relative space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">
            Digital motorcycle<br />
            <span className="text-primary">control system</span>
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            Register and manage your motorcycles, monitor mileage and maintenance
            schedules, and track every component — all from one technical
            workstation.
          </p>
        </div>
        <div className="relative font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          v1.0 · garage control
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 lg:hidden">
              <Gauge className="h-6 w-6 text-primary" />
              <span className="font-mono text-lg font-bold tracking-widest">
                MOTO<span className="text-primary">LAB</span>
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Access workstation</h2>
            <p className="text-sm text-muted-foreground">
              Authenticate to enter the garage.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="rider@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Connect
            </Button>
          </form>

          <div className="tech-divider" />
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Register a new rider
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
