import type { ExtensionKind } from "@/lib/types";
import { useExtensionStore } from "@/stores/extension-store";
import { clsx } from "clsx";

const kinds: (ExtensionKind | null)[] = [null, "skill", "mcp", "plugin", "hook"];

export function ExtensionFilters() {
  const { kindFilter, setKindFilter } = useExtensionStore();

  return (
    <div className="flex gap-2">
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
  );
}
