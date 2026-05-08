import { FolderPlus, HardDrive, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { HubDetail } from "@/components/local-hub/hub-detail";
import { HubFilters } from "@/components/local-hub/hub-filters";
import { HubTable } from "@/components/local-hub/hub-table";
import { SyncDialog } from "@/components/local-hub/sync-dialog";
import { useAgentStore } from "@/stores/agent-store";
import { useExtensionStore } from "@/stores/extension-store";
import { useHubStore } from "@/stores/hub-store";
import { toast } from "@/stores/toast-store";

export default function LocalHubPage() {
  const loading = useHubStore((s) => s.loading);
  const fetch = useHubStore((s) => s.fetch);
  const selectedId = useHubStore((s) => s.selectedId);
  const setSelectedId = useHubStore((s) => s.setSelectedId);
  const importToHub = useHubStore((s) => s.importToHub);
  const extensions = useHubStore((s) => s.extensions);
  const kindFilter = useHubStore((s) => s.kindFilter);
  const searchQuery = useHubStore((s) => s.searchQuery);
  const fetchAgents = useAgentStore((s) => s.fetch);
  const agents = useAgentStore((s) => s.agents);
  const checkUpdates = useExtensionStore((s) => s.checkUpdates);
  const checkingUpdates = useExtensionStore((s) => s.checkingUpdates);
  const installedExtensions = useExtensionStore((s) => s.extensions);
  const didFetchRef = useRef(false);
  const [showSyncDialog, setShowSyncDialog] = useState(false);

  const data = useMemo(() => {
    return extensions.filter((ext) => {
      if (kindFilter && ext.kind !== kindFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          ext.name.toLowerCase().includes(q) ||
          ext.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [extensions, kindFilter, searchQuery]);

  useEffect(() => {
    if (didFetchRef.current) return;
    didFetchRef.current = true;
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (agents.length === 0) {
      void fetchAgents();
    }
  }, [agents.length, fetchAgents]);

  // Close the detail panel when leaving the page
  useEffect(() => {
    return () => {
      useHubStore.setState({ selectedId: null });
    };
  }, []);

  const handleImport = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select directory to import",
      });
      if (selected && typeof selected === "string") {
        // Detect kind from directory contents
        let kind = "skill"; // default
        if (selected.includes("/mcp/") || selected.includes("\\mcp\\")) {
          kind = "mcp";
        } else if (selected.includes("/plugins/") || selected.includes("\\plugins\\")) {
          kind = "plugin";
        } else if (selected.includes("/clis/") || selected.includes("\\clis\\")) {
          kind = "cli";
        }
        await importToHub(selected, kind);
      }
    } catch (e) {
      console.error("Import failed:", e);
    }
  };

  const handleCheckUpdates = async () => {
    await checkUpdates();
    const latestStatuses = useExtensionStore.getState().updateStatuses;
    const matchedCount = data.filter((hubExt) =>
      installedExtensions.some((instance) => {
        if (instance.kind !== hubExt.kind || instance.name !== hubExt.name) {
          return false;
        }
        return latestStatuses.get(instance.id)?.status === "update_available";
      }),
    ).length;
    toast.success(
      matchedCount > 0
        ? `${matchedCount} 个 Local Hub 资产有可用更新`
        : "Local Hub 资产没有可用更新",
    );
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 -mb-6">
      {/* Fixed header */}
      <div className="shrink-0 space-y-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight select-none">
              Local Hub
            </h2>
            <button
              onClick={() => setShowSyncDialog(true)}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-accent hover:shadow-md"
            >
              <RefreshCw size={12} />
              Sync
            </button>
            <button
              onClick={() => {
                void handleCheckUpdates();
              }}
              disabled={checkingUpdates}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-accent hover:shadow-md disabled:opacity-50"
            >
              <RefreshCw
                size={12}
                className={checkingUpdates ? "animate-spin" : ""}
              />
              {checkingUpdates ? "Checking..." : "Check Updates"}
            </button>
            <button
              onClick={handleImport}
              className="flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm transition-[background-color,box-shadow] duration-200 hover:bg-accent hover:shadow-md"
            >
              <FolderPlus size={12} />
              Import
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <HardDrive size={14} />
            <span>~/.harnesskit</span>
          </div>
        </div>
        <HubFilters />
      </div>

      {/* Scrollable content */}
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0 overflow-y-auto pb-4">
          {loading && data.length === 0 ? (
            <div
              className="rounded-xl border border-border overflow-hidden shadow-sm"
              aria-live="polite"
              role="status"
            >
              <div className="bg-muted/20 px-4 py-3">
                <div className="h-3 w-20 rounded animate-shimmer" />
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 border-t border-border px-4 py-3"
                >
                  <div className="h-4 w-4 rounded animate-shimmer" />
                  <div className="h-3 w-32 rounded animate-shimmer" />
                  <div className="h-3 w-16 rounded animate-shimmer" />
                  <div className="h-3 w-24 rounded animate-shimmer" />
                </div>
              ))}
            </div>
          ) : (
            <HubTable data={data} />
          )}
        </div>
        {selectedId && (
          <button
            type="button"
            aria-label="Close extension details"
            onClick={() => setSelectedId(null)}
            className="absolute left-0 top-0 bottom-0 right-96 z-[5] cursor-default"
          />
        )}
        {selectedId && (
          <div className="absolute right-0 top-0 bottom-0 w-96 z-10">
            <HubDetail />
          </div>
        )}
      </div>

      <SyncDialog open={showSyncDialog} onClose={() => setShowSyncDialog(false)} />
    </div>
  );
}
