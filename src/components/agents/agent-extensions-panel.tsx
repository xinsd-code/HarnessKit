import {
  AlertTriangle,
  ArrowRight,
  Folder,
  Loader2,
  Trash2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KindBadge } from "@/components/shared/kind-badge";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { api } from "@/lib/invoke";
import type { ConfigScope, ExtensionKind, GroupedExtension } from "@/lib/types";
import {
  agentDisplayName,
  deriveExtensionUrl,
  scopeKey,
  scopeLabel,
} from "@/lib/types";
import {
  findCliChildren,
  isCliChildSkillGroup,
} from "@/stores/extension-helpers";
import { useExtensionStore } from "@/stores/extension-store";
import { toast } from "@/stores/toast-store";

const KIND_TITLES: Record<ExtensionKind, string> = {
  skill: "Skills",
  mcp: "MCP Servers",
  plugin: "Plugins",
  hook: "Hooks",
  cli: "CLIs",
};

function sourceLabel(group: GroupedExtension): string | null {
  if (group.pack) return group.pack;
  const url = deriveExtensionUrl(group.instances[0]);
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return match ? match[1].replace(/\.git$/, "") : url;
}

export function AgentExtensionsPanel({
  agentName,
  kind,
  scope,
}: {
  agentName: string;
  kind: ExtensionKind;
  scope: ConfigScope | { type: "all" };
}) {
  const navigate = useNavigate();
  const grouped = useExtensionStore((s) => s.grouped);
  const extensions = useExtensionStore((s) => s.extensions);
  const rescanAndFetch = useExtensionStore((s) => s.rescanAndFetch);
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    return grouped()
      .filter((group) => {
        if (group.kind !== kind) return false;
        if (kind === "skill" && isCliChildSkillGroup(group, grouped())) {
          return false;
        }
        return true;
      })
      .map((group) => {
        const relevantInstances = group.instances.filter((instance) => {
          if (!instance.agents.includes(agentName)) return false;
          if (scope.type === "all") return true;
          return scopeKey(instance.scope) === scopeKey(scope);
        });
        if (relevantInstances.length === 0) return null;
        const scopes = new Map<string, ConfigScope>();
        for (const instance of relevantInstances) {
          scopes.set(scopeKey(instance.scope), instance.scope);
        }
        return {
          group,
          relevantInstances,
          scopes: [...scopes.values()],
        };
      })
      .filter(
        (
          item,
        ): item is {
          group: GroupedExtension;
          relevantInstances: GroupedExtension["instances"];
          scopes: ConfigScope[];
        } => item != null,
      )
      .sort((a, b) => a.group.name.localeCompare(b.group.name));
  }, [agentName, grouped, kind, scope]);

  const pendingDeleteGroup =
    groups.find(({ group }) => group.groupKey === pendingDeleteKey) ?? null;

  const handleDelete = async (
    target: (typeof groups)[number],
  ): Promise<void> => {
    const { group, relevantInstances } = target;
    if (relevantInstances.length === 0) return;
    setDeletingKey(group.groupKey);
    try {
      if (group.kind === "cli") {
        const childExtensions = findCliChildren(
          extensions,
          group.instances[0]?.id,
          group.pack,
        );
        const relevantChildren = childExtensions.filter((instance) => {
          if (!instance.agents.includes(agentName)) return false;
          if (scope.type === "all") return true;
          return scopeKey(instance.scope) === scopeKey(scope);
        });
        const ids = new Set(relevantChildren.map((instance) => instance.id));
        await Promise.all([...ids].map((id) => api.deleteExtension(id)));

        const remainingChildren = childExtensions.filter(
          (instance) => !ids.has(instance.id),
        );
        if (
          remainingChildren.length === 0 &&
          relevantInstances.some((instance) => instance.cli_meta?.binary_path)
        ) {
          const binaryPath = relevantInstances[0]?.cli_meta?.binary_path;
          if (binaryPath) {
            await api.uninstallCliBinary(binaryPath);
          }
        }
      } else {
        await Promise.all(
          relevantInstances.map((instance) => api.deleteExtension(instance.id)),
        );
      }
      await rescanAndFetch();
      toast.success(
        group.kind === "cli"
          ? `已移除 ${agentDisplayName(agentName)} 对 ${group.name} 的依赖`
          : `已从 ${agentDisplayName(agentName)} 移除 ${group.name}`,
      );
      setPendingDeleteKey(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`移除失败: ${message}`);
    } finally {
      setDeletingKey(null);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          No {KIND_TITLES[kind]} installed for this agent
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {scope.type === "all"
            ? "Try installing one from Marketplace or Extensions."
            : `No ${KIND_TITLES[kind].toLowerCase()} found in ${scopeLabel(scope)}.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((entry) => {
        const { group, relevantInstances, scopes } = entry;
        const source = sourceLabel(group);
        const params = new URLSearchParams();
        params.set("groupKey", group.groupKey);
        if (scope.type !== "all") {
          params.set("scope", scopeKey(scope));
        }
        return (
          <div
            key={group.groupKey}
            className="rounded-xl border border-border bg-card p-4 text-left shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">
                    {group.name}
                  </span>
                  <KindBadge kind={group.kind} />
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      group.enabled
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {group.enabled ? "Enabled" : "Disabled"}
                  </span>
                </div>
                {group.description && (
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {group.description}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {source && (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {source}
                    </span>
                  )}
                  {scopes.map((itemScope) => (
                    <span
                      key={scopeKey(itemScope)}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                    >
                      <Folder size={11} />
                      {scopeLabel(itemScope)}
                    </span>
                  ))}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  onClick={() => navigate(`/extensions?${params.toString()}`)}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Open
                  <ArrowRight size={13} />
                </button>
                <button
                  onClick={() => setPendingDeleteKey(group.groupKey)}
                  disabled={relevantInstances.length === 0}
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })}
      {pendingDeleteGroup && (
        <RemoveDependencyDialog
          group={pendingDeleteGroup.group}
          agentName={agentName}
          scope={scope}
          deleting={deletingKey === pendingDeleteGroup.group.groupKey}
          onCancel={() => {
            if (deletingKey !== pendingDeleteGroup.group.groupKey) {
              setPendingDeleteKey(null);
            }
          }}
          onConfirm={() => handleDelete(pendingDeleteGroup)}
        />
      )}
    </div>
  );
}

function RemoveDependencyDialog({
  group,
  agentName,
  scope,
  deleting,
  onCancel,
  onConfirm,
}: {
  group: GroupedExtension;
  agentName: string;
  scope: ConfigScope | { type: "all" };
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, true);

  const isCli = group.kind === "cli";
  const scopeText =
    scope.type === "all" ? "当前所有作用域" : `作用域 ${scopeLabel(scope)}`;
  const impactText = isCli
    ? "会移除当前 agent 关联到该 CLI 的扩展依赖；如果没有其他 agent 继续使用该 CLI，还会一并清理对应 binary。"
    : "只会移除当前 agent 在当前作用域下对该资产的依赖，不会影响其他 agent。";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(event) => {
        if (event.target === event.currentTarget && !deleting) onCancel();
      }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px]" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Confirm removal"
        tabIndex={-1}
        className="relative z-10 w-[calc(100%-2rem)] max-w-md rounded-xl border border-border bg-card p-5 shadow-xl animate-fade-in outline-none"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">
              确认移除依赖
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              确认要从 {agentDisplayName(agentName)} 移除{" "}
              <span className="font-medium text-foreground">{group.name}</span>{" "}
              的依赖吗？
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>
            类型:{" "}
            <span className="text-foreground">{KIND_TITLES[group.kind]}</span>
          </p>
          <p>
            范围: <span className="text-foreground">{scopeText}</span>
          </p>
          <p>{impactText}</p>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => {
              void onConfirm();
            }}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-2 text-xs font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Trash2 size={12} />
            )}
            确认移除
          </button>
        </div>
      </div>
    </div>
  );
}
