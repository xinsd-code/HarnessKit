import { clsx } from "clsx";
import { Search, X } from "lucide-react";
import { useMemo } from "react";
import type { ExtensionKind } from "@/lib/types";
import { useHubStore } from "@/stores/hub-store";

const kinds: (ExtensionKind | null)[] = [
  null,
  "skill",
  "mcp",
  "plugin",
  "cli",
];
const kindLabel: Record<ExtensionKind, string> = {
  skill: "skill",
  mcp: "MCP",
  plugin: "plugin",
  hook: "hook",
  cli: "CLI",
};

export function HubFilters() {
  const kindFilter = useHubStore((s) => s.kindFilter);
  const setKindFilter = useHubStore((s) => s.setKindFilter);
  const searchQuery = useHubStore((s) => s.searchQuery);
  const setSearchQuery = useHubStore((s) => s.setSearchQuery);
  const extensions = useHubStore((s) => s.extensions);

  const resultCount = useMemo(() => {
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
    }).length;
  }, [extensions, kindFilter, searchQuery]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        {kinds.map((kind) => (
          <button
            key={kind ?? "all"}
            onClick={() => setKindFilter(kind)}
            aria-pressed={kindFilter === kind}
            className={clsx(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              kindFilter === kind
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {kind ? kindLabel[kind] : "All"}
          </button>
        ))}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {resultCount} result{resultCount !== 1 ? "s" : ""}
        </span>
        {(kindFilter || searchQuery) && (
          <button
            onClick={() => {
              setKindFilter(null);
              setSearchQuery("");
            }}
            className="shrink-0 rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Clear filters
          </button>
        )}
        <div className="flex-1" />
        <div className="relative shrink-0 w-44">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            title="Search by name or description"
            aria-label="Search extensions"
            className="w-full rounded-lg border border-border bg-card py-1.5 pl-8 pr-8 text-xs placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
