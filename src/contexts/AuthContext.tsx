import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@/types";
import { api, getToken, setToken, clearToken } from "@/lib/api";

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTok] = useState<string | null>(getToken());
  const [loading, setLoading] = useState(true);

  // Validate persisted token on every full load before rendering protected UI.
  // Uses a direct fetch to /api/my/v1/me so the session bootstrap is observable.
  useEffect(() => {
    const t = getToken();
    if (!t) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/my/v1/me", { headers: { Authorization: `Bearer ${t}` } })
      .then((res) => res.json())
      .then((raw) => {
        if (cancelled) return;
        const body = raw && typeof raw === "object" && "body" in raw ? raw.body : raw;
        const data = body?.data;
        if (body?.success && data?.user) {
          setUser(data.user);
          setTok(t);
        } else {
          clearToken();
          setTok(null);
          setUser(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearToken();
        setTok(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = (newToken: string, u: User) => {
    setToken(newToken);
    setTok(newToken);
    setUser(u);
  };

  const logout = async () => {
    try {
      await api.post("/api/my/v1/logout");
    } catch {
      // token may already be invalid; ignore
    }
    clearToken();
    setTok(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user && !!token,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
