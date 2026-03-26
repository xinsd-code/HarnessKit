import { create } from "zustand";
import type { MarketplaceItem, SkillAuditInfo } from "@/lib/types";
import { api } from "@/lib/invoke";

type TabKind = "skill" | "mcp";

interface MarketplaceState {
  tab: TabKind;
  query: string;
  results: MarketplaceItem[];
  trending: MarketplaceItem[];
  loading: boolean;
  trendingLoading: boolean;
  selectedItem: MarketplaceItem | null;
  previewContent: string | null;
  previewLoading: boolean;
  auditInfo: SkillAuditInfo | null;
  auditLoading: boolean;
  installing: string | null;
  setTab: (tab: TabKind) => void;
  setQuery: (query: string) => void;
  search: () => Promise<void>;
  loadTrending: () => Promise<void>;
  selectItem: (item: MarketplaceItem) => void;
  closePreview: () => void;
  install: (item: MarketplaceItem) => Promise<string>;
}

export const useMarketplaceStore = create<MarketplaceState>((set, get) => ({
  tab: "skill",
  query: "",
  results: [],
  trending: [],
  loading: false,
  trendingLoading: false,
  selectedItem: null,
  previewContent: null,
  previewLoading: false,
  auditInfo: null,
  auditLoading: false,
  installing: null,
  setTab(tab) {
    set({ tab, results: [], query: "", selectedItem: null, trending: [] });
    get().loadTrending();
  },
  setQuery(query) { set({ query }); },
  async search() {
    const { query, tab } = get();
    if (query.length < 2) { set({ results: [] }); return; }
    set({ loading: true });
    try {
      const results = await api.searchMarketplace(query, tab);
      set({ results, loading: false });
    } catch {
      set({ results: [], loading: false });
    }
  },
  async loadTrending() {
    const { tab } = get();
    set({ trendingLoading: true });
    try {
      const trending = await api.trendingMarketplace(tab, 10);
      set({ trending, trendingLoading: false });
    } catch {
      set({ trending: [], trendingLoading: false });
    }
  },
  selectItem(item) {
    set({
      selectedItem: item,
      previewContent: null, previewLoading: item.kind === "skill",
      auditInfo: null, auditLoading: item.kind === "skill",
    });
    if (item.kind === "skill") {
      // Always resolve via skills.sh to get the correct source/skillId
      api.searchMarketplace(item.name, "skill", 5).then((results) => {
        const match = results.find((r) => r.name === item.name) ?? results[0];
        if (!match) {
          set({ previewLoading: false, auditLoading: false });
          return;
        }
        const { source, skill_id } = match;
        api.fetchSkillPreview(source, skill_id)
          .then((content) => set({ previewContent: content, previewLoading: false }))
          .catch(() => set({ previewContent: null, previewLoading: false }));
        api.fetchSkillAudit(source, skill_id)
          .then((auditInfo) => set({ auditInfo, auditLoading: false }))
          .catch(() => set({ auditInfo: null, auditLoading: false }));
      }).catch(() => {
        set({ previewLoading: false, auditLoading: false });
      });
    }
  },
  closePreview() { set({ selectedItem: null, previewContent: null, auditInfo: null }); },
  async install(item) {
    set({ installing: item.id });
    try {
      const name = await api.installFromMarketplace(item.source, item.skill_id);
      set({ installing: null });
      return name;
    } catch (e) {
      set({ installing: null });
      throw e;
    }
  },
}));
