import { ChevronDown, Folder, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import { PermissionDetail } from "@/components/extensions/permission-detail";
import { SkillFileSection } from "@/components/extensions/skill-file-section";
import { canInstallAtScope } from "@/lib/agent-capabilities";
import { api } from "@/lib/invoke";
import type { ConfigScope, Extension, ExtensionKind } from "@/lib/types";
import { agentDisplayName, sortAgents } from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { useExtensionStore } from "@/stores/extension-store";
import { useHubStore } from "@/stores/hub-store";
import { useProjectStore } from "@/stores/project-store";
import { toast } from "@/stores/toast-store";

const AGENT_ICON_TONES: Record<string, string> = {
  claude: "border-agent-claude/25 bg-agent-claude/10",
  codex: "border-agent-codex/20 bg-agent-codex/10",
  gemini: "border-agent-gemini/20 bg-agent-gemini/12",
  cursor: "border-agent-cursor/20 bg-agent-cursor/10",
  antigravity: "border-agent-antigravity/20 bg-agent-antigravity/10",
  copilot: "border-agent-copilot/20 bg-agent-copilot/10",
  windsurf: "border-agent-windsurf/20 bg-agent-windsurf/10",
};

function scopeMatches(
  extScope: ConfigScope,
  targetScope: ConfigScope,
): boolean {
  if (targetScope.type === "global") {
    return extScope.type === "global";
  }
  return extScope.type === "project" && extScope.path === targetScope.path;
}

export function HubDetail() {
  const extensions = useHubStore((s) => s.extensions);
  const selectedId = useHubStore((s) => s.selectedId);
  const setSelectedId = useHubStore((s) => s.setSelectedId);
  const deleteFromHub = useHubStore((s) => s.deleteFromHub);
  const installFromHub = useHubStore((s) => s.installFromHub);
  const extensionContent = useHubStore((s) => s.extensionContent);
  const loadExtensionContent = useHubStore((s) => s.loadExtensionContent);

  const agents = useAgentStore((s) => s.agents);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const fetchAgents = useAgentStore((s) => s.fetch);
  const installedExtensions = useExtensionStore((s) => s.extensions);
  const rescanAndFetch = useExtensionStore((s) => s.rescanAndFetch);
  const projects = useProjectStore((s) => s.projects);
  const projectsLoaded = useProjectStore((s) => s.loaded);
  const loadProjects = useProjectStore((s) => s.loadProjects);

  const [deploying, setDeploying] = useState<string | null>(null);
  const [projectDeploying, setProjectDeploying] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [conflict, setConflict] = useState<Extension | null>(null);
  const [conflictTarget, setConflictTarget] = useState<{
    agent: string;
    scope: ConfigScope;
  } | null>(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState("");

  const ext = extensions.find((e) => e.id === selectedId);
  const content = selectedId ? extensionContent.get(selectedId) : null;

  // Load content when extension is selected
  useEffect(() => {
    if (selectedId && !content) {
      loadExtensionContent(selectedId);
    }
  }, [selectedId, content, loadExtensionContent]);

  useEffect(() => {
    if (agents.length === 0) {
      void fetchAgents();
    }
  }, [agents.length, fetchAgents]);

  useEffect(() => {
    if (!projectsLoaded) {
      void loadProjects();
    }
  }, [projectsLoaded, loadProjects]);

  if (!ext) return null;

  const projectScope: ConfigScope | null = selectedProjectPath
    ? (() => {
        const project = projects.find((item) => item.path === selectedProjectPath);
        return project
          ? { type: "project", name: project.name, path: project.path }
          : null;
      })()
    : null;

  const detectedAgents = sortAgents(
    agents.filter((a) => a.detected),
    agentOrder,
  );
  const globalInstallAgents = ext.kind === "cli" ? [] : detectedAgents;
  const projectTargetKind: ExtensionKind | null = ext.kind === "skill" ? "skill" : null;
  const projectInstallAgents =
    projectScope && projectTargetKind
      ? detectedAgents.filter((agent) =>
          canInstallAtScope(agent.name, projectTargetKind, projectScope),
        )
      : [];

  const matchingInstances = (scope: ConfigScope, agentName: string) =>
    installedExtensions.filter(
      (instance) =>
        instance.kind === ext.kind &&
        instance.name === ext.name &&
        instance.agents.includes(agentName) &&
        scopeMatches(instance.scope, scope),
    );

  const globalInstalledAgents = new Set(
    globalInstallAgents
      .filter(
        (agent) => matchingInstances({ type: "global" }, agent.name).length > 0,
      )
      .map((agent) => agent.name),
  );
  const projectInstalledAgents = new Set(
    projectScope
      ? projectInstallAgents
          .filter((agent) => matchingInstances(projectScope, agent.name).length > 0)
          .map((agent) => agent.name)
      : [],
  );

  const handleInstall = async (agent: string, scope: ConfigScope) => {
    setDeploying(agent);
    try {
      const installed = matchingInstances(scope, agent);
      if (installed.length > 0) {
        await Promise.all(installed.map((instance) => api.deleteExtension(instance.id)));
        await rescanAndFetch();
        toast.success(
          scope.type === "project"
            ? `已从 ${scope.name} / ${agentDisplayName(agent)} 移除`
            : `已从 ${agentDisplayName(agent)} 移除`,
        );
        return;
      }

      // Check for conflict first
      const conflictExt = await api.checkHubInstallConflict(ext.id, agent);
      if (conflictExt) {
        setConflict(conflictExt);
        setConflictTarget({ agent, scope });
        setDeploying(null);
        return;
      }
      await installFromHub(ext.id, agent, scope, false);
    } catch (e) {
      console.error("Install failed:", e);
    } finally {
      setDeploying(null);
    }
  };

  const handleForceInstall = async (agent: string, scope: ConfigScope) => {
    setDeploying(agent);
    setConflict(null);
    setConflictTarget(null);
    try {
      await installFromHub(ext.id, agent, scope, true);
    } catch (e) {
      console.error("Force install failed:", e);
    } finally {
      setDeploying(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteFromHub(ext.id);
      setShowDelete(false);
    } catch (e) {
      console.error("Delete failed:", e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="font-medium text-foreground truncate">{ext.name}</h3>
        <button
          onClick={() => setSelectedId(null)}
          className="rounded p-1 hover:bg-accent"
        >
          <X size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Kind badge */}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {ext.kind}
          </span>
          {ext.pack && (
            <span className="text-xs text-muted-foreground">{ext.pack}</span>
          )}
        </div>

        {/* Description */}
        {ext.description && (
          <p className="text-sm text-muted-foreground">{ext.description}</p>
        )}

        {/* Install to Agent */}
        {globalInstallAgents.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Install to Agent
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {globalInstallAgents.map((agent) => {
                const isInstalled = globalInstalledAgents.has(agent.name);
                const isPending = deploying === agent.name;
                return (
                  <button
                    key={`hub-global:${agent.name}`}
                    type="button"
                    title={`${agentDisplayName(agent.name)}${
                      isInstalled ? " · 点击移除" : " · 安装到全局"
                    }`}
                    disabled={isPending}
                    onClick={() => void handleInstall(agent.name, { type: "global" })}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all ${
                      isInstalled
                        ? `${AGENT_ICON_TONES[agent.name] ?? "border-border bg-muted/40"} shadow-sm`
                        : "border-border bg-muted/30"
                    } hover:scale-[1.03] hover:border-border/60 ${
                      isPending ? "opacity-70" : ""
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center ${
                        isInstalled ? "" : "grayscale opacity-40"
                      }`}
                    >
                      {isPending ? (
                        <Loader2 size={14} className="animate-spin text-muted-foreground" />
                      ) : (
                        <AgentMascot name={agent.name} size={20} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {projectTargetKind && (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase">
                Install to Project
              </h4>
              {projectScope?.type === "project" && (
                <span className="text-[10px] text-muted-foreground/60">
                  · {projectScope.name}
                </span>
              )}
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  Target Project
                </span>
                <span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">
                  {projects.length} saved
                </span>
              </div>
              <label className="group relative block">
                <Folder
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within:text-foreground"
                />
                <select
                  value={selectedProjectPath}
                  onChange={(e) => setSelectedProjectPath(e.target.value)}
                  className="min-w-0 w-full appearance-none rounded-xl border border-border bg-card py-2 pl-9 pr-9 text-sm text-foreground shadow-sm transition-colors focus:border-ring focus:bg-background focus:outline-none"
                >
                  <option value="">Select an existing project</option>
                  {projects.map((project) => (
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
                {!projectScope ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    Select a project first
                  </div>
                ) : projectInstallAgents.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                    No project-capable agents detected
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {projectInstallAgents.map((agent) => {
                      const isInstalled = projectInstalledAgents.has(agent.name);
                      const isPending = projectDeploying === agent.name;
                      return (
                        <button
                          key={`hub-project:${agent.name}`}
                          type="button"
                          title={`${agentDisplayName(agent.name)}${
                            isInstalled ? " · 已安装到项目" : " · 安装到项目"
                          }`}
                          disabled={isPending}
                          onClick={async () => {
                            if (!projectScope) return;
                            setProjectDeploying(agent.name);
                            try {
                              await handleInstall(agent.name, projectScope);
                            } finally {
                              setProjectDeploying(null);
                            }
                          }}
                          className={`flex h-11 w-11 items-center justify-center rounded-full border transition-all ${
                            isInstalled
                              ? `${AGENT_ICON_TONES[agent.name] ?? "border-border bg-muted/40"} shadow-sm`
                              : "border-border bg-muted/30"
                          } hover:scale-[1.03] hover:border-border/60 ${
                            isPending ? "opacity-70" : ""
                          }`}
                        >
                          <div
                            className={`flex h-6 w-6 items-center justify-center ${
                              isInstalled ? "" : "grayscale opacity-40"
                            }`}
                          >
                            {isPending ? (
                              <Loader2
                                size={14}
                                className="animate-spin text-muted-foreground"
                              />
                            ) : (
                              <AgentMascot name={agent.name} size={20} />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Permissions */}
        {ext.permissions.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Permissions
            </h4>
            <div className="space-y-1">
              {ext.permissions.map((perm, idx) => (
                <PermissionDetail key={idx} perm={perm} />
              ))}
            </div>
          </div>
        )}

        {/* Skill Content */}
        {ext.kind === "skill" && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Files
            </h4>
            <SkillFileSection
              instanceId={ext.id}
              content={content?.content ?? null}
              dirPath={content?.path ?? null}
              loading={!content}
              kind={ext.kind}
            />
          </div>
        )}

        {/* Source Path */}
        {ext.source_path && (
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">
              Source Path
            </h4>
            <p className="text-xs text-muted-foreground font-mono truncate">
              {ext.source_path}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border p-4">
        <button
          onClick={() => setShowDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive hover:bg-destructive/20"
        >
          <Trash2 size={14} />
          Delete from Hub
        </button>
      </div>

      {/* Delete Confirmation */}
      {showDelete && (
        <div className="absolute inset-0 bg-card/95 flex items-center justify-center p-4">
          <div className="space-y-4 text-center">
            <p className="text-sm">
              Delete <strong>{ext.name}</strong> from Local Hub?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDelete(false)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin mx-auto" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Dialog */}
      {conflict && (
        <div className="absolute inset-0 bg-card/95 flex items-center justify-center p-4">
          <div className="space-y-4 text-center">
            <p className="text-sm">
              <strong>{ext.name}</strong> already exists in the target agent.
            </p>
            <p className="text-xs text-muted-foreground">
              How would you like to proceed?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConflict(null)}
                className="flex-1 rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  conflictTarget
                    ? handleForceInstall(conflictTarget.agent, conflictTarget.scope)
                    : setConflict(null)
                }
                disabled={deploying !== null}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
