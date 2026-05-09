import { clsx } from "clsx";
import { HardDrive } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AgentInstallIconRow,
  type AgentInstallIconItem,
} from "@/components/shared/agent-install-icon-row";
import { KindBadge } from "@/components/shared/kind-badge";
import { PermissionTags } from "@/components/shared/permission-tags";
import { TrustBadge } from "@/components/shared/trust-badge";
import { api } from "@/lib/invoke";
import { buildInstallState } from "@/lib/install-surface";
import { agentDisplayName, sortAgentNames } from "@/lib/types";
import type { Extension } from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { useExtensionStore } from "@/stores/extension-store";
import { useHubStore } from "@/stores/hub-store";
import { toast } from "@/stores/toast-store";

function AgentInstallCell({ ext }: { ext: Extension }) {
  const agents = useAgentStore((s) => s.agents);
  const agentOrder = useAgentStore((s) => s.agentOrder);
  const installedExtensions = useExtensionStore((s) => s.extensions);
  const rescanAndFetch = useExtensionStore((s) => s.rescanAndFetch);
  const installFromHub = useHubStore((s) => s.installFromHub);
  const setSelectedId = useHubStore((s) => s.setSelectedId);
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);
  const [optimisticInstalled, setOptimisticInstalled] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    setOptimisticInstalled(new Set());
  }, [ext.id]);

  const visibleAgents = sortAgentNames(
    agents.filter((agent) => agent.detected).map((agent) => agent.name),
    agentOrder,
  );
  const matchingInstances = installedExtensions.filter(
    (instance) => instance.kind === ext.kind && instance.name === ext.name,
  );

  const handleToggle = async (
    agentName: string,
  ) => {
    setPendingAgent(agentName);
    try {
      const installState = buildInstallState({
        agentName,
        instances: matchingInstances,
        surface: "local-hub",
      });
      const { globalInstances } = installState;
      const wasOptimistic = optimisticInstalled.has(agentName);

      if (installState.listAction === "open-detail" && !wasOptimistic) {
        setSelectedId(ext.id);
        return;
      }

      if (globalInstances.length > 0 || wasOptimistic) {
        await Promise.all(
          globalInstances.map((instance) => api.deleteExtension(instance.id)),
        );
        setOptimisticInstalled((prev) => {
          const next = new Set(prev);
          next.delete(agentName);
          return next;
        });
        await rescanAndFetch();
        toast.success(`已从 ${agentDisplayName(agentName)} 移除`);
        return;
      }

      await installFromHub(ext.id, agentName, { type: "global" }, false);
      setOptimisticInstalled((prev) => new Set(prev).add(agentName));
      await rescanAndFetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`操作失败: ${message}`);
    } finally {
      setPendingAgent(null);
    }
  };

  const items: AgentInstallIconItem[] = visibleAgents.map((agentName) => {
    const installState = buildInstallState({
      agentName,
      instances: matchingInstances,
      surface: "local-hub",
    });
    const optimistic = optimisticInstalled.has(agentName);
    const pending = pendingAgent === agentName;
    const installed = installState.globalInstalled || optimistic;
    const title =
      installState.listAction === "open-detail" && !optimistic
        ? `${agentDisplayName(agentName)} · 已安装到项目，点击查看详情`
        : `${agentDisplayName(agentName)}${
            installState.globalInstalled || optimistic
              ? " · 点击移除全局安装"
              : " · 安装到全局"
          }`;

    return {
      name: agentName,
      installed,
      pending,
      title,
      onClick: () => void handleToggle(agentName),
    };
  });

  return (
    <div
      onClick={(event) => event.stopPropagation()}
      className="min-w-[18rem]"
    >
      <AgentInstallIconRow items={items} />
    </div>
  );
}

export function HubTable({ data }: { data: Extension[] }) {
  const selectedId = useHubStore((s) => s.selectedId);
  const setSelectedId = useHubStore((s) => s.setSelectedId);
  const installedExtensions = useExtensionStore((s) => s.extensions);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center">
        <HardDrive className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h3 className="text-lg font-medium text-foreground">No Extensions in Hub</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Backup extensions from the Extensions page or import from local directories.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full" aria-label="Local Hub table">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Kind
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Agent
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Permissions
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Audit
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.map((ext) => {
              const isSelected = selectedId === ext.id;
              const installedMatches = installedExtensions.filter(
                (instance) => instance.kind === ext.kind && instance.name === ext.name,
              );
              const trustScore =
                installedMatches.reduce<number | null>((current, instance) => {
                  if (instance.trust_score == null) return current;
                  return current == null
                    ? instance.trust_score
                    : Math.min(current, instance.trust_score);
                }, ext.trust_score ?? null) ?? null;
              return (
                <tr
                  key={ext.id}
                  onClick={() => setSelectedId(isSelected ? null : ext.id)}
                  className={clsx(
                    "cursor-pointer transition-colors duration-150",
                    isSelected
                      ? "bg-accent border-l-2 border-l-primary"
                      : "hover:bg-muted/40",
                  )}
                >
                  <td className="px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">{ext.name}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <KindBadge kind={ext.kind} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <AgentInstallCell ext={ext} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <PermissionTags permissions={ext.permissions} />
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {trustScore != null ? (
                      <TrustBadge score={trustScore} size="sm" />
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
