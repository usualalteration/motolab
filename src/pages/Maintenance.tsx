import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGarage } from "@/contexts/GarageContext";
import { api } from "@/lib/api";
import type { MaintenanceRecord, MaintenanceCategory } from "@/types";
import { MAINTENANCE_CATEGORIES, categoryLabel } from "@/types";
import { toast } from "sonner";
import {
  Wrench, Plus, Pencil, Trash2, Save, Loader2, CalendarDays, Gauge,
} from "@/components/icons";
import MotorcycleSelector from "@/components/MotorcycleSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface FormState {
  category: MaintenanceCategory;
  operationDate: string;
  mileage: string;
  cost: string;
  notes: string;
}
const EMPTY: FormState = {
  category: "engine_oil", operationDate: "", mileage: "", cost: "", notes: "",
};

export default function Maintenance() {
  const { selected, selectedId, motorcycles } = useGarage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MaintenanceRecord | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: records = [], isLoading } = useQuery<MaintenanceRecord[]>({
    queryKey: ["maintenance", selectedId],
    queryFn: () =>
      api.get<MaintenanceRecord[]>(`/api/my/v1/maintenance?motorcycleId=${selectedId}`),
    enabled: selectedId !== null,
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, operationDate: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };
  const openEdit = (r: MaintenanceRecord) => {
    setEditing(r);
    setForm({
      category: r.category as MaintenanceCategory,
      operationDate: r.operationDate ?? "",
      mileage: r.mileage ? String(r.mileage) : "",
      cost: r.cost != null ? String(r.cost) : "",
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        motorcycleId: selectedId,
        category: form.category,
        operationDate: form.operationDate,
        mileage: form.mileage ? Number(form.mileage) : null,
        cost: form.cost ? Number(form.cost) : null,
        notes: form.notes || null,
      };
      if (editing) {
        return api.put<MaintenanceRecord>(`/api/my/v1/maintenance/${editing.id}`, payload);
      }
      return api.post<MaintenanceRecord>("/api/my/v1/maintenance", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Record updated" : "Maintenance recorded");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["maintenance", selectedId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.del(`/api/my/v1/maintenance/${id}`),
    onSuccess: () => {
      toast.success("Record deleted");
      qc.invalidateQueries({ queryKey: ["maintenance", selectedId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.operationDate) {
      toast.error("Operation date is required");
      return;
    }
    saveMutation.mutate();
  };

  const fmtMileage = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("en-US") : "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            Operation history and records
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MotorcycleSelector />
          {selected && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Add record
            </Button>
          )}
        </div>
      </div>

      {motorcycles.length === 0 ? (
        <EmptyState text="Register a motorcycle first to track maintenance." />
      ) : !selected ? (
        <EmptyState text="Select a motorcycle to view its maintenance history." />
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center space-y-4 py-16 text-center">
            <Wrench className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <h2 className="font-bold">No maintenance recorded</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Log the first operation for this {selected.brand} {selected.model}.
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Add record
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">History · {records.length} operations</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {records.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-secondary/10">
                      <Wrench className="h-4 w-4 text-secondary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{categoryLabel(r.category)}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {r.operationDate}
                        </span>
                        {r.mileage != null && (
                          <span className="flex items-center gap-1 font-mono">
                            <Gauge className="h-3 w-3" />
                            {fmtMileage(r.mileage)} km
                          </span>
                        )}
                        {r.cost != null && <span>€{r.cost.toFixed(2)}</span>}
                      </div>
                      {r.notes && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this record?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The maintenance operation will be permanently removed from history.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(r.id)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit record" : "Add maintenance record"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as MaintenanceCategory })}>
                <SelectTrigger id="category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAINTENANCE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="operationDate">Operation date <span className="text-primary">*</span></Label>
                <Input id="operationDate" name="operationDate" type="date" required value={form.operationDate}
                  onChange={(e) => setForm({ ...form, operationDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mileage">Mileage (km)</Label>
                <Input id="mileage" name="mileage" type="number" value={form.mileage}
                  onChange={(e) => setForm({ ...form, mileage: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost">Cost (€)</Label>
                <Input id="cost" name="cost" type="number" step="0.01" value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing ? "Save" : "Add record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center space-y-2 py-20 text-center">
        <Wrench className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
