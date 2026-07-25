import { z } from "zod";

// ─── Auth ────────────────────────────────────────────────────────────────────

export const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  costcoMemberId: z.string().optional(),
  homeWarehouseId: z.number().int().positive().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Receipt Parsing ─────────────────────────────────────────────────────────

export interface ParsedReceiptItem {
  itemNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isTaxable: boolean;
  confidence: number;
}

export interface ParsedReceipt {
  warehouseId: number | null;
  warehouseCity: string | null;
  receiptDate: string | null;
  memberNumber: string | null;
  items: ParsedReceiptItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  overallConfidence: number;
  rawText: string;
}

export type ParseStatus = "pending" | "processing" | "complete" | "failed";

// ─── Price Observations ──────────────────────────────────────────────────────

export const ManualPriceEntrySchema = z.object({
  itemId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  price: z.number().positive().multipleOf(0.01),
  observedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ManualPriceEntry = z.infer<typeof ManualPriceEntrySchema>;

export type PriceSource = "receipt_upload" | "manual_entry" | "web_scrape";

// ─── Price Alerts ────────────────────────────────────────────────────────────

export type AlertStatus =
  | "pending"
  | "notified"
  | "claimed"
  | "expired"
  | "dismissed";

export interface PriceAlert {
  id: string;
  itemDescription: string;
  itemNumber: number;
  originalPrice: number;
  newPrice: number;
  savings: number;
  eligibleUntil: string;
  daysRemaining: number;
  status: AlertStatus;
  warehouseName: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  activeTrackedItems: number;
  pendingAlerts: number;
  totalSavingsClaimed: number;
  totalSavingsAvailable: number;
  receiptsThisMonth: number;
}

export interface TrackedItem {
  id: string;
  itemNumber: number;
  description: string;
  purchasePrice: number;
  purchaseDate: string;
  warehouseId: number;
  warehouseName: string;
  daysRemaining: number;
  latestObservedPrice: number | null;
  priceDrop: number | null;
}

// ─── Reimbursement Guide ─────────────────────────────────────────────────────

export interface ReimbursementStep {
  stepNumber: number;
  title: string;
  description: string;
  actionType: "visit" | "call" | "online" | "info";
}

export interface ReimbursementGuide {
  itemDescription: string;
  itemNumber: number;
  purchaseDate: string;
  deadline: string;
  daysRemaining: number;
  originalPrice: number;
  newPrice: number;
  expectedRefund: number;
  quantity: number;
  warehouseName: string;
  warehouseId: number;
  steps: ReimbursementStep[];
}

// ─── Costco Price Ending Rules ───────────────────────────────────────────────

export type PriceEndingType =
  | "regular"
  | "clearance"
  | "manufacturer_special"
  | "unknown";

export interface PriceEndingAnalysis {
  type: PriceEndingType;
  ending: string;
  isEligibleForAdjustment: boolean;
  note: string;
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Notification Preferences ────────────────────────────────────────────────

export const NotificationPrefsSchema = z.object({
  email: z.boolean(),
  push: z.boolean(),
});

export type NotificationPrefs = z.infer<typeof NotificationPrefsSchema>;

// ─── Constants ───────────────────────────────────────────────────────────────

export const ADJUSTMENT_WINDOW_DAYS = 30;
export const PRICE_FRESHNESS_DAYS = 7;
export const MIN_OBSERVATIONS_FOR_ALERT = 2;
export const MIN_CONFIDENCE_THRESHOLD = 0.8;
