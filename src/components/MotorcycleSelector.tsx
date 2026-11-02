import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGarage } from "@/contexts/GarageContext";
import { Bike } from "lucide-react";

export default function MotorcycleSelector() {
  const { motorcycles, selectedId, select, loading } = useGarage();

  if (loading && motorcycles.length === 0) {
    return (
      <div className="h-10 w-56 animate-pulse rounded-md bg-muted/50" />
    );
  }

  if (motorcycles.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bike className="h-4 w-4" />
        No motorcycles registered
      </div>
    );
  }

  return (
    <Select
      value={selectedId ? String(selectedId) : undefined}
      onValueChange={(v) => select(Number(v))}
    >
      <SelectTrigger className="h-10 w-56">
        <SelectValue placeholder="Select motorcycle" />
      </SelectTrigger>
      <SelectContent>
        {motorcycles.map((m) => (
          <SelectItem key={m.id} value={String(m.id)}>
            {m.brand} {m.model} {m.year ? `· ${m.year}` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
