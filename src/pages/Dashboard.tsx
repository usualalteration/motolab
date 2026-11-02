import { useQuery } from "@tanstack/react-query";
import { useGarage } from "@/contexts/GarageContext";
import { api } from "@/lib/api";
import type { DashboardData } from "@/types";
import { categoryLabel } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import MotorcycleSelector from "@/components/MotorcycleSelector";
import {
  Bike, Gauge, Wrench, Cpu, FileText, CalendarClock, CalendarDays, Mileage,
} from "@/components/icons";

export default function Dashboard() {
  const { selected, selectedId, motorcycles } = useGarage();
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", selectedId],
    queryFn: () => api.post<DashboardData>("/api/my/v1/dashboard", { motorcycleId: selectedId }),
    enabled: selectedId !== null,
  });

  const fmtMileage = (n: number | null | undefined) =>
    n != null ? n.toLocaleString("en-US") : "—";

  if (motorcycles.length === 0) {
    return <EmptyGarage />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Real-time garage overview</p>
        </div>
        <MotorcycleSelector />
      </div>

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* Hero motorcycle card */}
          <Card className="overflow-hidden">
            <div className="grid md:grid-cols-[260px_1fr]">
              <div className="relative grid-bg flex items-center justify-center bg-muted/20 p-6">
                {data.selected?.photoUrl ? (
                  <img
                    src={data.selected.photoUrl}
                    alt={`${data.selected.brand} ${data.selected.model}`}
                    className="h-40 w-full rounded-md object-cover"
                  />
                ) : (
                  <Bike className="h-24 w-24 text-muted-foreground/40" />
                )}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="label-tech mb-1">selected unit</div>
                    <h2 className="text-2xl font-bold tracking-tight">
                      {data.selected?.brand} {data.selected?.model}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {data.selected?.year && <span>{data.selected.year}</span>}
                      {data.selected?.engineDisplacement && (
                        <>
                          <span>·</span>
                          <span>{data.selected.engineDisplacement} cc</span>
                        </>
                      )}
                      {data.selected?.vin && (
                        <>
                          <span>·</span>
                          <span className="font-mono">VIN {data.selected.vin}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant="secondary" className="gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
                    in service
                  </Badge>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Current mileage" value={fmtMileage(data.selected?.currentMileage)} unit="km" icon={Gauge} />
                  <Stat label="Maintenance ops" value={String(data.stats.totalMaintenance)} icon={Wrench} />
                  <Stat label="Components" value={String(data.stats.totalComponents)} icon={Cpu} />
                  <Stat label="Documents" value={String(data.stats.totalDocuments)} icon={FileText} />
                </div>
              </div>
            </div>
          </Card>

          {/* Upcoming + recent */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Upcoming maintenance
                </CardTitle>
                <Badge variant="muted">{data.upcomingMaintenance.length}</Badge>
              </CardHeader>
              <CardContent>
                {data.upcomingMaintenance.length === 0 ? (
                  <EmptyRow text="No scheduled reminders configured" />
                ) : (
                  <ul className="space-y-2">
                    {data.upcomingMaintenance.map((u) => (
                      <li
                        key={u.scheduleId}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="font-mono text-sm text-secondary">
                            {categoryLabel(u.category)}
                          </div>
                          {u.verified ? (
                            <Badge variant="default">verified</Badge>
                          ) : (
                            <Badge variant="muted">custom</Badge>
                          )}
                        </div>
                        <div className="text-right text-xs text-muted-foreground">
                          {u.dueMileage != null && (
                            <div className="font-mono">{fmtMileage(u.dueMileage)} km</div>
                          )}
                          {u.dueDate && (
                            <div className="flex items-center justify-end gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {u.dueDate}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4 text-primary" />
                  Recent maintenance
                </CardTitle>
                <Badge variant="muted">{data.recentMaintenance.length}</Badge>
              </CardHeader>
              <CardContent>
                {data.recentMaintenance.length === 0 ? (
                  <EmptyRow text="No maintenance recorded yet" />
                ) : (
                  <ul className="space-y-2">
                    {data.recentMaintenance.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
                      >
                        <div className="space-y-0.5">
                          <div className="font-mono text-sm text-secondary">
                            {categoryLabel(r.category)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.operationDate}
                            {r.mileage != null && ` · ${fmtMileage(r.mileage)} km`}
                            {r.cost != null && ` · €${r.cost.toFixed(2)}`}
                          </div>
                        </div>
                        {r.notes && (
                          <div className="max-w-[40%] truncate text-xs text-muted-foreground" title={r.notes}>
                            {r.notes}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Component status */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-primary" />
                Component status
              </CardTitle>
              <Badge variant="muted">{data.componentStatus.length} active</Badge>
            </CardHeader>
            <CardContent>
              {data.componentStatus.length === 0 ? (
                <EmptyRow text="No active components tracked" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.componentStatus.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{c.name}</div>
                        {c.category && (
                          <div className="text-xs text-muted-foreground">{categoryLabel(c.category)}</div>
                        )}
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, unit, icon: Icon }: { label: string; value: string; unit?: string; icon: React.ElementType }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-1.5 label-tech">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="stat-value">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "due") return <Badge variant="destructive">due</Badge>;
  if (status === "soon") return <Badge variant="warning">soon</Badge>;
  return <Badge variant="secondary">active</Badge>;
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function EmptyGarage() {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-20 text-center">
      <Bike className="h-16 w-16 text-muted-foreground/40" />
      <div>
        <h2 className="text-xl font-bold">No motorcycles registered</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add your first motorcycle in My Garage to start tracking.
        </p>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-48 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
