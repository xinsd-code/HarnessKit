import { clsx } from "clsx";
import { FolderOpen, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { AgentDetail } from "@/components/agents/agent-detail";
import { AgentList } from "@/components/agents/agent-list";
import { AgentScopeTree } from "@/components/agents/agent-scope-tree";
import { useScope } from "@/hooks/use-scope";
import type { AgentDetail as AgentDetailType, Project } from "@/lib/types";
import { pathSegments, pathsEqual } from "@/lib/types";
import { useAgentConfigStore } from "@/stores/agent-config-store";
import { useProjectStore } from "@/stores/project-store";
import {
  resolveDeepLinkScope,
  scopesEqual,
  useScopeStore,
} from "@/stores/scope-store";

function hasProjectConfig(
  agent: AgentDetailType,
  projectPath?: string,
): boolean {
  return agent.config_files.some(
    (file) =>
      file.exists &&
      file.scope.type === "project" &&
      (projectPath == null || pathsEqual(file.scope.path, projectPath)),
  );
}

function groupProjects(projects: Project[]) {
  const groups = new Map<string, Project[]>();
  for (const project of projects) {
    const segments = pathSegments(project.path);
    const label =
      segments.length >= 2 ? segments[segments.length - 2] : "Projects";
    const current = groups.get(label) ?? [];
    current.push(project);
    groups.set(label, current);
  }
  return [...groups.entries()]
    .map(([label, items]) => ({
      label,
      projects: [...items].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export default function ProjectsPage() {
  const hydrated = useScopeStore((s) => s.hydrated);
  const fetch = useAgentConfigStore((s) => s.fetch);
  const loading = useAgentConfigStore((s) => s.loading);
  const agentDetails = useAgentConfigStore((s) => s.agentDetails);
  const selectedAgent = useAgentConfigStore((s) => s.selectedAgent);
  const selectAgent = useAgentConfigStore((s) => s.selectAgent);
  const expandFile = useAgentConfigStore((s) => s.expandFile);
  const setPendingFocusFile = useAgentConfigStore((s) => s.setPendingFocusFile);
  const { scope, setScope } = useScope();
  const projects = useProjectStore((s) => s.projects);
  const groupedProjects = useMemo(() => groupProjects(projects), [projects]);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!hydrated) return;
    fetch();
  }, [fetch, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (scope.type === "global") {
      setScope(projects.length > 0 ? { type: "all" } : { type: "global" });
    }
  }, [hydrated, projects.length, scope.type, setScope]);

  const prevScopeRef = useRef(scope);
  useEffect(() => {
    if (prevScopeRef.current !== scope) {
      useAgentConfigStore.setState({
        expandedFiles: new Set(),
        pendingFocusFile: null,
      });
      prevScopeRef.current = scope;
    }
  }, [scope]);

  useEffect(() => {
    return () => {
      useAgentConfigStore.setState({
        expandedFiles: new Set(),
        pendingFocusFile: null,
      });
    };
  }, []);

  useEffect(() => {
    const agent = searchParams.get("agent");
    if (loading || !agent) return;
    const file = searchParams.get("file");
    const targetScope = resolveDeepLinkScope(
      searchParams.get("scope"),
      projects,
    );
    if (!scopesEqual(targetScope, scope)) {
      setScope(targetScope);
      prevScopeRef.current = targetScope;
    }
    selectAgent(agent);
    if (file) {
      expandFile(file);
      setPendingFocusFile(file);
    }
    setSearchParams({}, { replace: true });
  }, [
    loading,
    searchParams,
    scope,
    setScope,
    projects,
    selectAgent,
    expandFile,
    setPendingFocusFile,
    setSearchParams,
  ]);

  const visibleAgents = agentDetails.filter((agent) => {
    if (scope.type === "all") return hasProjectConfig(agent);
    if (scope.type === "project") return hasProjectConfig(agent, scope.path);
    return false;
  });

  useEffect(() => {
    if (scope.type !== "project" || loading) return;
    if (visibleAgents.length === 0) {
      if (selectedAgent !== null) selectAgent(null);
      return;
    }
    if (
      !selectedAgent ||
      !visibleAgents.some((agent) => agent.name === selectedAgent)
    ) {
      selectAgent(visibleAgents[0].name);
    }
  }, [loading, scope.type, selectedAgent, selectAgent, visibleAgents]);

  if (!hydrated) {
    return <div className="p-4 text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex h-full">
      <div className="w-[240px] shrink-0 overflow-y-auto overscroll-contain border-r border-border">
        <AgentScopeTree
          projects={projects}
          scope={scope}
          onSelectScope={setScope}
          showAgentsSection={false}
        />
      </div>
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
          Loading...
        </div>
      ) : scope.type === "all" ? (
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight">All Projects</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This view lists every registered project. Click any project to
              inspect the agents and configs detected inside it.
            </p>
          </div>
          {projects.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">
              No projects added yet.
            </div>
          ) : (
            <div className="space-y-5">
              {groupedProjects.map((group) => (
                <section key={group.label}>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="space-y-2">
                    {group.projects.map((project) => (
                      <button
                        key={project.id}
                        onClick={() =>
                          setScope({
                            type: "project",
                            name: project.name,
                            path: project.path,
                          })
                        }
                        className="flex w-full items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/30"
                      >
                        <FolderOpen
                          size={16}
                          className={clsx(
                            "shrink-0",
                            project.exists
                              ? "text-muted-foreground"
                              : "text-muted-foreground/50",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                "text-sm font-medium",
                                project.exists
                                  ? "text-foreground"
                                  : "text-muted-foreground line-through",
                              )}
                            >
                              {project.name}
                            </span>
                            {!project.exists && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                <TriangleAlert size={10} />
                                Missing
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {project.path}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="w-[190px] shrink-0 overflow-y-auto overscroll-contain border-r border-border">
            <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {scope.type === "project" ? scope.name : "Projects"}
            </div>
            <AgentList
              agents={visibleAgents}
              selectedAgent={selectedAgent}
              onSelectAgent={selectAgent}
              emptyMessage="This project has no detected agent configs yet."
            />
          </div>
          <AgentDetail />
        </>
      )}
    </div>
  );
}
