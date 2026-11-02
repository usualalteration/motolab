import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Motorcycle } from "@/types";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const SELECTED_KEY = "motolab_selected_moto";

interface GarageState {
  motorcycles: Motorcycle[];
  selected: Motorcycle | null;
  selectedId: number | null;
  loading: boolean;
  select: (id: number | null) => void;
  refresh: () => Promise<void>;
}

const GarageContext = createContext<GarageState | undefined>(undefined);

export function GarageProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [motorcycles, setMotorcycles] = useState<Motorcycle[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const raw = localStorage.getItem(SELECTED_KEY);
    return raw ? Number(raw) : null;
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const list = await api.get<Motorcycle[]>("/api/my/v1/motorcycles");
      setMotorcycles(list);
      setSelectedId((prev) => {
        if (prev && list.some((m) => m.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch {
      setMotorcycles([]);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const select = useCallback((id: number | null) => {
    setSelectedId(id);
    if (id === null) localStorage.removeItem(SELECTED_KEY);
    else localStorage.setItem(SELECTED_KEY, String(id));
  }, []);

  const selected = motorcycles.find((m) => m.id === selectedId) ?? null;

  useEffect(() => {
    if (selected) localStorage.setItem(SELECTED_KEY, String(selected.id));
  }, [selected]);

  return (
    <GarageContext.Provider
      value={{ motorcycles, selected, selectedId, loading, select, refresh }}
    >
      {children}
    </GarageContext.Provider>
  );
}

export function useGarage(): GarageState {
  const ctx = useContext(GarageContext);
  if (!ctx) throw new Error("useGarage must be used within GarageProvider");
  return ctx;
}
