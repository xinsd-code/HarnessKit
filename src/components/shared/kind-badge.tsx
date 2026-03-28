import { clsx } from "clsx";
import type { ExtensionKind } from "@/lib/types";

const kindStyles: Record<ExtensionKind, string> = {
  skill: "bg-primary/15 text-primary ring-primary/25",
  mcp: "bg-chart-2/15 text-chart-2 ring-chart-2/25",
  plugin: "bg-chart-3/15 text-chart-3 ring-chart-3/25",
  hook: "bg-chart-4/15 text-chart-4 ring-chart-4/25",
};

const kindLabel: Record<ExtensionKind, string> = {
  skill: "skill",
  mcp: "MCP",
  plugin: "plugin",
  hook: "hook",
};

const kindTitle: Record<ExtensionKind, string> = {
  skill: "Reusable prompt instructions for AI agents",
  mcp: "Model Context Protocol server — extends agent capabilities",
  plugin: "Agent-specific plugin extension",
  hook: "Shell command triggered by agent events",
};

export function KindBadge({ kind }: { kind: ExtensionKind }) {
  return (
    <span title={kindTitle[kind]} className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors duration-150", kindStyles[kind])}>
      {kindLabel[kind]}
    </span>
  );
}
