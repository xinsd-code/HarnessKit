import { invoke } from "@tauri-apps/api/core";
import type { Extension, AgentInfo, DashboardStats, AuditResult } from "./types";

export const api = {
  listExtensions(kind?: string, agent?: string): Promise<Extension[]> {
    return invoke("list_extensions", { kind, agent });
  },

  listAgents(): Promise<AgentInfo[]> {
    return invoke("list_agents");
  },

  getDashboardStats(): Promise<DashboardStats> {
    return invoke("get_dashboard_stats");
  },

  toggleExtension(id: string, enabled: boolean): Promise<void> {
    return invoke("toggle_extension", { id, enabled });
  },

  runAudit(): Promise<AuditResult[]> {
    return invoke("run_audit");
  },

  scanAndSync(): Promise<number> {
    return invoke("scan_and_sync");
  },

  deleteExtension(id: string): Promise<void> {
    return invoke("delete_extension", { id });
  },

  getExtensionContent(id: string): Promise<string> {
    return invoke("get_extension_content", { id });
  },
};
