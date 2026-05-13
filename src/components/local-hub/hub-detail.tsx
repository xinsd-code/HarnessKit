import { Loader2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { PermissionDetail } from "@/components/extensions/permission-detail";
import { SkillFileSection } from "@/components/extensions/skill-file-section";
import {
  type AgentInstallIconItem,
  AgentInstallIconRow,
} from "@/components/shared/agent-install-icon-row";
import { ProjectInstallPanel } from "@/components/shared/project-install-panel";
import { canInstallAtScope } from "@/lib/agent-capabilities";
import {
  buildInstallState,
  resolveProjectSelection,
} from "@/lib/install-surface";
import { api } from "@/lib/invoke";
import type { ConfigScope, Extension, ExtensionKind } from "@/lib/types";
import {
  agentDisplayName,
  extensionListGroupKey,
  pathsEqual,
  sameLogicalAsset,
  sortAgents,
} from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { useExtensionStore } from "@/stores/extension-store";
import { useHubStore } from "@/stores/hub-store";
import { useProjectStore } from "@/stores/project-store";
import { toast } from "@/stores/toast-store";

function scopeMatches(
  extScope: ConfigScope,
  targetScope: ConfigScope,
): boolean {
  if (targetScope.type === "global") {
    return extScope.type === "global";
  }
  return (
    extScope.type === "project" && pathsEqual(extScope.path, targetScope.path)
  );
}

export function HubDetail() {
  const extensions = useHubStore((s) => s.extensions);
  const selectedId = useHubStore((s) => s.selectedId);
  const setSelectedId = useHubStore((s) => s.setSelectedId);
  const deleteFromHub = useHubStore((s) => s.deleteFromHub);
  const installFromHub = useHubStore((s) => s.installFromHub);
  const extensionContent = useHubStore((s) => s.extensionContent);
  const loadExtensionContent = useHubStore((s) => s.loadExtensionContent);
  const fetchHubExtensions = useHubStore((s) => s.fetch);

  const markInstalled = useHubStore((s) => s.markInstalled);
  const unmarkInstalled = useHubStore((s) => s.unmarkInstalled);
  const isHubInstalled = useHubStore((s) => s.isHubInstalled);

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

  // Reset conflict state when switching to a different extension.
  // biome-ignore lint/correctness/useExhaustiveDependencies: The reset is keyed by selectedId even though the value is not read inside the effect.
  useEffect(() => {
    setConflict(null);
    setConflictTarget(null);
  }, [selectedId]);

  const selectedHubExtensions = selectedId
    ? (() => {
        const exactMatch = extensions.find((e) => e.id === selectedId);
        if (exactMatch) return [exactMatch];
        return extensions.filter(
          (e) => extensionListGroupKey(e) === selectedId,
        );
      })()
    : [];
  const ext = selectedHubExtensions[0] ?? null;
  const availableProjects = projects.filter((project) => project.exists);
  const content = ext ? extensionContent.get(ext.id) : null;

  // Load content when extension is selected
  useEffect(() => {
    if (ext && !content) {
      loadExtensionContent(ext.id);
    }
  }, [ext, content, loadExtensionContent]);

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

  useEffect(() => {
    if (!ext) return;
    const selectedProject = resolveProjectSelection({
      contextScope: null,
      installedInstances: installedExtensions.filter((instance) =>
        sameLogicalAsset(ext, instance),
      ),
      projects: availableProjects,
    });
    if (
      selectedProjectPath &&
      availableProjects.some((project) =>
        pathsEqual(project.path, selectedProjectPath),
      )
    ) {
      return;
    }
    const nextProjectPath =
      selectedProject?.type === "project" ? selectedProject.path : null;
    if (nextProjectPath && nextProjectPath !== selectedProjectPath) {
      setSelectedProjectPath(nextProjectPath);
      return;
    }
    if (selectedProjectPath) {
      setSelectedProjectPath("");
    }
  }, [ext, installedExtensions, availableProjects, selectedProjectPath]);

  if (!ext) return null;

  const projectScope: ConfigScope | null = selectedProjectPath
    ? (() => {
        const project = availableProjects.find((item) =>
          pathsEqual(item.path, selectedProjectPath),
        );
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
  const projectTargetKind: ExtensionKind | null =
    ext.kind === "skill" || ext.kind === "mcp" ? ext.kind : null;
  const projectInstallAgents =
    projectScope && projectTargetKind
      ? detectedAgents.filter((agent) =>
          canInstallAtScope(agent.name, projectTargetKind, projectScope),
        )
      : [];
  const matchingInstancesForAsset = installedExtensions.filter((instance) =>
    sameLogicalAsset(ext, instance),
  );

  const matchingInstances = (scope: ConfigScope, agentName: string) =>
    matchingInstancesForAsset.filter(
      (instance) =>
        instance.agents.includes(agentName) &&
        scopeMatches(instance.scope, scope),
    );

  const handleInstall = async (agent: string, scope: ConfigScope) => {
    const isGlobalInstall = scope.type === "global";
    if (isGlobalInstall) setDeploying(agent);
    try {
      const installed = matchingInstances(scope, agent);
      const markedInstalled = isHubInstalled(ext.id, scope, agent);
      if (installed.length > 0 || markedInstalled) {
        if (installed.length > 0) {
          await Promise.all(
            installed.map((instance) => api.deleteExtension(instance.id)),
          );
        }
        unmarkInstalled(ext.id, scope, agent);
        await rescanAndFetch();
        toast.success(
          scope.type === "project"
            ? `已从 ${scope.name} / ${agentDisplayName(agent)} 移除`
            : `已从 ${agentDisplayName(agent)} 移除`,
        );
        return;
      }

      // Check for conflict first
      const conflictExt = await api.checkHubInstallConflict(
        ext.id,
        agent,
        scope,
      );
      if (conflictExt) {
        setConflict(conflictExt);
        setConflictTarget({ agent, scope });
        if (isGlobalInstall) setDeploying(null);
        return;
      }
      try {
        await installFromHub(ext.id, agent, scope, false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // If backend detects a conflict our frontend check missed, surface it
        if (msg.includes("already exists") || msg.includes("Use force=true")) {
          const conflictExt = await api.checkHubInstallConflict(
            ext.id,
            agent,
            scope,
          );
          if (conflictExt) {
            setConflict(conflictExt);
            setConflictTarget({ agent, scope });
            return;
          }
        }
        throw e;
      }
      markInstalled(ext.id, scope, agent);
      await rescanAndFetch();
    } catch (e) {
      console.error("Install failed:", e);
    } finally {
      if (isGlobalInstall) setDeploying(null);
    }
  };

  const globalAgentItems: AgentInstallIconItem[] = globalInstallAgents.map(
    (agent) => {
      const installState = buildInstallState({
        agentName: agent.name,
        instances: matchingInstancesForAsset,
        surface: "extension-detail",
      });
      const installed = installState.globalInstalled;
      return {
        name: agent.name,
        installed,
        pending: deploying === agent.name,
        title: `${agentDisplayName(agent.name)}${
          installed ? " · 点击移除全局安装" : " · 安装到全局"
        }`,
        onClick: () => void handleInstall(agent.name, { type: "global" }),
      };
    },
  );

  const projectAgentItems: AgentInstallIconItem[] =
    projectScope && projectTargetKind
      ? projectInstallAgents.map((agent) => {
          const installState = buildInstallState({
            agentName: agent.name,
            instances: matchingInstancesForAsset,
            projectScope,
            surface: "extension-detail",
          });
          const installed = installState.projectInstalled;
          return {
            name: agent.name,
            installed,
            pending: projectDeploying === agent.name,
            title: `${agentDisplayName(agent.name)}${
              installed ? " · 点击移除项目安装" : " · 安装到项目"
            }`,
            onClick: () => {
              setProjectDeploying(agent.name);
              void handleInstall(agent.name, projectScope).finally(() =>
                setProjectDeploying(null),
              );
            },
          };
        })
      : [];

  const handleForceInstall = async (agent: string, scope: ConfigScope) => {
    setDeploying(agent);
    setConflict(null);
    setConflictTarget(null);
    try {
      await installFromHub(ext.id, agent, scope, true);
      markInstalled(ext.id, scope, agent);
      await rescanAndFetch();
    } catch (e) {
      console.error("Force install failed:", e);
    } finally {
      setDeploying(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (selectedHubExtensions.length <= 1) {
        await deleteFromHub(ext.id);
      } else {
        await Promise.all(
          selectedHubExtensions.map((item) => api.deleteFromHub(item.id)),
        );
        setSelectedId(null);
        await fetchHubExtensions();
        toast.success("Deleted from Local Hub");
      }
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
            <AgentInstallIconRow items={globalAgentItems} />
          </div>
        )}

        {projectTargetKind && (
          <ProjectInstallPanel
            projects={availableProjects}
            selectedProjectPath={selectedProjectPath}
            onProjectChange={setSelectedProjectPath}
            agentItems={projectAgentItems}
            selectedProjectName={
              projectScope?.type === "project" ? projectScope.name : null
            }
            placeholder="Select an existing project"
            emptyProjectText="Select a project first"
            emptyAgentsText="No project-capable agents detected"
          />
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
                {deleting ? (
                  <Loader2 size={14} className="animate-spin mx-auto" />
                ) : (
                  "Delete"
                )}
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
                    ? handleForceInstall(
                        conflictTarget.agent,
                        conflictTarget.scope,
                      )
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
