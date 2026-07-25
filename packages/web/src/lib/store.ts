import { create } from "zustand";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  costcoMemberId: string | null;
  homeWarehouseId: number | null;
}

interface AppState {
  user: User | null;
  isLoading: boolean;
  checkAuth: () => Promise<void>;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (email: string, password: string, warehouseId?: number) => Promise<string | null>;
  logout: () => Promise<void>;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  isLoading: true,

  checkAuth: async () => {
    set({ isLoading: true });
    const res = await api.me();
    set({ user: res.success ? res.data : null, isLoading: false });
  },

  login: async (email, password) => {
    const res = await api.login({ email, password });
    if (res.success) {
      const me = await api.me();
      set({ user: me.data });
      return null;
    }
    return res.error || "Login failed";
  },

  signup: async (email, password, homeWarehouseId) => {
    const res = await api.signup({ email, password, homeWarehouseId });
    if (res.success) {
      const me = await api.me();
      set({ user: me.data });
      return null;
    }
    return res.error || "Signup failed";
  },

  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));
