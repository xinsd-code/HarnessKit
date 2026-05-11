import {
  FileSearch,
  FolderPlus,
  FolderSearch,
  Package,
  Settings2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useScope } from "@/hooks/use-scope";
import { openDirectoryPicker, openFilePicker } from "@/lib/dialog";
import { isDesktop } from "@/lib/transport";
import {
  type AgentDetail as AgentDetailType,
  agentDisplayName,
  type ConfigCategory,
  type ConfigScope,
  type ExtensionCounts,
  type ExtensionKind,
  scopeLabel,
} from "@/lib/types";
import { useAgentConfigStore } from "@/stores/agent-config-store";
import { isCliChildSkillGroup } from "@/stores/extension-helpers";
import { useExtensionStore } from "@/stores/extension-store";
import { AgentExtensionsPanel } from "./agent-extensions-panel";
import { ConfigSection } from "./config-section";

const CATEGORY_ORDER: ConfigCategory[] = [
  "settings",
  "workflow",
  "rules",
  "memory",
  "ignore",
];

const EXTENSION_KIND_ORDER: ExtensionKind[] = [
  "skill",
  "mcp",
  "plugin",
  "hook",
  "cli",
];

const EXTENSION_KIND_LABELS: Record<ExtensionKind, string> = {
  skill: "Skills",
  mcp: "MCP",
  plugin: "Plugins",
  hook: "Hooks",
  cli: "CLIs",
};

type AgentTab = "config" | ExtensionKind;

function dedupeConfigFiles(files: AgentDetailType["config_files"]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (seen.has(file.path)) return false;
    seen.add(file.path);
    return true;
  });
}

function shouldDisplayConfigFile(file: AgentDetailType["config_files"][number]) {
  return file.exists && !file.is_dir;
}

export function AgentDetail() {
  const agentDetails = useAgentConfigStore((s) => s.agentDetails);
  const selectedAgent = useAgentConfigStore((s) => s.selectedAgent);
  const { scope } = useScope();
  const agent = agentDetails.find((a) => a.name === selectedAgent);

  if (!agent) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {scope.type === "project"
          ? "This project has no detected agent configs yet."
          : scope.type === "all"
            ? "No project-scoped agent configs found."
            : "Select an agent to view its configuration"}
      </div>
    );
  }

  return <AgentDetailContent key={agent.name} agent={agent} scope={scope} />;
}

function AgentDetailContent({
  agent,
  scope,
}: {
  agent: AgentDetailType;
  scope: ConfigScope | { type: "all" };
}) {
  const addCustomPath = useAgentConfigStore((s) => s.addCustomPath);
  const groupedExtensions = useExtensionStore((s) => s.grouped);
  const [showAddForm, setShowAddForm] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [activeTab, setActiveTab] = useState<AgentTab>("config");

  const matchesScope = (s: ConfigScope) => {
    if (scope.type === "all") return true;
    if (scope.type === "global") return s.type === "global";
    // scope.type === "project"
    return s.type === "project" && s.path === scope.path;
  };

  const scopedCounts = useMemo<ExtensionCounts>(() => {
    const c: ExtensionCounts = { skill: 0, mcp: 0, plugin: 0, hook: 0, cli: 0 };
    if (!agent) return c;
    const groups = groupedExtensions();
    for (const group of groups) {
      if (group.kind === "skill" && isCliChildSkillGroup(group, groups)) {
        continue;
      }
      const matches = group.instances.some((instance) => {
        if (instance.kind !== group.kind) return false;
        if (!instance.agents.includes(agent.name)) return false;
        if (scope.type === "all") return true;
        if (scope.type === "global") return instance.scope.type === "global";
        return (
          (instance.scope.type === "project" &&
            instance.scope.path === scope.path) ||
          instance.scope.type === "global"
        );
      });
      if (matches) {
        c[group.kind] = (c[group.kind] ?? 0) + 1;
      }
    }
    return c;
  }, [agent, groupedExtensions, scope]);

  const customFiles = dedupeConfigFiles(
    agent.config_files.filter(
      (f) =>
        f.custom_id != null &&
        matchesScope(f.scope) &&
        shouldDisplayConfigFile(f),
    ),
  );
  const nonCustomFiles = dedupeConfigFiles(
    agent.config_files.filter(
      (f) =>
        f.custom_id == null &&
        matchesScope(f.scope) &&
        shouldDisplayConfigFile(f),
    ),
  );
  const visibleConfigFiles = nonCustomFiles;
  const byCategory = new Map<ConfigCategory, typeof agent.config_files>();
  for (const cat of CATEGORY_ORDER) byCategory.set(cat, []);
  for (const file of visibleConfigFiles) {
    const list = byCategory.get(file.category);
    if (list) list.push(file);
  }

  // Scope-aware empty state: when scoped to a specific project and the agent
  // has no config files in that scope, render a focused empty card instead of
  // a stack of empty section headers.
  const totalVisible = visibleConfigFiles.length + customFiles.length;
  const isProjectScopeEmpty = scope.type === "project" && totalVisible === 0;

  const totalConfigFiles = visibleConfigFiles.length + customFiles.length;
  const tabs: {
    id: AgentTab;
    label: string;
    count: number;
    icon: typeof Package;
  }[] = [
    {
      id: "config",
      label: "Agent Config",
      count: totalConfigFiles,
      icon: Settings2,
    },
    ...EXTENSION_KIND_ORDER.map((kind) => ({
      id: kind,
      label: EXTENSION_KIND_LABELS[kind],
      count: scopedCounts[kind],
      icon: Package,
    })),
  ];

  return (
    <div className="flex-1 overflow-y-auto overscroll-contain p-5">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {agentDisplayName(agent.name)}
          </h2>
          {!agent.detected && (
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Not detected
            </p>
          )}
        </div>
        <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {scope.type === "all" ? "All Scopes" : scopeLabel(scope)}
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {activeTab === "config" ? (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                Agent Config
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Settings, workflows, rules, memory, ignore files, and custom
                config paths for {agentDisplayName(agent.name)}.
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50"
            >
              <FolderPlus size={11} />
              Add Custom Path
            </button>
          </div>

          {showAddForm && (
            <div className="mb-5 rounded-lg border border-border p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-foreground">
                  Add Custom Path
                </span>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setCustomPath("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Paste a file or folder path..."
                  value={customPath}
                  onChange={(e) => setCustomPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customPath.trim()) {
                      const target: ConfigScope =
                        scope.type === "all" ? { type: "global" } : scope;
                      addCustomPath(
                        agent.name,
                        customPath.trim(),
                        "",
                        "settings",
                        target,
                      );
                      setShowAddForm(false);
                      setCustomPath("");
                    }
                  }}
                  className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                {isDesktop() && (
                  <button
                    onClick={async () => {
                      const selected = await openFilePicker({
                        title: "Select file",
                      });
                      if (selected) setCustomPath(selected);
                    }}
                    className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Browse file..."
                  >
                    <FileSearch size={14} />
                  </button>
                )}
                {isDesktop() && (
                  <button
                    onClick={async () => {
                      const selected = await openDirectoryPicker({
                        title: "Select folder",
                      });
                      if (selected) setCustomPath(selected);
                    }}
                    className="shrink-0 rounded-md border border-border bg-card px-2.5 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    title="Browse folder..."
                  >
                    <FolderSearch size={14} />
                  </button>
                )}
                <button
                  disabled={!customPath.trim()}
                  onClick={async () => {
                    const target: ConfigScope =
                      scope.type === "all" ? { type: "global" } : scope;
                    await addCustomPath(
                      agent.name,
                      customPath.trim(),
                      "",
                      "settings",
                      target,
                    );
                    setShowAddForm(false);
                    setCustomPath("");
                  }}
                  className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {isProjectScopeEmpty ? (
            <div className="m-4 rounded-xl border border-dashed p-6 text-center">
              <p className="text-sm font-medium">
                {agentDisplayName(agent.name)} has no configuration in{" "}
                {scopeLabel(scope as ConfigScope)}
              </p>
            </div>
          ) : (
            <>
              {CATEGORY_ORDER.map((cat) => {
                const files = byCategory.get(cat) ?? [];
                if (scope.type !== "all" && files.length === 0) return null;
                return (
                  <ConfigSection
                    key={cat}
                    category={cat}
                    files={files}
                    agentName={agent.name}
                  />
                );
              })}
              {customFiles.length > 0 && (
                <ConfigSection
                  key="custom"
                  category={"custom" as ConfigCategory}
                  files={customFiles}
                  agentName={agent.name}
                />
              )}
            </>
          )}
        </>
      ) : (
        <AgentExtensionsPanel
          agentName={agent.name}
          kind={activeTab}
          scope={scope}
        />
      )}
    </div>
  );
}
