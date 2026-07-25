const API_BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const json = await res.json();
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

  // Warehouses
  getWarehouses: (search?: string) =>
    request<any[]>(`/warehouses${search ? `?search=${search}` : ""}`),
};
