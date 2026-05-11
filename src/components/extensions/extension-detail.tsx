import {
  AlertTriangle,
  Archive,
  Calendar,
  FolderOpen,
  GitBranch,
  Globe,
  Folder,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { DeleteDialog } from "@/components/extensions/delete-dialog";
import { CliSections } from "@/components/extensions/detail-cli-sections";
import { DetailHeader } from "@/components/extensions/detail-header";
import { DetailPaths } from "@/components/extensions/detail-paths";
import { PermissionDetail } from "@/components/extensions/permission-detail";
import { SkillFileSection } from "@/components/extensions/skill-file-section";
import { AgentInstallIconRow } from "@/components/shared/agent-install-icon-row";
import { ProjectInstallPanel } from "@/components/shared/project-install-panel";
import { canInstallAtScope } from "@/lib/agent-capabilities";
import { api } from "@/lib/invoke";
import {
  buildInstallState,
  getInstallSourceInstance,
  resolveProjectSelection,
} from "@/lib/install-surface";
import { isDesktop } from "@/lib/transport";
import type { ConfigScope, ExtensionContent as ExtContent } from "@/lib/types";
import {
  agentDisplayName,
  extensionGroupKey,
  scopeKey,
  scopeLabel,
  sortAgents,
} from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { findCliChildren } from "@/stores/extension-helpers";
import { useExtensionStore } from "@/stores/extension-store";
import { useHubStore } from "@/stores/hub-store";
import { useProjectStore } from "@/stores/project-store";
import { toast } from "@/stores/toast-store";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const AGENTS_WITHOUT_HOOKS = new Set(["antigravity"]);

export function ExtensionDetail({
  installProjectScope,
  onInstallProjectScopeChange,
}: {
  installProjectScope: ConfigScope | null;
  onInstallProjectScopeChange: (scope: ConfigScope | null) => void;
}) {
  const grouped = useExtensionStore((s) => s.grouped);
  const selectedId = useExtensionStore((s) => s.selectedId);
  const setSelectedId = useExtensionStore((s) => s.setSelectedId);
  const toggle = useExtensionStore((s) => s.toggle);
  const updateStatuses = useExtensionStore((s) => s.updateStatuses);
  const updateExtension = useExtensionStore((s) => s.updateExtension);
  const updatePack = useExtensionStore((s) => s.updatePack);
  const installToAgent = useExtensionStore((s) => s.installToAgent);
  const installToProject = useExtensionStore((s) => s.installToProject);
  const deleteFromAgents = useExtensionStore((s) => s.deleteFromAgents);
  const rescanAndFetch = useExtensionStore((s) => s.rescanAndFetch);
  const extensions = useExtensionStore((s) => s.extensions);
  const group = grouped().find((g) => g.groupKey === selectedId);
  /** Per-instance content data keyed by instance id */
  const [instanceData, setInstanceData] = useState<Map<string, ExtContent>>(
    new Map(),
  );
  const [loadingContent, setLoadingContent] = useState(false);
  const agents = useAgentStore((s) => s.agents);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const projects = useProjectStore((s) => s.projects);
  const [deployingAgents, setDeployingAgents] = useState<Set<string>>(
    new Set(),
  );
  const [projectDeployingAgents, setProjectDeployingAgents] = useState<
    Set<string>
  >(new Set());
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteKeys, setDeleteKeys] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  // All physical paths where this skill exists, keyed by agent name
  const [skillLocations, setSkillLocations] = useState<
    [string, string, string | null][]
  >([]);

  // Reset state and load ALL instance data when group changes
  useEffect(() => {
    if (group && group.instances.length > 0) {
      setActiveInstanceId(group.instances[0].id);
      // Load content + path for every instance in parallel
      setLoadingContent(true);
      setInstanceData(new Map());
      Promise.all(
        group.instances.map((inst) =>
          api
            .getExtensionContent(inst.id)
            .then((res) => [inst.id, res] as const)
            .catch(() => [inst.id, null] as const),
        ),
      ).then((results) => {
        const map = new Map<string, ExtContent>();
        for (const [id, data] of results) {
          if (data) map.set(id, data);
        }
        setInstanceData(map);
        setLoadingContent(false);
      });
      // Load skill locations for skills
      if (group.kind === "skill") {
        api
          .getSkillLocations(group.name)
          .then(setSkillLocations)
          .catch(() => setSkillLocations([]));
      } else {
        setSkillLocations([]);
      }
    } else {
      setActiveInstanceId(null);
      setInstanceData(new Map());
      setSkillLocations([]);
    }
    setShowDelete(false);
    setDeleteKeys(new Set());
  }, [group?.kind, group?.instances[0]?.id, group]);

  // Reset deleteKeys when showDelete is toggled on
  useEffect(() => {
    if (showDelete && group) {
      setDeleteKeys(new Set());
    }
  }, [showDelete, group]);

  useEffect(() => {
    setDeployingAgents(new Set());
    setProjectDeployingAgents(new Set());
  }, [group?.groupKey]);

  useEffect(() => {
    if (!group) return;
    const installedInstances =
      group.kind === "cli"
        ? findCliChildren(extensions, group.instances[0]?.id, group.pack)
        : group.instances;
    const availableProjects = projects.filter((project) => project.exists);
    const currentProjectValid =
      installProjectScope?.type === "project"
        ? availableProjects.some(
            (project) => project.path === installProjectScope.path,
          )
        : false;
    const selectedProject = resolveProjectSelection({
      contextScope: currentProjectValid ? installProjectScope : null,
      installedInstances,
      projects: availableProjects,
    });
    const currentProjectPath =
      installProjectScope?.type === "project" ? installProjectScope.path : null;
    const nextProjectPath =
      selectedProject?.type === "project" ? selectedProject.path : null;

    if (currentProjectPath === nextProjectPath) return;
    onInstallProjectScopeChange(selectedProject);
  }, [extensions, group, installProjectScope, onInstallProjectScopeChange, projects]);

  if (!group) return null;

  const detectedAgents = sortAgents(
    agents.filter((a) => a.detected),
    agentOrder,
  );
  const projectTargetKind =
    group.kind === "skill" || group.kind === "mcp" || group.kind === "cli"
      ? group.kind
      : null;
  const cliProjectChildren =
    group.kind === "cli"
      ? findCliChildren(extensions, group.instances[0]?.id, group.pack)
      : [];
  const projectStateInstances =
    group.kind === "cli" ? cliProjectChildren : group.instances;
  const projectInstallAgents =
    installProjectScope?.type === "project" && projectTargetKind
      ? detectedAgents.filter((agent) =>
          canInstallAtScope(agent.name, projectTargetKind, installProjectScope),
        )
      : [];

  const globalSourceInstance = getInstallSourceInstance(group.instances, {
    type: "global",
  });
  const projectSourceInstance =
    installProjectScope?.type === "project"
      ? getInstallSourceInstance(group.instances, installProjectScope)
      : null;
  const selectedProjectPath =
    installProjectScope?.type === "project" ? installProjectScope.path : "";
  const globalAgentItems =
    group.kind === "skill" ||
    group.kind === "mcp" ||
    group.kind === "hook" ||
    group.kind === "cli"
      ? detectedAgents.map((agent) => {
          const installState = buildInstallState({
            agentName: agent.name,
            instances: group.instances,
            surface: "extension-detail",
          });
          const isInstalled = installState.globalInstalled;
          const canRemove = group.kind !== "cli";
          const hookUnsupported =
            !isInstalled &&
            group.kind === "hook" &&
            AGENTS_WITHOUT_HOOKS.has(agent.name);
          const disabled =
            deployingAgents.has(agent.name) ||
            (!isInstalled && hookUnsupported) ||
            (isInstalled && !canRemove);

          return {
            name: agent.name,
            installed: isInstalled,
            pending: deployingAgents.has(agent.name),
            disabled,
            title: isInstalled
              ? canRemove
                ? `从 ${agentDisplayName(agent.name)} 移除全局安装`
                : "CLI 请通过删除操作整体移除"
              : hookUnsupported
                ? `${agentDisplayName(agent.name)} · 当前不支持 hooks`
                : `安装到 ${agentDisplayName(agent.name)}`,
            onClick: disabled
              ? undefined
              : async () => {
                  if (isInstalled) {
                    setDeployingAgents((prev) => new Set(prev).add(agent.name));
                    try {
                      const globalToDelete = group.instances.filter(
                        (instance) =>
                          instance.scope.type === "global" &&
                          instance.agents.includes(agent.name),
                      );
                      await Promise.all(
                        globalToDelete.map((instance) =>
                          api.deleteExtension(instance.id),
                        ),
                      );
                      await rescanAndFetch();
                      toast.success(
                        `已从 ${agentDisplayName(agent.name)} 移除`,
                      );
                    } catch {
                      toast.error(
                        `从 ${agentDisplayName(agent.name)} 移除失败`,
                      );
                    } finally {
                      setDeployingAgents((prev) => {
                        const next = new Set(prev);
                        next.delete(agent.name);
                        return next;
                      });
                    }
                    return;
                  }
                  if (hookUnsupported || !globalSourceInstance) return;
                  setDeployingAgents((prev) => new Set(prev).add(agent.name));
                  try {
                    if (group.kind === "cli") {
                      const seen = new Set<string>();
                      for (const child of cliProjectChildren) {
                        const dedupeKey = `${child.kind}:${child.name}`;
                        if (seen.has(dedupeKey)) continue;
                        seen.add(dedupeKey);
                        await installToAgent(child.id, agent.name);
                      }
                    } else {
                      await installToAgent(globalSourceInstance.id, agent.name);
                    }
                    toast.success(
                      `已安装到 ${agentDisplayName(agent.name)}。将在新会话中生效`,
                    );
                  } catch {
                    toast.error(
                      `安装到 ${agentDisplayName(agent.name)} 失败`,
                    );
                  } finally {
                    setDeployingAgents((prev) => {
                      const next = new Set(prev);
                      next.delete(agent.name);
                      return next;
                    });
                  }
                },
          };
        })
      : [];
  const projectAgentItems =
    installProjectScope?.type === "project" && projectTargetKind
      ? projectInstallAgents.map((agent) => {
          const installState = buildInstallState({
            agentName: agent.name,
            instances: projectStateInstances,
            projectScope: installProjectScope,
            surface: "extension-detail",
          });
          const isInstalled = installState.projectInstalled;

          return {
            name: agent.name,
            installed: isInstalled,
            pending: projectDeployingAgents.has(agent.name),
            disabled: projectDeployingAgents.has(agent.name),
            title: `${agentDisplayName(agent.name)}${
              isInstalled ? " · 点击移除项目安装" : " · 安装到项目"
            }`,
            onClick: async () => {
              setProjectDeployingAgents((prev) => new Set(prev).add(agent.name));
              try {
                if (isInstalled) {
                  const matches = projectStateInstances.filter(
                    (instance) =>
                      instance.scope.type === "project" &&
                      instance.scope.path === installProjectScope.path &&
                      instance.agents.includes(agent.name),
                  );
                  if (matches.length === 0) {
                    throw new Error("No project install found for this agent");
                  }
                  await Promise.all(
                    matches.map((instance) => api.deleteExtension(instance.id)),
                  );
                  await rescanAndFetch();
                  toast.success(
                    `已从 ${installProjectScope.name} / ${agentDisplayName(agent.name)} 移除`,
                  );
                  return;
                }
                if (group.kind === "cli") {
                  if (cliProjectChildren.length === 0) {
                    throw new Error(
                      "No CLI child extensions found for project install",
                    );
                  }
                  const seen = new Set<string>();
                  for (const child of cliProjectChildren) {
                    const dedupeKey = `${child.kind}:${child.name}`;
                    if (seen.has(dedupeKey)) continue;
                    seen.add(dedupeKey);
                    await installToProject(
                      child.id,
                      agent.name,
                      installProjectScope,
                    );
                  }
                } else if (projectSourceInstance) {
                  await installToProject(
                    projectSourceInstance.id,
                    agent.name,
                    installProjectScope,
                  );
                } else {
                  throw new Error(
                    "No source extension instance found for project install",
                  );
                }
                toast.success(
                  `已同步到 ${installProjectScope.name} / ${agentDisplayName(agent.name)}`,
                );
              } catch (error) {
                const message =
                  error instanceof Error ? error.message : String(error);
                toast.error(`同步到项目失败: ${message}`);
              } finally {
                setProjectDeployingAgents((prev) => {
                  const next = new Set(prev);
                  next.delete(agent.name);
                  return next;
                });
              }
            },
          };
        })
      : [];

  // Find CLI parent for child extensions (by cli_parent_id or matching pack)
  const cliParent =
    group.kind !== "cli"
      ? (() => {
          const parent = extensions.find(
            (e) =>
              e.kind === "cli" &&
              (e.id === group.instances[0]?.cli_parent_id ||
                (group.pack && e.pack === group.pack)),
          );
          if (!parent) return null;
          const parentGroupKey = extensionGroupKey(parent);
          return {
            name: parent.name,
            onNavigate: () => setSelectedId(parentGroupKey),
          };
        })()
      : null;

  return (
    <div
      onWheel={(e) => e.stopPropagation()}
      className="relative flex h-full flex-col rounded-xl border border-border bg-card shadow-sm"
    >
      {/* Fixed header */}
      <DetailHeader
        group={group}
        updateStatuses={updateStatuses}
        updateExtension={updateExtension}
        onClose={() => setSelectedId(null)}
      />

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
        <p className="text-sm text-muted-foreground">
          {cliParent && (
            <>
              <span>
                {group.kind === "mcp"
                  ? "This MCP server is part of "
                  : "This skill is part of "}
              </span>
              <button
                onClick={cliParent.onNavigate}
                className="font-medium text-primary hover:underline"
              >
                {cliParent.name}
              </button>
              {group.description ? ". " : ""}
            </>
          )}
          {group.description}
        </p>

        {/* 1. Status + Source row */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => {
              toggle(group.groupKey, !group.enabled);
              const action = group.enabled ? "disabled" : "enabled";
              toast.success(
                `Extension ${action}. Takes effect in new sessions`,
              );
            }}
            aria-pressed={group.enabled}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
              group.enabled
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {group.enabled ? "Enabled" : "Disabled"}
          </button>
          {/* Backup to Hub button */}
          {(group.kind === "skill" || group.kind === "mcp" || group.kind === "plugin") && (
            <button
              onClick={() => {
                useHubStore.getState().backupToHub(group.instances[0]?.id ?? "")
                  .then(() => {})
                  .catch(() => {});
              }}
              className="shrink-0 rounded-full bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1"
              title="Backup to Local Hub (~/.harnesskit)"
            >
              <Archive size={12} />
              Backup
            </button>
          )}
          {group.source.origin === "git" && group.pack ? (
            <a
              href={`https://github.com/${group.pack}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate rounded-full bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title={`https://github.com/${group.pack}`}
            >
              {group.pack}
            </a>
          ) : (
            <input
              type="text"
              placeholder="No source"
              defaultValue={group.pack ?? ""}
              key={group.groupKey}
              onBlur={(e) => {
                const val = e.target.value.trim() || null;
                if (val !== group.pack) updatePack(group.groupKey, val);
              }}
              className="min-w-0 flex-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground focus:border-ring focus:outline-none"
            />
          )}
        </div>

        {/* 2. Info */}
        <div className="mt-4 space-y-2 text-sm">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Info
          </h4>
          {(() => {
            const meta = group.instances.find(
              (i) => i.install_meta,
            )?.install_meta;
            // For CLIs, also check child extensions' install_meta for source URL
            const childMeta =
              !meta && group.kind === "cli"
                ? extensions.find(
                    (e) =>
                      e.cli_parent_id === group.instances[0]?.id &&
                      e.install_meta?.url,
                  )?.install_meta
                : null;
            // Fall back to pack (user-provided or backfilled) when no URL
            // exists in install_meta or source — e.g. CLIs installed via
            // curl that only have a manually entered pack like "org/repo".
            const sourceUrl =
              meta?.url_resolved ??
              meta?.url ??
              childMeta?.url_resolved ??
              childMeta?.url ??
              group.source.url ??
              (group.pack ? `https://github.com/${group.pack}` : null);
            const repoPath = sourceUrl
              ? (() => {
                  const m = sourceUrl.match(/github\.com\/([^/]+\/[^/]+)/);
                  return m ? m[1].replace(/\.git$/, "") : null;
                })()
              : null;
            return (
              <>
                {repoPath && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Globe size={14} />
                    <a
                      href={`https://github.com/${repoPath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate hover:text-foreground transition-colors"
                      title={`https://github.com/${repoPath}`}
                    >
                      {repoPath}
                    </a>
                  </div>
                )}
              </>
            );
          })()}
          {group.instances.some(
            (inst) =>
              updateStatuses.get(inst.id)?.status === "removed_from_repo",
          ) && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <AlertTriangle size={14} />
              <span>No longer available in the repository</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar size={14} />
            <span>
              Installed{" "}
              {group.kind === "skill" ||
              group.kind === "plugin" ||
              group.kind === "cli"
                ? formatDate(group.installed_at)
                : "\u2014"}
            </span>
          </div>
          {(() => {
            // After Phase C dedup, a single group can span multiple scopes
            // (same skill installed both globally and in a project). Show
            // each unique scope on its own row so the user can see exactly
            // where this extension lives.
            const uniqueScopes = new Map<string, ConfigScope>();
            for (const inst of group.instances) {
              uniqueScopes.set(scopeKey(inst.scope), inst.scope);
            }
            return [...uniqueScopes.values()].map((s) => (
              <div
                key={scopeKey(s)}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Folder size={14} />
                <span className="truncate">{scopeLabel(s)}</span>
              </div>
            ));
          })()}
          {group.source.origin === "git" &&
            group.source.url &&
            !group.instances.find((i) => i.install_meta) && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <GitBranch size={14} />
                <span className="truncate">{group.source.url}</span>
              </div>
            )}
        </div>

        {(group.kind === "skill" ||
          group.kind === "mcp" ||
          group.kind === "hook" ||
          group.kind === "cli") &&
          (() => {
            if (detectedAgents.length === 0) return null;
            return (
              <div className="mt-4">
                <div className="mb-2 flex items-baseline gap-2">
                  <h4
                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    title="Copy this extension's configuration to another agent on your machine"
                  >
                    Install to Agent
                  </h4>
                </div>
                <AgentInstallIconRow items={globalAgentItems} />
                {projectTargetKind && (
                  <ProjectInstallPanel
                    className="mt-3"
                    projects={projects}
                    selectedProjectPath={selectedProjectPath}
                    onProjectChange={(path) => {
                      const project = projects.find((item) => item.path === path);
                      onInstallProjectScopeChange(
                        project
                          ? {
                              type: "project",
                              name: project.name,
                              path: project.path,
                            }
                          : null,
                      );
                    }}
                    agentItems={projectAgentItems}
                    selectedProjectName={
                      installProjectScope?.type === "project"
                        ? installProjectScope.name
                        : null
                    }
                  />
                )}
              </div>
            );
          })()}

        {/* 5. Permissions */}
        {group.permissions.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Permissions
            </h4>
            <div className="space-y-2">
              {group.permissions.map((p, i) => (
                <PermissionDetail key={i} perm={p} />
              ))}
            </div>
          </div>
        )}

        {/* 6+7. CLI Details + Associated Extensions */}
        <CliSections group={group} extensions={extensions} />

        {/* 8. Paths (per-agent breakdown) — skip for CLI */}
        <DetailPaths
          group={group}
          instanceData={instanceData}
          skillLocations={skillLocations}
        />

        {/* 9. Content / Documentation — skip for hooks and CLIs */}
        {group.kind !== "hook" &&
          group.kind !== "cli" &&
          group.kind !== "mcp" && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Documentation
                </h4>
                {isDesktop() &&
                  activeInstanceId &&
                  instanceData.get(activeInstanceId)?.path && (
                    <button
                      onClick={() =>
                        api.revealInFileManager(
                          instanceData.get(activeInstanceId)!.path!,
                        )
                      }
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <FolderOpen size={12} />
                      Open in Finder
                    </button>
                  )}
              </div>
              {/* Agent tabs for switching instance content */}
              {group.instances.length > 1 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {group.instances.map((instance) => (
                    <button
                      key={instance.id}
                      onClick={() => setActiveInstanceId(instance.id)}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        activeInstanceId === instance.id
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {agentDisplayName(instance.agents[0] ?? "unknown")}
                    </button>
                  ))}
                </div>
              )}

              {/* File tree + SKILL.md content */}
              {activeInstanceId && (
                <SkillFileSection
                  instanceId={activeInstanceId}
                  content={instanceData.get(activeInstanceId)?.content ?? null}
                  dirPath={instanceData.get(activeInstanceId)?.path ?? null}
                  loading={loadingContent}
                  kind={group.kind}
                />
              )}
            </div>
          )}

        {/* 10. Delete trigger */}
        <div className="mt-4">
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={12} />
            Delete...
          </button>
        </div>

        {/* Delete confirmation dialog */}
        {showDelete && (
          <DeleteDialog
            group={group}
            instanceData={instanceData}
            deleting={deleting}
            deleteKeys={deleteKeys}
            setDeleteKeys={setDeleteKeys}
            childExtensions={
              group.kind === "cli"
                ? findCliChildren(
                    extensions,
                    group.instances[0]?.id,
                    group.pack,
                  )
                : undefined
            }
            skillLocations={group.kind === "skill" ? skillLocations : undefined}
            onDelete={async ({ agents, instanceIds }) => {
              setDeleting(true);
              try {
                if (group.kind === "cli") {
                  await deleteFromAgents(group.groupKey, agents);
                } else {
                  const ids = Array.from(new Set(instanceIds));
                  await Promise.all(ids.map((id) => api.deleteExtension(id)));
                  await rescanAndFetch();
                }
                const allInstanceIds = new Set(
                  group.instances.map((instance) => instance.id),
                );
                const deletingAllInstances =
                  group.kind === "cli" ||
                  (allInstanceIds.size > 0 &&
                    [...allInstanceIds].every((id) => instanceIds.includes(id)));
                toast.success(
                  deletingAllInstances
                    ? "Extension deleted. Takes effect in new sessions"
                    : `Deleted from ${agents.map(agentDisplayName).join(", ")}. Takes effect in new sessions`,
                );
                if (deletingAllInstances) setSelectedId(null);
              } catch {
                toast.error("Failed to delete");
              } finally {
                setDeleting(false);
                setShowDelete(false);
              }
            }}
            onClose={() => setShowDelete(false)}
          />
        )}
      </div>
    </div>
  );
}
