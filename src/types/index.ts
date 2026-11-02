// MotoLab shared domain types

export interface User {
  id: number;
  email: string;
  name: string | null;
  createdAt: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Motorcycle {
  id: number;
  ownerId: number;
  brand: string;
  model: string;
  year: number | null;
  engineDisplacement: number | null;
  registrationDate: string | null;
  currentMileage: number;
  vin: string | null;
  notes: string | null;
  photoUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export type MaintenanceCategory =
  | "engine_oil"
  | "oil_filter"
  | "air_filter"
  | "spark_plugs"
  | "brakes"
  | "brake_fluid"
  | "chain"
  | "sprockets"
  | "tires"
  | "battery"
  | "coolant"
  | "general_inspection"
  | "other";

export const MAINTENANCE_CATEGORIES: { value: MaintenanceCategory; label: string }[] = [
  { value: "engine_oil", label: "Engine Oil" },
  { value: "oil_filter", label: "Oil Filter" },
  { value: "air_filter", label: "Air Filter" },
  { value: "spark_plugs", label: "Spark Plugs" },
  { value: "brakes", label: "Brakes" },
  { value: "brake_fluid", label: "Brake Fluid" },
  { value: "chain", label: "Chain" },
  { value: "sprockets", label: "Sprockets" },
  { value: "tires", label: "Tires" },
  { value: "battery", label: "Battery" },
  { value: "coolant", label: "Coolant" },
  { value: "general_inspection", label: "General Inspection" },
  { value: "other", label: "Other" },
];

export function categoryLabel(c: string): string {
  return MAINTENANCE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export interface MaintenanceRecord {
  id: number;
  motorcycleId: number;
  ownerId: number;
  category: string;
  operationDate: string | null;
  mileage: number | null;
  cost: number | null;
  notes: string | null;
  componentId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Component {
  id: number;
  motorcycleId: number;
  ownerId: number;
  name: string;
  category: string | null;
  installationDate: string | null;
  installationMileage: number | null;
  replacementDate: string | null;
  replacementMileage: number | null;
  expectedMaintenanceInterval: number | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocFile {
  id: number;
  ownerId: number;
  motorcycleId: number | null;
  maintenanceId: number | null;
  filename: string;
  contentType: string | null;
  sizeBytes: number | null;
  s3Key: string;
  docType: string | null;
  createdAt: string | null;
}

export interface DashboardData {
  motorcycles: { id: number; brand: string; model: string; year: number | null; currentMileage: number; photoUrl: string | null }[];
  selected: Motorcycle | null;
  stats: {
    totalMotorcycles: number;
    totalMaintenance: number;
    totalComponents: number;
    totalDocuments: number;
    upcomingCount: number;
  };
  recentMaintenance: {
    id: number; category: string; operationDate: string | null;
    mileage: number | null; cost: number | null; notes: string | null;
  }[];
  upcomingMaintenance: {
    scheduleId: number; category: string; verified: boolean;
    intervalMileage: number | null; intervalDays: number | null;
    dueMileage: number | null; dueDate: string | null;
  }[];
  componentStatus: {
    id: number; name: string; category: string | null;
    installationMileage: number | null; replacementMileage: number | null;
    expectedMaintenanceInterval: number | null; status: string;
  }[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: string | null;
}
