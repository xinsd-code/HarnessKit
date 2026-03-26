import { useEffect, useState } from "react";
import { useExtensionStore } from "@/stores/extension-store";
import { useAgentStore } from "@/stores/agent-store";
import { ExtensionTable } from "@/components/extensions/extension-table";
import { ExtensionFilters } from "@/components/extensions/extension-filters";
import { ExtensionDetail } from "@/components/extensions/extension-detail";
import { InstallDialog } from "@/components/extensions/install-dialog";
import { RefreshCw } from "lucide-react";

export default function ExtensionsPage() {
  const { loading, fetch, filtered, selectedId, selectedIds, batchToggle, batchDelete, clearSelection, checkUpdates } = useExtensionStore();
  const { fetch: fetchAgents } = useAgentStore();
  const data = filtered();
  const batchMode = selectedIds.size > 0;
  const [showInstall, setShowInstall] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { fetchAgents(); }, [fetchAgents]);

  return (
    <div className="flex gap-4">
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold">Extensions</h2>
            <button
              onClick={() => setShowInstall(true)}
              className="rounded-lg bg-zinc-900 px-3 py-1 text-xs text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Install
            </button>
            <button
              onClick={() => { setCheckingUpdates(true); checkUpdates().finally(() => setCheckingUpdates(false)); }}
              disabled={checkingUpdates}
              className="flex items-center gap-1 rounded-lg bg-zinc-100 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <RefreshCw size={12} className={checkingUpdates ? "animate-spin" : ""} />
              {checkingUpdates ? "Checking..." : "Check Updates"}
            </button>
          </div>
          {batchMode && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-500">{selectedIds.size} selected</span>
              <button onClick={() => batchToggle(true)} className="rounded-lg bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700">Enable</button>
              <button onClick={() => batchToggle(false)} className="rounded-lg bg-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600">Disable</button>
              <button onClick={() => batchDelete()} className="rounded-lg bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700">Delete</button>
              <button onClick={clearSelection} className="rounded-lg px-3 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">Cancel</button>
            </div>
          )}
        </div>
        <ExtensionFilters />
        {loading ? (
          <div className="text-zinc-500">Scanning...</div>
        ) : (
          <ExtensionTable data={data} />
        )}
      </div>
      {selectedId && <ExtensionDetail />}
      {showInstall && <InstallDialog onClose={() => setShowInstall(false)} />}
    </div>
  );
}
