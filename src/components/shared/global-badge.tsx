import type { Extension } from "@/lib/types";

export function GlobalBadge() {
  return (
    <span
      title="Installed globally — available to this agent across all projects"
      className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-tag-global/10 text-tag-global ring-1 ring-inset ring-tag-global/25 shrink-0 inline-flex items-center"
    >
      Global
    </span>
  );
}

/** True when any instance in the group is globally scoped. */
export function hasGlobalInstance(instances: Extension[]): boolean {
  return instances.some((i) => i.scope.type === "global");
}
