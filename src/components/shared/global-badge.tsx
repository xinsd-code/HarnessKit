import type { Extension } from "@/lib/types";

export function GlobalBadge() {
  return (
    <span
      title="Installed globally — available to this agent across all projects"
      className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-orange-500/10 text-orange-600 dark:text-orange-400 ring-1 ring-inset ring-orange-500/25 shrink-0 inline-flex items-center"
    >
      Global
    </span>
  );
}

/** True when any instance in the group is globally scoped. */
export function hasGlobalInstance(instances: Extension[]): boolean {
  return instances.some((i) => i.scope.type === "global");
}
