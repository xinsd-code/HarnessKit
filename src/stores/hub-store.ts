import { create } from "zustand";
import { api } from "@/lib/invoke";
import type { Extension, ExtensionKind, ExtensionContent, ConfigScope } from "@/lib/types";
import { toast } from "./toast-store";

function hubInstallKey(hubExtId: string, scope: ConfigScope, agent: string): string {
  return scope.type === "global"
    ? `${hubExtId}:global:${agent}`
    : `${hubExtId}:project:${scope.path}:${agent}`;
}

interface HubState {
  extensions: Extension[];
  loading: boolean;
  hasFetched: boolean;
  kindFilter: ExtensionKind | null;
  searchQuery: string;
  selectedId: string | null;
  hubPath: string | null;
  extensionContent: Map<string, ExtensionContent>;
  /** Persistent set of hub-install keys for tracking which scope+agent combos
   *  have been installed. Unlike component-local state this survives remounts. */
  hubInstalledKeys: Set<string>;
  fetch: () => Promise<void>;
  setKindFilter: (kind: ExtensionKind | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedId: (id: string | null) => void;
  backupToHub: (id: string) => Promise<void>;
  installFromHub: (id: string, agent: string, scope: ConfigScope, force: boolean) => Promise<void>;
  deleteFromHub: (id: string) => Promise<void>;
  importToHub: (path: string, kind: string) => Promise<void>;
  loadExtensionContent: (id: string) => Promise<void>;
  markInstalled: (hubExtId: string, scope: ConfigScope, agent: string) => void;
  unmarkInstalled: (hubExtId: string, scope: ConfigScope, agent: string) => void;
  isHubInstalled: (hubExtId: string, scope: ConfigScope, agent: string) => boolean;
}

export const useHubStore = create<HubState>((set, get) => ({
  extensions: [],
  loading: false,
  hasFetched: false,
  kindFilter: null,
  searchQuery: "",
  selectedId: null,
  hubPath: null,
  extensionContent: new Map(),
  hubInstalledKeys: new Set(),

  async fetch() {
    set({ loading: true });
    try {
      const [extensions, hubPath] = await Promise.all([
        api.listHubExtensions(),
        api.getHubPath(),
      ]);
      set({ extensions, hubPath, loading: false, hasFetched: true });
    } catch (e) {
      console.error("Failed to fetch hub extensions:", e);
      set({ loading: false, hasFetched: true });
    }
  },

  setKindFilter(kind) {
    set({ kindFilter: kind });
  },

  setSearchQuery(query) {
    set({ searchQuery: query });
  },

  setSelectedId(id) {
    set({ selectedId: id });
    // Clear content when deselecting
    if (!id) {
      set({ extensionContent: new Map() });
    }
  },

  async backupToHub(id) {
    try {
      await api.backupToHub(id);
      toast.success("Backed up to Local Hub");
      await get().fetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to backup: ${msg}`);
      throw e;
    }
  },

  async installFromHub(id, agent, scope, force) {
    try {
      await api.installFromHub(id, agent, scope, force);
      toast.success(`Installed to ${agent}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to install: ${msg}`);
      throw e;
    }
  },

  async deleteFromHub(id) {
    try {
      await api.deleteFromHub(id);
      toast.success("Deleted from Local Hub");
      set({ selectedId: null });
      await get().fetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to delete: ${msg}`);
      throw e;
    }
  },

  async importToHub(path, kind) {
    try {
      await api.importToHub(path, kind);
      toast.success("Imported to Local Hub");
      await get().fetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to import: ${msg}`);
      throw e;
    }
  },

  async loadExtensionContent(id) {
    try {
      const content = await api.getHubExtensionContent(id);
      set((s) => {
        const map = new Map(s.extensionContent);
        map.set(id, content);
        return { extensionContent: map };
      });
    } catch (e) {
      console.error("Failed to load extension content:", e);
    }
  },

  markInstalled(hubExtId, scope, agent) {
    set((s) => {
      const next = new Set(s.hubInstalledKeys);
      next.add(hubInstallKey(hubExtId, scope, agent));
      return { hubInstalledKeys: next };
    });
  },

  unmarkInstalled(hubExtId, scope, agent) {
    set((s) => {
      const next = new Set(s.hubInstalledKeys);
      next.delete(hubInstallKey(hubExtId, scope, agent));
      return { hubInstalledKeys: next };
    });
  },

  isHubInstalled(hubExtId, scope, agent) {
    return get().hubInstalledKeys.has(hubInstallKey(hubExtId, scope, agent));
  },
}));

