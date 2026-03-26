import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  theme: "dark" | "light";
  toggleSidebar: () => void;
  setTheme: (theme: "dark" | "light") => void;
}

const storedTheme = (typeof localStorage !== "undefined" && localStorage.getItem("hk-theme")) as "dark" | "light" | null;

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  theme: storedTheme ?? "dark",
  toggleSidebar() { set((s) => ({ sidebarOpen: !s.sidebarOpen })); },
  setTheme(theme) {
    localStorage.setItem("hk-theme", theme);
    set({ theme });
  },
}));
