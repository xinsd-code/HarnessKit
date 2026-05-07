import { create } from "zustand";
import { api } from "@/lib/invoke";
import { AGENT_ORDER, type AgentInfo, agentDisplayName } from "@/lib/types";
import { toast } from "@/stores/toast-store";

interface AgentState {
  agents: AgentInfo[];
  loading: boolean;
  /** Current agent order — derived from backend-returned agents array. */
  agentOrder: readonly string[];
  fetch: () => Promise<void>;
  updatePath: (name: string, path: string | null) => Promise<void>;
  createAgent: (
    name: string,
    path: string,
    iconPath?: string | null,
  ) => Promise<boolean>;
  removeAgent: (name: string) => Promise<void>;
  updateIconPath: (name: string, iconPath: string | null) => Promise<void>;
  setEnabled: (name: string, enabled: boolean) => Promise<void>;
  reorderAgents: (orderedNames: string[]) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  agentOrder: AGENT_ORDER,
  async fetch() {
    set({ loading: true });
    try {
      const agents = await api.listAgents();
      // Backend returns agents already sorted by sort_order
      set({
        agents,
        agentOrder: agents.map((a) => a.name),
        loading: false,
      });
    } catch (e) {
      console.error("Failed to fetch agents:", e);
      set({ loading: false });
    }
  },
  async updatePath(name: string, path: string | null) {
    try {
      await api.updateAgentPath(name, path);
      await get().fetch();
      toast.success(
        path
          ? `${agentDisplayName(name)} path updated`
          : `${agentDisplayName(name)} custom path removed`,
      );
    } catch {
      toast.error(`Failed to update ${agentDisplayName(name)} path`);
    }
  },
  async createAgent(name: string, path: string, iconPath?: string | null) {
    try {
      await api.createAgent(name, path, iconPath);
      await get().fetch();
      toast.success(`${agentDisplayName(name)} added`);
      return true;
    } catch {
      toast.error(`Failed to add ${agentDisplayName(name)}`);
      return false;
    }
  },
  async removeAgent(name: string) {
    try {
      await api.removeAgent(name);
      await get().fetch();
      toast.success(`${agentDisplayName(name)} removed`);
    } catch {
      toast.error(`Failed to remove ${agentDisplayName(name)}`);
    }
  },
  async updateIconPath(name: string, iconPath: string | null) {
    try {
      await api.setAgentIconPath(name, iconPath);
      set({
        agents: get().agents.map((a) =>
          a.name === name ? { ...a, icon_path: iconPath } : a,
        ),
      });
      toast.success(`${agentDisplayName(name)} icon updated`);
    } catch {
      toast.error(`Failed to update ${agentDisplayName(name)} icon`);
    }
  },
  async setEnabled(name: string, enabled: boolean) {
    try {
      await api.setAgentEnabled(name, enabled);
      set({
        agents: get().agents.map((a) =>
          a.name === name ? { ...a, enabled } : a,
        ),
      });
      toast.success(
        `${agentDisplayName(name)} ${enabled ? "enabled" : "disabled"}`,
      );
    } catch {
      toast.error(`Failed to update ${agentDisplayName(name)}`);
    }
  },
  async reorderAgents(orderedNames: string[]) {
    // Optimistic update
    const agents = get().agents;
    const byName = new Map(agents.map((a) => [a.name, a]));
    const reordered = orderedNames
      .map((n) => byName.get(n))
      .filter(Boolean) as AgentInfo[];
    set({ agents: reordered, agentOrder: orderedNames });
    try {
      await api.updateAgentOrder(orderedNames);
    } catch {
      toast.error("Failed to save agent order");
      // Revert on failure
      get().fetch();
    }
  },
}));
