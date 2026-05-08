import { create } from "zustand";
import { api } from "@/lib/invoke";
import type { Extension, ExtensionKind, ExtensionContent, ConfigScope } from "@/lib/types";
import { toast } from "./toast-store";

interface HubState {
  extensions: Extension[];
  loading: boolean;
  hasFetched: boolean;
  kindFilter: ExtensionKind | null;
  searchQuery: string;
  selectedId: string | null;
  hubPath: string | null;
  extensionContent: Map<string, ExtensionContent>;
  fetch: () => Promise<void>;
  setKindFilter: (kind: ExtensionKind | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedId: (id: string | null) => void;
  backupToHub: (id: string) => Promise<void>;
  installFromHub: (id: string, agent: string, scope: ConfigScope, force: boolean) => Promise<void>;
  deleteFromHub: (id: string) => Promise<void>;
  importToHub: (path: string, kind: string) => Promise<void>;
  loadExtensionContent: (id: string) => Promise<void>;
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
}));
