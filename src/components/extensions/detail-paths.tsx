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

  const rows: PathRow[] = [];
  const seen = new Set<string>();

  for (const inst of group.instances) {
    const tag =
      inst.scope.type === "global"
        ? "Agent path"
        : `Project path · ${inst.scope.name}`;
    const bucketDirs = inst.source_path
      ? new Set([inst.source_path.replace(/\/SKILL\.md(\.disabled)?$/, "")])
      : new Set<string>();
    const agentName = inst.agents[0] ?? "unknown";
    const matchingLocations = filteredLocations.filter(
      ([agent, path]) =>
        agent === agentName &&
        (bucketDirs.size === 0 ||
          bucketDirs.has(path.replace(/\/SKILL\.md(\.disabled)?$/, ""))),
    );
    const paths =
      matchingLocations.length > 0
        ? matchingLocations.map(([, path]) => path)
        : instanceData.get(inst.id)?.path
          ? [instanceData.get(inst.id)!.path!]
          : [];

    for (const path of paths) {
      const key = `${tag}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ key, tag, path });
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-4">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Paths
      </h4>
      <div className={`space-y-2 ${!group.enabled ? "opacity-50" : ""}`}>
        {rows.map((row) => (
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
