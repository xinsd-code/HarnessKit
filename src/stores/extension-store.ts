import { create } from "zustand";
import type { Extension, ExtensionKind } from "@/lib/types";
import { api } from "@/lib/invoke";

interface ExtensionState {
  extensions: Extension[];
  loading: boolean;
  kindFilter: ExtensionKind | null;
  agentFilter: string | null;
  searchQuery: string;
  selectedId: string | null;
  selectedIds: Set<string>;
  sortBy: "installed_at" | "name" | "trust_score";
  fetch: () => Promise<void>;
  setKindFilter: (kind: ExtensionKind | null) => void;
  setAgentFilter: (agent: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedId: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  setSortBy: (sort: "installed_at" | "name" | "trust_score") => void;
  toggle: (id: string, enabled: boolean) => Promise<void>;
  batchToggle: (enabled: boolean) => Promise<void>;
  batchDelete: () => Promise<void>;
  filtered: () => Extension[];
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  extensions: [],
  loading: false,
  kindFilter: null,
  agentFilter: null,
  searchQuery: "",
  selectedId: null,
  selectedIds: new Set(),
  sortBy: "installed_at",
  async fetch() {
    set({ loading: true });
    const extensions = await api.listExtensions(
      get().kindFilter ?? undefined,
      get().agentFilter ?? undefined,
    );
    set({ extensions, loading: false });
  },
  setKindFilter(kind) { set({ kindFilter: kind }); get().fetch(); },
  setAgentFilter(agent) { set({ agentFilter: agent }); get().fetch(); },
  setSearchQuery(query) { set({ searchQuery: query }); },
  setSelectedId(id) { set({ selectedId: id }); },
  toggleSelected(id) {
    const s = new Set(get().selectedIds);
    if (s.has(id)) s.delete(id); else s.add(id);
    set({ selectedIds: s });
  },
  selectAll() {
    const ids = new Set(get().filtered().map((e) => e.id));
    set({ selectedIds: ids });
  },
  clearSelection() { set({ selectedIds: new Set() }); },
  setSortBy(sortBy) { set({ sortBy }); },
  async toggle(id, enabled) {
    await api.toggleExtension(id, enabled);
    get().fetch();
  },
  async batchToggle(enabled) {
    for (const id of get().selectedIds) {
      await api.toggleExtension(id, enabled);
    }
    set({ selectedIds: new Set() });
    get().fetch();
  },
  async batchDelete() {
    for (const id of get().selectedIds) {
      await api.deleteExtension(id);
    }
    set({ selectedIds: new Set() });
    get().fetch();
  },
  filtered() {
    const { extensions, searchQuery } = get();
    if (!searchQuery.trim()) return extensions;
    const q = searchQuery.toLowerCase();
    return extensions.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.agents.some((a) => a.toLowerCase().includes(q))
    );
  },
}));
