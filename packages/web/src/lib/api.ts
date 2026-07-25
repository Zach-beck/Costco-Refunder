const API_BASE = "/api";

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string>),
  };

  const csrfToken = getCsrfToken();
  if (csrfToken && options?.method && options.method !== "GET") {
    headers["x-csrf-token"] = csrfToken;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers,
    ...options,
  });

  let json: any;
  try {
    json = await res.json();
  } catch {
    return { success: false, error: `Server error (${res.status})` };
  }

  if (!res.ok) {
    return { success: false, error: json.error || "Request failed" };
  }
  return json;
}

export const api = {
  // Auth
  signup: (data: { email: string; password: string; homeWarehouseId?: number }) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify(data) }),

  login: (data: { email: string; password: string }) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),

  logout: () => request("/auth/logout", { method: "POST" }),

  me: () => request<any>("/auth/me"),

  // Receipts
  getUploadUrl: () =>
    request<{ uploadUrl: string; imageKey: string }>("/receipts/upload-url", {
      method: "POST",
    }),

  uploadImage: async (uploadUrl: string, file: File) => {
    await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
  },

  createReceipt: (data: { imageKey: string; receiptDate?: string; warehouseId?: number }) =>
    request<any>("/receipts", { method: "POST", body: JSON.stringify(data) }),

  getReceipt: (id: string) => request<any>(`/receipts/${id}`),

  listReceipts: (page = 1) => request<any[]>(`/receipts?page=${page}`),

  confirmReceipt: (id: string) =>
    request<any>(`/receipts/${id}/confirm`, { method: "POST" }),

  updateReceiptItems: (id: string, corrections: any[]) =>
    request(`/receipts/${id}/items`, {
      method: "PATCH",
      body: JSON.stringify({ corrections }),
    }),

  getReceiptImage: (id: string) =>
    request<{ imageUrl: string }>(`/receipts/${id}/image`),

  deleteReceipt: (id: string) =>
    request(`/receipts/${id}`, { method: "DELETE" }),

  stopTracking: (itemId: string) =>
    request(`/receipts/items/${itemId}/stop-tracking`, { method: "PATCH" }),

  // Prices
  reportPrice: (data: { itemId: number; warehouseId: number; price: number; observedDate: string }) =>
    request("/prices/report", { method: "POST", body: JSON.stringify(data) }),

  getPriceHistory: (itemId: number, warehouseId?: number) =>
    request<any[]>(`/prices/${itemId}/history${warehouseId ? `?warehouseId=${warehouseId}` : ""}`),

  // Alerts
  getAlerts: (status = "pending") => request<any[]>(`/alerts?status=${status}`),

  claimAlert: (id: string) =>
    request(`/alerts/${id}/claim`, { method: "PATCH" }),

  dismissAlert: (id: string) =>
    request(`/alerts/${id}/dismiss`, { method: "PATCH" }),

  getReimbursementGuide: (id: string) => request<any>(`/alerts/${id}/guide`),

  // Dashboard
  getStats: () => request<any>("/dashboard/stats"),

  getTrackedItems: () => request<any[]>("/dashboard/tracked-items"),

  getSavingsHistory: () => request<any[]>("/dashboard/savings-history"),

  // Warehouses
  getWarehouses: (search?: string) =>
    request<any[]>(`/warehouses${search ? `?search=${search}` : ""}`),

  // Settings
  updateProfile: (data: any) =>
    request("/settings/profile", { method: "PATCH", body: JSON.stringify(data) }),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request("/settings/change-password", { method: "POST", body: JSON.stringify(data) }),

  savePushSubscription: (data: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request("/settings/push-subscription", { method: "POST", body: JSON.stringify(data) }),

  deletePushSubscription: (endpoint: string) =>
    request("/settings/push-subscription", { method: "DELETE", body: JSON.stringify({ endpoint }) }),

  // Password reset
  forgotPassword: (email: string) =>
    request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
};
