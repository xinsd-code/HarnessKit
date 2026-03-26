import type { ExtensionKind } from "@/lib/types";
import { useExtensionStore } from "@/stores/extension-store";
import { Search } from "lucide-react";
import { clsx } from "clsx";

const kinds: (ExtensionKind | null)[] = [null, "skill", "mcp", "plugin", "hook"];

export function ExtensionFilters() {
  const { kindFilter, setKindFilter, searchQuery, setSearchQuery } = useExtensionStore();

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-1 max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search extensions..."
          className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-9 pr-3 text-sm placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:placeholder-zinc-500 dark:focus:border-zinc-500"
        />
      </div>
      <div className="flex gap-1.5">
        {kinds.map((kind) => (
          <button
            key={kind ?? "all"}
            onClick={() => setKindFilter(kind)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              kindFilter === kind
                ? "bg-zinc-300 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            )}
          >
            {kind ?? "All"}
          </button>
        ))}
      </div>
    </div>
  );
}
