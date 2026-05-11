import {
  Bot,
  FolderKanban,
  FolderOpen,
  Package,
  Puzzle,
  RefreshCw,
  Server,
  Shield,
  ShoppingBag,
  Terminal,
  TriangleAlert,
  Webhook,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AgentCard } from "@/components/shared/agent-card";
import type { DashboardStats } from "@/lib/types";
import { logicalAssetKey, sortAgents } from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { useAuditStore } from "@/stores/audit-store";
import {
  buildGroups,
  filterSkillTabGroups,
  useExtensionStore,
} from "@/stores/extension-store";
import { useHubStore } from "@/stores/hub-store";
import { useProjectStore } from "@/stores/project-store";
import { toast } from "@/stores/toast-store";

// ---------------------------------------------------------------------------
// Small composable pieces
// ---------------------------------------------------------------------------

function StatChip({
  label,
  count,
  icon: Icon,
}: {
  label: string;
  count: number;
  icon: React.ElementType;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon
        size={14}
        strokeWidth={1.75}
        className="text-muted-foreground/60"
        aria-hidden="true"
      />
      <span className="tabular-nums font-medium text-foreground">{count}</span>
      <span>{label}</span>
    </span>
  );
}

function QuickAction({
  icon: Icon,
  label,
  sublabel,
  onClick,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  sublabel: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 px-4 py-3 text-left transition-all duration-200 hover:border-border hover:bg-card hover:shadow-sm disabled:opacity-70 disabled:pointer-events-none"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
        <Icon
          size={17}
          strokeWidth={1.75}
          className={
            loading
              ? Icon === RefreshCw
                ? "animate-spin"
                : "animate-scanning"
              : ""
          }
        />
      </span>
      <div className="min-w-0">
        <span className="block text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block text-xs text-muted-foreground">{sublabel}</span>
      </div>
    </button>
  );
}

function OverviewMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function OverviewSkeleton() {
  return (
    <div className="space-y-10">
      {/* Header skeleton */}
      <div className="space-y-3">
        <div className="animate-shimmer h-10 w-48 rounded-lg bg-muted" />
        <div className="animate-shimmer h-5 w-80 rounded bg-muted" />
      </div>

      {/* Activity skeleton */}
      <div className="space-y-2">
        <div className="animate-shimmer h-4 w-32 rounded bg-muted" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-shimmer h-14 rounded-lg bg-muted" />
        ))}
      </div>

      {/* Actions skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-shimmer h-16 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  const navigate = useNavigate();
  const extensions = useExtensionStore((s) => s.extensions);
  const hubExtensions = useHubStore((s) => s.extensions);
  const hubHasFetched = useHubStore((s) => s.hasFetched);
  const fetchHubExtensions = useHubStore((s) => s.fetch);
  const extHasFetched = useExtensionStore((s) => s.hasFetched);
  const checkUpdates = useExtensionStore((s) => s.checkUpdates);
  const checkingUpdates = useExtensionStore((s) => s.checkingUpdates);
  const auditResults = useAuditStore((s) => s.results);
  const loadCached = useAuditStore((s) => s.loadCached);
  const runAudit = useAuditStore((s) => s.runAudit);
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetch);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const projects = useProjectStore((s) => s.projects);
  const projectsLoaded = useProjectStore((s) => s.loaded);
  const projectsLoading = useProjectStore((s) => s.loading);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const [auditLoading, setAuditLoading] = useState(false);
  // updatesLoading now comes from store as checkingUpdates
  const [localReady, setLocalReady] = useState(false);

  useEffect(() => {
    loadCached();
    Promise.all([fetchAgents(), fetchHubExtensions()])
      .catch((e) => {
        console.error("Failed to load overview data:", e);
      })
      .finally(() => setLocalReady(true));
  }, [loadCached, fetchAgents, fetchHubExtensions]);

  useEffect(() => {
    if (!projectsLoaded && !projectsLoading) loadProjects();
  }, [loadProjects, projectsLoaded, projectsLoading]);

  // Show skeleton until both extensions (fetched in App.tsx) and local data are ready.
  const initialLoaded = localReady && extHasFetched && hubHasFetched;

  // Filter extensions to only those belonging to enabled agents
  const enabledAgentNames = useMemo(
    () => new Set(agents.filter((a) => a.enabled).map((a) => a.name)),
    [agents],
  );
  const visibleExtensions = useMemo(
    () =>
      extensions.filter(
        (e) =>
          e.agents.length === 0 ||
          e.agents.some((a) => enabledAgentNames.has(a)),
      ),
    [extensions, enabledAgentNames],
  );

  // Group extensions so identical skills across agents count as one
  const visibleGroups = useMemo(
    () => buildGroups(visibleExtensions),
    [visibleExtensions],
  );

  // Dashboard stats — derived client-side from grouped extension data
  const stats = useMemo<DashboardStats | null>(() => {
    if (!initialLoaded) return null;

    const skill_count = filterSkillTabGroups(visibleGroups).filter(
      (g) => g.kind === "skill",
    ).length;
    const mcp_count = visibleGroups.filter((g) => g.kind === "mcp").length;
    const plugin_count = visibleGroups.filter(
      (g) => g.kind === "plugin",
    ).length;
    const hook_count = visibleGroups.filter((g) => g.kind === "hook").length;
    const cli_count = visibleGroups.filter((g) => g.kind === "cli").length;

    // Issue counts from audit
    let critical_issues = 0;
    let high_issues = 0;
    let medium_issues = 0;
    let low_issues = 0;
    for (const r of auditResults) {
      for (const f of r.findings) {
        switch (f.severity) {
          case "Critical":
            critical_issues++;
            break;
          case "High":
            high_issues++;
            break;
          case "Medium":
            medium_issues++;
            break;
          case "Low":
            low_issues++;
            break;
        }
      }
    }

    return {
      total_extensions: visibleGroups.length,
      skill_count,
      mcp_count,
      plugin_count,
      hook_count,
      cli_count,
      critical_issues,
      high_issues,
      medium_issues,
      low_issues,
      updates_available: 0,
    };
  }, [visibleGroups, auditResults, initialLoaded]);

  // Compute per-agent extension counts from grouped data
  const agentExtCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of visibleGroups) {
      for (const a of g.agents) {
        counts.set(a, (counts.get(a) ?? 0) + 1);
      }
    }
    return counts;
  }, [visibleGroups]);

  const enabledAgents = useMemo(
    () =>
      sortAgents(
        agents
          .filter((a) => a.enabled)
          .map((a) => ({
            ...a,
            extension_count: agentExtCounts.get(a.name) ?? 0,
          })),
        agentOrder,
      ),
    [agents, agentExtCounts, agentOrder],
  );

  const localHubOverview = useMemo(() => {
    const counts = { skill: 0, mcp: 0, plugin: 0 };
    const seen = new Set<string>();

    for (const ext of hubExtensions) {
      if (ext.kind !== "skill" && ext.kind !== "mcp" && ext.kind !== "plugin") {
        continue;
      }

      const key = logicalAssetKey(ext);
      if (seen.has(key)) continue;
      seen.add(key);
      counts[ext.kind]++;
    }

    return {
      assets: seen.size,
      skills: counts.skill,
      mcp: counts.mcp,
      plugins: counts.plugin,
    };
  }, [hubExtensions]);

  const projectOverview = useMemo(() => {
    const withExtensionsCount = projects.filter((project) => {
      const scopedExtensions = visibleExtensions.filter(
        (ext) =>
          ext.scope.type === "project" && ext.scope.path === project.path,
      );
      return buildGroups(scopedExtensions).length > 0;
    }).length;

    return {
      availableCount: projects.filter((project) => project.exists).length,
      missingCount: projects.filter((project) => !project.exists).length,
      withExtensionsCount,
    };
  }, [projects, visibleExtensions]);

  if (!stats) {
    return <OverviewSkeleton />;
  }

  const hasAuditData = auditResults.length > 0;

  return (
    <div className="space-y-6 pb-4" aria-live="polite">
      {/* ----------------------------------------------------------------- */}
      {/* Header — editorial greeting with inline stats                     */}
      {/* ----------------------------------------------------------------- */}
      <header className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-foreground select-none">
          Overview
        </h2>
        {stats.total_extensions > 0 ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {stats.skill_count > 0 && (
              <StatChip
                label="skills"
                count={stats.skill_count}
                icon={Package}
              />
            )}
            {stats.mcp_count > 0 && (
              <StatChip
                label="MCP servers"
                count={stats.mcp_count}
                icon={Server}
              />
            )}
            {stats.plugin_count > 0 && (
              <StatChip
                label="plugins"
                count={stats.plugin_count}
                icon={Puzzle}
              />
            )}
            {stats.hook_count > 0 && (
              <StatChip label="hooks" count={stats.hook_count} icon={Webhook} />
            )}
            {stats.cli_count > 0 && (
              <StatChip label="CLIs" count={stats.cli_count} icon={Terminal} />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Get started by browsing the marketplace or running a scan.
          </p>
        )}
        {/* Agent mascot cards */}
        {enabledAgents.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-3">
            {enabledAgents.map((agent) => (
              <AgentCard key={agent.name} agent={agent} />
            ))}
          </div>
        )}
      </header>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Local Hub Overview
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OverviewMetric
            label="Assets"
            value={localHubOverview.assets}
            icon={Package}
          />
          <OverviewMetric
            label="Skills"
            value={localHubOverview.skills}
            icon={Package}
          />
          <OverviewMetric
            label="MCP"
            value={localHubOverview.mcp}
            icon={Server}
          />
          <OverviewMetric
            label="Plugins"
            value={localHubOverview.plugins}
            icon={Puzzle}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Projects overview
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <OverviewMetric
            label="Projects"
            value={projects.length}
            icon={FolderKanban}
          />
          <OverviewMetric
            label="Available"
            value={projectOverview.availableCount}
            icon={FolderOpen}
          />
          <OverviewMetric
            label="With extensions"
            value={projectOverview.withExtensionsCount}
            icon={Package}
          />
          <OverviewMetric
            label="Missing"
            value={projectOverview.missingCount}
            icon={TriangleAlert}
          />
        </div>
      </section>

      {/* ----------------------------------------------------------------- */}
      {/* First-run welcome — when no extensions and no audit               */}
      {/* ----------------------------------------------------------------- */}
      {stats.total_extensions === 0 && !hasAuditData && (
        <section className="space-y-5">
          <h3 className="font-serif text-xl font-semibold tracking-tight text-foreground">
            One place for all your extensions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(
              [
                {
                  icon: Bot,
                  label: "View extensions",
                  description:
                    "Browse and manage extensions across your coding agents",
                  to: "/extensions",
                  delay: "0ms",
                },
                {
                  icon: ShoppingBag,
                  label: "Browse marketplace",
                  description:
                    "Discover and install skills, MCP servers, and plugins",
                  to: "/marketplace",
                  delay: "60ms",
                },
                {
                  icon: Shield,
                  label: "Run audit",
                  description: "Check your extensions for security issues",
                  to: "/audit",
                  delay: "120ms",
                },
              ] as const
            ).map((card) => (
              <button
                key={card.to}
                onClick={() => navigate(card.to)}
                className="animate-fade-in group flex flex-col items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-5 text-left transition-all duration-200 hover:shadow-md"
                style={{ animationDelay: card.delay }}
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
                  <card.icon size={20} strokeWidth={1.75} />
                </span>
                <div>
                  <span className="block text-sm font-medium text-foreground">
                    {card.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {card.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Empty state — when no extensions at all                           */}
      {/* ----------------------------------------------------------------- */}
      {stats.total_extensions === 0 && (
        <section className="animate-scale-in rounded-xl border border-dashed border-border bg-card/30 px-6 py-6 text-center">
          <Package
            size={24}
            className="mx-auto text-muted-foreground/40"
            aria-hidden="true"
          />
          <h3 className="mt-2 text-sm font-medium text-foreground">
            Your workspace is ready
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Browse the marketplace to discover skills, MCP servers, and
            agent-first CLIs.
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={() => navigate("/marketplace")}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
            >
              <ShoppingBag size={14} />
              Browse marketplace
            </button>
          </div>
        </section>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Quick actions                                                      */}
      {/* ----------------------------------------------------------------- */}
      {stats.total_extensions > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick actions
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickAction
              icon={Bot}
              label="View Agents"
              sublabel="Manage agent configs"
              onClick={() => navigate("/agents")}
            />
            <QuickAction
              icon={Shield}
              label="Run Audit"
              sublabel="Scan for security issues"
              loading={auditLoading}
              onClick={() => {
                setAuditLoading(true);
                runAudit().finally(() => setAuditLoading(false));
              }}
            />
            <QuickAction
              icon={RefreshCw}
              label="Check Updates"
              sublabel="Check for extension updates"
              loading={checkingUpdates}
              onClick={() => {
                checkUpdates().then(() => {
                  const state = useExtensionStore.getState();
                  const statuses = state.updateStatuses;
                  const count = state
                    .grouped()
                    .filter((g) =>
                      g.instances.some(
                        (inst) =>
                          statuses.get(inst.id)?.status === "update_available",
                      ),
                    ).length;
                  toast.success(
                    count > 0
                      ? `${count} update${count > 1 ? "s" : ""} available`
                      : "No updates available",
                  );
                });
              }}
            />
            <QuickAction
              icon={ShoppingBag}
              label="Marketplace"
              sublabel="Discover skills, CLI and MCP"
              onClick={() => navigate("/marketplace")}
            />
          </div>
        </section>
      )}
    </div>
  );
}
