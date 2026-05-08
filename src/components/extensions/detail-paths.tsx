import { useEffect, useMemo, useState } from "react";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import type {
  ExtensionContent as ExtContent,
  GroupedExtension,
} from "@/lib/types";

interface DetailPathsProps {
  group: GroupedExtension;
  instanceData: Map<string, ExtContent>;
  skillLocations: [string, string, string | null][];
}

type PathRow = {
  key: string;
  agentName: string;
  tag: string;
  path: string;
};

export function DetailPaths({
  group,
  instanceData,
  skillLocations,
}: DetailPathsProps) {
  if (group.kind === "cli" || group.instances.length === 0) return null;

  const instanceDirs = new Set(
    group.instances
      .map((inst) => inst.source_path)
      .filter((p): p is string => !!p)
      .map((p) => p.replace(/\/SKILL\.md(\.disabled)?$/, "")),
  );
  const filteredLocations =
    instanceDirs.size > 0
      ? skillLocations.filter(([, dir]) => instanceDirs.has(dir))
      : skillLocations;

  const rows = useMemo(() => {
    const nextRows: PathRow[] = [];
    const seen = new Set<string>();

    for (const inst of group.instances) {
      const tag =
        inst.scope.type === "global"
          ? "Agent path"
          : `Project path · ${inst.scope.name}`;
      const bucketDirs = inst.source_path
        ? new Set([inst.source_path.replace(/\/SKILL\.md(\.disabled)?$/, "")])
        : new Set<string>();
      const instanceFallbackPath = instanceData.get(inst.id)?.path ?? null;
      const agentNames = inst.agents.length > 0 ? inst.agents : ["unknown"];

      for (const agentName of agentNames) {
        const matchingLocations = filteredLocations.filter(
          ([agent, path]) =>
            agent === agentName &&
            (bucketDirs.size === 0 ||
              bucketDirs.has(path.replace(/\/SKILL\.md(\.disabled)?$/, ""))),
        );
        const paths =
          matchingLocations.length > 0
            ? matchingLocations.map(([, path]) => path)
            : instanceFallbackPath
              ? [instanceFallbackPath]
              : [];

        for (const path of paths) {
          const key = `${agentName}:${tag}:${path}`;
          if (seen.has(key)) continue;
          seen.add(key);
          nextRows.push({ key, agentName, tag, path });
        }
      }
    }

    return nextRows;
  }, [filteredLocations, group.instances, instanceData]);

  const agentGroups = useMemo(() => {
    const groupedRows = new Map<string, PathRow[]>();
    for (const row of rows) {
      const list = groupedRows.get(row.agentName) ?? [];
      list.push(row);
      groupedRows.set(row.agentName, list);
    }
    return [...groupedRows.entries()].map(([agentName, agentRows]) => ({
      agentName,
      rows: agentRows,
    }));
  }, [rows]);
  const [activeAgent, setActiveAgent] = useState(agentGroups[0]?.agentName ?? "");

  useEffect(() => {
    setActiveAgent((current) =>
      agentGroups.some((entry) => entry.agentName === current)
        ? current
        : (agentGroups[0]?.agentName ?? ""),
    );
  }, [agentGroups]);

  const visibleRows =
    agentGroups.find((entry) => entry.agentName === activeAgent)?.rows ?? [];

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Paths
      </h4>
      {agentGroups.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {agentGroups.map((entry) => {
            const active = entry.agentName === activeAgent;
            return (
              <button
                key={entry.agentName}
                type="button"
                onClick={() => setActiveAgent(entry.agentName)}
                title={entry.agentName}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                  active
                    ? "border-primary/35 bg-primary/12 shadow-sm"
                    : "border-border bg-muted/30 hover:border-border/70 hover:bg-muted/50"
                }`}
              >
                <div className={active ? "" : "grayscale opacity-60"}>
                  <AgentMascot name={entry.agentName} size={18} />
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className={`space-y-2 ${!group.enabled ? "opacity-50" : ""}`}>
        {visibleRows.map((row) => (
          <div
            key={row.key}
            className="flex items-start gap-2 text-xs leading-5"
          >
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {row.tag}
            </span>
            <span className="min-w-0 break-all text-muted-foreground">
              {row.path}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
