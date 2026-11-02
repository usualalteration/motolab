import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGarage } from "@/contexts/GarageContext";
import { api } from "@/lib/api";
import type { Component } from "@/types";
import { categoryLabel } from "@/types";
import { toast } from "sonner";
import {
  Cpu, Plus, Pencil, Trash2, Save, Loader2,
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
import { MAINTENANCE_CATEGORIES } from "@/types";

interface FormState {
  name: string;
  category: string;
  installationDate: string;
  installationMileage: string;
  replacementDate: string;
  replacementMileage: string;
  expectedMaintenanceInterval: string;
  notes: string;
}
const EMPTY: FormState = {
  name: "", category: "brakes", installationDate: "", installationMileage: "",
  replacementDate: "", replacementMileage: "", expectedMaintenanceInterval: "", notes: "",
};

export default function Components() {
  const { selected, selectedId, motorcycles } = useGarage();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Component | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const { data: components = [], isLoading } = useQuery<Component[]>({
    queryKey: ["components", selectedId],
    queryFn: () =>
      api.get<Component[]>(`/api/my/v1/components?motorcycleId=${selectedId}`),
    enabled: selectedId !== null,
  });

  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: Component) => {
    setEditing(c);
    setForm({
      name: c.name, category: c.category ?? "other",
      installationDate: c.installationDate ?? "",
      installationMileage: c.installationMileage ? String(c.installationMileage) : "",
      replacementDate: c.replacementDate ?? "",
      replacementMileage: c.replacementMileage ? String(c.replacementMileage) : "",
      expectedMaintenanceInterval: c.expectedMaintenanceInterval ? String(c.expectedMaintenanceInterval) : "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        motorcycleId: selectedId,
        name: form.name,
        category: form.category,
        installationDate: form.installationDate || null,
        installationMileage: form.installationMileage ? Number(form.installationMileage) : null,
        replacementDate: form.replacementDate || null,
        replacementMileage: form.replacementMileage ? Number(form.replacementMileage) : null,
        expectedMaintenanceInterval: form.expectedMaintenanceInterval ? Number(form.expectedMaintenanceInterval) : null,
        notes: form.notes || null,
      };
      if (editing) return api.put<Component>(`/api/my/v1/components/${editing.id}`, payload);
      return api.post<Component>("/api/my/v1/components", payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Component updated" : "Component added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["components", selectedId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.del(`/api/my/v1/components/${id}`),
    onSuccess: () => {
      toast.success("Component removed");
      qc.invalidateQueries({ queryKey: ["components", selectedId] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Component name is required"); return; }
    saveMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Components</h1>
          <p className="text-sm text-muted-foreground">Track individual parts and replacements</p>
        </div>
        <div className="flex items-center gap-2">
          <MotorcycleSelector />
          {selected && (
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Add component</Button>
          )}
        </div>
      </div>

      {motorcycles.length === 0 ? (
        <Empty text="Register a motorcycle first to track components." />
      ) : !selected ? (
        <Empty text="Select a motorcycle to view its components." />
      ) : isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-md bg-muted/30" />)}
        </div>
      ) : components.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center space-y-4 py-16 text-center">
            <Cpu className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <h2 className="font-bold">No components tracked</h2>
              <p className="mt-1 text-sm text-muted-foreground">Add the first component for this {selected.brand} {selected.model}.</p>
            </div>
            <Button onClick={openNew}><Plus className="h-4 w-4" /> Add component</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {components.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{c.name}</h3>
                    {c.category && <Badge variant="muted" className="mt-1">{categoryLabel(c.category)}</Badge>}
                  </div>
                  {c.replacementDate ? (
                    <Badge variant="muted">replaced</Badge>
                  ) : (
                    <Badge variant="secondary">active</Badge>
                  )}
                </div>
                <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {c.installationMileage != null && (
                    <div className="flex justify-between"><dt>Installed at</dt><dd className="font-mono">{c.installationMileage.toLocaleString()} km</dd></div>
                  )}
                  {c.expectedMaintenanceInterval != null && (
                    <div className="flex justify-between"><dt>Interval</dt><dd className="font-mono">{c.expectedMaintenanceInterval.toLocaleString()} km</dd></div>
                  )}
                  {c.replacementMileage != null && (
                    <div className="flex justify-between"><dt>Replaced at</dt><dd className="font-mono">{c.replacementMileage.toLocaleString()} km</dd></div>
                  )}
                </dl>
                <div className="mt-3 flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {c.name}?</AlertDialogTitle>
                        <AlertDialogDescription>This component record will be permanently deleted.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit component" : "Add component"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name <span className="text-primary">*</span></Label>
              <Input id="name" name="name" required value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
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
                <Label htmlFor="installationDate">Installation date</Label>
                <Input id="installationDate" name="installationDate" type="date" value={form.installationDate}
                  onChange={(e) => setForm({ ...form, installationDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="installationMileage">Install mileage (km)</Label>
                <Input id="installationMileage" name="installationMileage" type="number" value={form.installationMileage}
                  onChange={(e) => setForm({ ...form, installationMileage: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="replacementDate">Replacement date</Label>
                <Input id="replacementDate" name="replacementDate" type="date" value={form.replacementDate}
                  onChange={(e) => setForm({ ...form, replacementDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="replacementMileage">Replace mileage (km)</Label>
                <Input id="replacementMileage" name="replacementMileage" type="number" value={form.replacementMileage}
                  onChange={(e) => setForm({ ...form, replacementMileage: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expectedMaintenanceInterval">Expected interval (km)</Label>
              <Input id="expectedMaintenanceInterval" name="expectedMaintenanceInterval" type="number" value={form.expectedMaintenanceInterval}
                onChange={(e) => setForm({ ...form, expectedMaintenanceInterval: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing ? "Save" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center space-y-2 py-20 text-center">
        <Cpu className="h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
