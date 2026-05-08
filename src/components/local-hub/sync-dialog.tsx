import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { KindBadge } from "@/components/shared/kind-badge";
import { api } from "@/lib/invoke";
import type { Extension, ExtensionKind } from "@/lib/types";
import { useHubStore } from "@/stores/hub-store";
import { toast } from "@/stores/toast-store";

interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
}

const tabOrder: Array<{ key: "all" | ExtensionKind; label: string }> = [
  { key: "all", label: "All" },
  { key: "skill", label: "Skills" },
  { key: "mcp", label: "MCP" },
  { key: "plugin", label: "Plugins" },
  { key: "cli", label: "CLIs" },
];
const MAX_VISIBLE_SYNC_ROWS = 10;

export function SyncDialog({ open, onClose }: SyncDialogProps) {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [toSync, setToSync] = useState<Extension[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | ExtensionKind>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const fetch = useHubStore((s) => s.fetch);

  useEffect(() => {
    if (open) {
      setPreviewFailed(false);
      setActiveTab("all");
      setLoading(true);
      api
        .previewSyncToHub()
        .then((result) => {
          setToSync(result.to_sync);
          // Select all non-conflict extensions by default
          setSelectedIds(new Set(result.to_sync.map((e) => e.id)));
        })
        .catch((e) => {
          setPreviewFailed(true);
          console.error("Failed to preview sync:", e);
          toast.error("Failed to preview sync");
        })
        .finally(() => setLoading(false));
    }
  }, [open]);

  const handleSync = async () => {
    if (selectedIds.size === 0) return;

    setSyncing(true);
    try {
      const ids = [...selectedIds];
      const synced = await api.syncExtensionsToHub(ids);
      toast.success(`Synced ${synced.length} extension(s) to Local Hub`);
      await fetch();
      onClose();
    } catch (e) {
      console.error("Sync failed:", e);
      toast.error("Failed to sync extensions");
    } finally {
      setSyncing(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    setSelectedIds(new Set(toSync.map((e) => e.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const visibleExtensions = useMemo(
    () =>
      activeTab === "all"
        ? toSync
        : toSync.filter((ext) => ext.kind === activeTab),
    [activeTab, toSync],
  );
  const totalCount = toSync.length;
  const tabCounts = useMemo(() => {
    const counts = new Map<"all" | ExtensionKind, number>();
    counts.set("all", toSync.length);
    counts.set("skill", toSync.filter((ext) => ext.kind === "skill").length);
    counts.set("mcp", toSync.filter((ext) => ext.kind === "mcp").length);
    counts.set("plugin", toSync.filter((ext) => ext.kind === "plugin").length);
    counts.set("cli", toSync.filter((ext) => ext.kind === "cli").length);
    return counts;
  }, [toSync]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20">
      <div className="flex max-h-[calc(100vh-7rem)] w-[760px] flex-col rounded-xl border border-border bg-card shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <RefreshCw size={18} />
            <h3 className="font-medium">Sync to Local Hub</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-accent text-muted-foreground"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : previewFailed ? (
            <div className="text-center py-8 text-muted-foreground">
              Failed to load sync preview. Please retry.
            </div>
          ) : totalCount === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              All extensions are already synced to Local Hub
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center justify-between">
                <p className="text-sm">
                  Found <strong>{toSync.length}</strong> new extension(s) to sync
                </p>
                {toSync.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-primary hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={deselectAll}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Deselect all
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {tabOrder.map((tab) => {
                  const count = tabCounts.get(tab.key) ?? 0;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        activeTab === tab.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {tab.label} ({count})
                    </button>
                  );
                })}
              </div>

              {visibleExtensions.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase">
                    {activeTab === "all"
                      ? "New Extensions"
                      : `${tabOrder.find((tab) => tab.key === activeTab)?.label ?? "Extensions"}`}
                  </h4>
                  <div className="overflow-hidden rounded-xl border border-border/70">
                    <div className="grid grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)] gap-3 border-b border-border bg-muted/30 px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <span>Name</span>
                      <span>Kind</span>
                      <span>Description</span>
                    </div>
                    <div
                      className="overflow-y-auto divide-y divide-border"
                      style={{ maxHeight: `${MAX_VISIBLE_SYNC_ROWS * 68}px` }}
                    >
                    {visibleExtensions.map((ext) => (
                      <label
                        key={ext.id}
                        className="grid cursor-pointer grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)] gap-3 px-4 py-3 hover:bg-accent/40"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(ext.id)}
                            onChange={() => toggleSelection(ext.id)}
                            className="mt-0.5 rounded border-border accent-primary"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {ext.name}
                            </p>
                            {ext.pack && (
                              <p className="truncate text-xs text-muted-foreground">
                                {ext.pack}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="pt-0.5">
                          <KindBadge kind={ext.kind} />
                        </div>
                        <p className="truncate text-sm text-muted-foreground">
                          {ext.description || "-"}
                        </p>
                      </label>
                    ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No extensions in this category need syncing.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || selectedIds.size === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {syncing ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Sync {selectedIds.size > 0 && `(${selectedIds.size})`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
