import { create } from "zustand";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateState {
  /** Available update version, null if none or not checked yet */
  available: { version: string; body: string } | null;
  checking: boolean;
  installing: boolean;
  /** Whether a check has completed (regardless of result) */
  checked: boolean;

  checkForUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  available: null,
  checking: false,
  installing: false,
  checked: false,

  async checkForUpdate() {
    if (get().checking) return;
    set({ checking: true });
    try {
      const update = await check();
      if (update) {
        set({ available: { version: update.version, body: update.body ?? "" } });
      }
    } catch {
      // Silent failure — update check is non-critical
    } finally {
      set({ checking: false, checked: true });
    }
  },

  async installUpdate() {
    if (get().installing) return;
    set({ installing: true });
    try {
      const update = await check();
      if (update) {
        await update.downloadAndInstall();
        await relaunch();
      }
    } catch {
      set({ installing: false });
    }
  },
}));
