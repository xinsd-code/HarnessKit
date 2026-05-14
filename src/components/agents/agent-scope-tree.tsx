import { clsx } from "clsx";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/types";
import { pathSegments, pathsEqual } from "@/lib/types";
import type { ScopeValue } from "@/stores/scope-store";

interface ProjectGroup {
  key: string;
  label: string;
  projects: Project[];
}

function groupProjects(projects: Project[]): ProjectGroup[] {
  const grouped = new Map<string, Project[]>();

  for (const project of projects) {
    const segments = pathSegments(project.path);
    const label =
      segments.length >= 2 ? segments[segments.length - 2] : "Projects";
    const current = grouped.get(label) ?? [];
    current.push(project);
    grouped.set(label, current);
  }

  return [...grouped.entries()]
    .map(([label, groupProjects]) => ({
      key: label,
      label,
      projects: [...groupProjects].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isProjectScopeActive(scope: ScopeValue, path: string): boolean {
  return scope.type === "project" && pathsEqual(scope.path, path);
}

export function AgentScopeTree({
  projects,
  scope,
  onSelectScope,
  showAgentsSection = true,
}: {
  projects: Project[];
  scope: ScopeValue;
  onSelectScope: (scope: ScopeValue) => void;
  showAgentsSection?: boolean;
}) {
  const groups = useMemo(() => groupProjects(projects), [projects]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(groups.map((group) => group.key)),
  );

  useEffect(() => {
    setExpandedGroups(new Set(groups.map((group) => group.key)));
  }, [groups]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-5 p-3">
      {showAgentsSection && (
        <section>
          <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Agents
          </div>
          <button
            onClick={() => onSelectScope({ type: "global" })}
            className={clsx(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              scope.type === "global"
                ? "bg-accent text-accent-foreground"
                : "text-foreground/75 hover:bg-accent/50",
            )}
          >
            <Bot size={15} />
            <span>All Agents</span>
          </button>
        </section>
      )}

      <section>
        <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Projects
        </div>
        <div className="space-y-1">
          <button
            onClick={() => onSelectScope({ type: "all" })}
            className={clsx(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
              scope.type === "all"
                ? "bg-accent text-accent-foreground"
                : "text-foreground/75 hover:bg-accent/50",
            )}
          >
            <FolderOpen size={15} />
            <span>All Projects</span>
          </button>

          {groups.length === 0 ? (
            <div className="px-2.5 py-1 text-xs text-muted-foreground">
              No projects added yet.
            </div>
          ) : (
            groups.map((group) => {
              const expanded = expandedGroups.has(group.key);
              return (
                <div key={group.key} className="space-y-1">
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground/75 transition-colors hover:bg-accent/50"
                  >
                    {expanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    <Folder size={15} />
                    <span className="truncate">{group.label}</span>
                  </button>

                  {expanded && (
                    <div className="ml-4 border-l border-border/60 pl-3">
                      {group.projects.map((project) => (
                        <button
                          key={project.id}
                          onClick={() =>
                            onSelectScope({
                              type: "project",
                              name: project.name,
                              path: project.path,
                            })
                          }
                          className={clsx(
                            "mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                            isProjectScopeActive(scope, project.path)
                              ? "bg-accent text-accent-foreground"
                              : "text-foreground/75 hover:bg-accent/50",
                          )}
                          title={project.path}
                        >
                          <Folder size={15} />
                          <span className="truncate">{project.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
