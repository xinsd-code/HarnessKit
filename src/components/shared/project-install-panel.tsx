import { clsx } from "clsx";
import { ChevronDown, Folder } from "lucide-react";
import type { Project } from "@/lib/types";
import {
  AgentInstallIconRow,
  type AgentInstallIconItem,
} from "./agent-install-icon-row";

interface ProjectInstallPanelProps {
  projects: Project[];
  selectedProjectPath: string;
  onProjectChange: (path: string) => void;
  agentItems: AgentInstallIconItem[];
  className?: string;
  title?: string;
  selectedProjectName?: string | null;
  placeholder?: string;
  selectAriaLabel?: string;
  emptyProjectText?: string;
  emptyAgentsText?: string;
}

export function ProjectInstallPanel({
  projects,
  selectedProjectPath,
  onProjectChange,
  agentItems,
  className,
  title = "Install to Project",
  selectedProjectName,
  placeholder = "Select an existing project",
  selectAriaLabel = "Select target project",
  emptyProjectText = "Select a project first",
  emptyAgentsText = "No project-capable agents detected",
}: ProjectInstallPanelProps) {
  const availableProjects = projects.filter((project) => project.exists);
  const selectedProjectExists = availableProjects.some(
    (project) => project.path === selectedProjectPath,
  );
  const visibleSelectedProjectPath = selectedProjectExists
    ? selectedProjectPath
    : "";

  if (availableProjects.length === 0) {
    return emptyProjectText ? (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        {emptyProjectText}
      </div>
    ) : null;
  }

  return (
    <div className={clsx("space-y-2", className)}>
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-medium uppercase text-muted-foreground">
          {title}
        </h4>
        {selectedProjectName && (
          <span className="text-[10px] text-muted-foreground/60">
            · {selectedProjectName}
          </span>
        )}
      </div>
      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Target Project
          </span>
          <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
            {availableProjects.length} saved
          </span>
        </div>
        <label className="group relative block">
          <Folder
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground"
          />
          <select
            value={visibleSelectedProjectPath}
            onChange={(e) => onProjectChange(e.target.value)}
            aria-label={selectAriaLabel}
            className="min-w-0 w-full appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground shadow-sm transition-colors focus:border-ring focus:bg-background focus:outline-none"
          >
            <option value="">{placeholder}</option>
            {availableProjects.map((project) => (
              <option key={project.path} value={project.path}>
                {project.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
        </label>
        <div className="mt-3 border-t border-border/60 pt-3">
          {!visibleSelectedProjectPath ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              {emptyProjectText}
            </div>
          ) : (
            <AgentInstallIconRow
              items={agentItems}
              emptyText={emptyAgentsText}
            />
          )}
        </div>
      </div>
    </div>
  );
}
