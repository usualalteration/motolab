import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGarage } from "@/contexts/GarageContext";
import { api } from "@/lib/api";
import type { Motorcycle } from "@/types";
import { toast } from "sonner";
import {
  Bike, Plus, Pencil, Trash2, Gauge, Save, Loader2,
} from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface FormState {
  brand: string;
  model: string;
  year: string;
  engineDisplacement: string;
  registrationDate: string;
  currentMileage: string;
  vin: string;
  notes: string;
  photoUrl: string;
}

const EMPTY: FormState = {
  brand: "", model: "", year: "", engineDisplacement: "",
  registrationDate: "", currentMileage: "0", vin: "", notes: "", photoUrl: "",
};

function toForm(m: Motorcycle): FormState {
  return {
    brand: m.brand, model: m.model,
    year: m.year ? String(m.year) : "",
    engineDisplacement: m.engineDisplacement ? String(m.engineDisplacement) : "",
    registrationDate: m.registrationDate ?? "",
    currentMileage: String(m.currentMileage ?? 0),
    vin: m.vin ?? "", notes: m.notes ?? "", photoUrl: m.photoUrl ?? "",
  };
}

export default function Garage() {
  const { motorcycles, loading, refresh } = useGarage();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Motorcycle | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openNew = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };
  const openEdit = (m: Motorcycle) => {
    setEditing(m);
    setForm(toForm(m));
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        brand: form.brand, model: form.model,
        year: form.year ? Number(form.year) : null,
        engineDisplacement: form.engineDisplacement ? Number(form.engineDisplacement) : null,
        registrationDate: form.registrationDate || null,
        currentMileage: Number(form.currentMileage) || 0,
        vin: form.vin || null,
        notes: form.notes || null,
        photoUrl: form.photoUrl || null,
      };
      if (editing) {
        return api.put<Motorcycle>(`/api/my/v1/motorcycles/${editing.id}`, payload);
      }
      return api.post<Motorcycle>("/api/my/v1/motorcycles", payload);
    },
    onSuccess: async () => {
      toast.success(editing ? "Motorcycle updated" : "Motorcycle added");
      setOpen(false);
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.del(`/api/my/v1/motorcycles/${id}`),
    onSuccess: async () => {
      toast.success("Motorcycle removed");
      await refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.brand.trim() || !form.model.trim()) {
      toast.error("Brand and model are required");
      return;
    }
    saveMutation.mutate();
  };

  const fmtMileage = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("en-US") : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Garage</h1>
          <p className="text-sm text-muted-foreground">
            Register and manage your motorcycles
          </p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" />
          Add motorcycle
        </Button>
      </div>

      {loading && motorcycles.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      ) : motorcycles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center space-y-4 py-20 text-center">
            <Bike className="h-16 w-16 text-muted-foreground/40" />
            <div>
              <h2 className="text-lg font-bold">Your garage is empty</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add your first motorcycle to begin tracking.
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Add motorcycle
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {motorcycles.map((m) => (
            <Card key={m.id} className="flex flex-col">
              <div className="relative grid-bg flex h-32 items-center justify-center overflow-hidden rounded-t-md bg-muted/20">
                {m.photoUrl ? (
                  <img src={m.photoUrl} alt={`${m.brand} ${m.model}`} className="h-full w-full object-cover" />
                ) : (
                  <Bike className="h-12 w-12 text-muted-foreground/40" />
                )}
              </div>
              <CardContent className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold tracking-tight">{m.brand} {m.model}</h3>
                    <div className="text-xs text-muted-foreground">
                      {m.year ? `${m.year}` : "—"}
                      {m.engineDisplacement ? ` · ${m.engineDisplacement} cc` : ""}
                    </div>
                  </div>
                  <Badge variant="muted" className="gap-1">
                    <Gauge className="h-3 w-3" />
                    {fmtMileage(m.currentMileage)} km
                  </Badge>
                </div>
                {m.vin && (
                  <div className="mt-2 font-mono text-xs text-muted-foreground">
                    VIN {m.vin}
                  </div>
                )}
                {m.notes && (
                  <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{m.notes}</p>
                )}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(m)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {m.brand} {m.model}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This permanently deletes the motorcycle and all its maintenance
                          records, components, and document associations. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate(m.id)}
                          disabled={deleteMutation.isPending}
                        >
                          {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit motorcycle" : "Add motorcycle"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Brand" id="brand" required>
                <Input id="brand" name="brand" required value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })} />
              </Field>
              <Field label="Model" id="model" required>
                <Input id="model" name="model" required value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })} />
              </Field>
              <Field label="Year" id="year">
                <Input id="year" name="year" type="number" value={form.year}
                  onChange={(e) => setForm({ ...form, year: e.target.value })} />
              </Field>
              <Field label="Displacement (cc)" id="engineDisplacement">
                <Input id="engineDisplacement" name="engineDisplacement" type="number" value={form.engineDisplacement}
                  onChange={(e) => setForm({ ...form, engineDisplacement: e.target.value })} />
              </Field>
              <Field label="Current mileage (km)" id="currentMileage">
                <Input id="currentMileage" name="currentMileage" type="number" value={form.currentMileage}
                  onChange={(e) => setForm({ ...form, currentMileage: e.target.value })} />
              </Field>
              <Field label="Registration date" id="registrationDate">
                <Input id="registrationDate" name="registrationDate" type="date" value={form.registrationDate}
                  onChange={(e) => setForm({ ...form, registrationDate: e.target.value })} />
              </Field>
            </div>
            <Field label="VIN" id="vin">
              <Input id="vin" name="vin" value={form.vin}
                onChange={(e) => setForm({ ...form, vin: e.target.value })} />
            </Field>
            <Field label="Photo URL" id="photoUrl">
              <Input id="photoUrl" name="photoUrl" type="url" placeholder="https://..." value={form.photoUrl}
                onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} />
            </Field>
            <Field label="Notes" id="notes">
              <Textarea id="notes" name="notes" rows={3} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing ? "Save changes" : "Add motorcycle"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, id, required, children }: { label: string; id: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label} {required && <span className="text-primary">*</span>}
      </Label>
      {children}
    </div>
  );
}
