import { clsx } from "clsx";
import { HardDrive } from "lucide-react";
import { useState } from "react";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import { KindBadge } from "@/components/shared/kind-badge";
import { PermissionTags } from "@/components/shared/permission-tags";
import { TrustBadge } from "@/components/shared/trust-badge";
import { api } from "@/lib/invoke";
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
  const [pendingAgent, setPendingAgent] = useState<string | null>(null);

  const visibleAgents = sortAgentNames(
    agents.filter((agent) => agent.detected).map((agent) => agent.name),
    agentOrder,
  );

  const handleToggle = async (
    event: React.MouseEvent<HTMLButtonElement>,
    agentName: string,
  ) => {
    event.stopPropagation();
    setPendingAgent(agentName);
    try {
      const installed = installedExtensions.filter(
        (instance) =>
          instance.kind === ext.kind &&
          instance.name === ext.name &&
          instance.agents.includes(agentName) &&
          instance.scope.type === "global",
      );

      if (installed.length > 0) {
        await Promise.all(installed.map((instance) => api.deleteExtension(instance.id)));
        await rescanAndFetch();
        toast.success(`已从 ${agentDisplayName(agentName)} 移除`);
        return;
      }

      await installFromHub(ext.id, agentName, { type: "global" }, false);
      await rescanAndFetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`操作失败: ${message}`);
    } finally {
      setPendingAgent(null);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      {visibleAgents.map((agentName) => {
        const installedForAgent = installedExtensions.some(
          (instance) =>
            instance.kind === ext.kind &&
            instance.name === ext.name &&
            instance.agents.includes(agentName) &&
            instance.scope.type === "global",
        );
        const isPending = pendingAgent === agentName;

        return (
          <button
            key={`${ext.id}:${agentName}`}
            type="button"
            onClick={(event) => {
              void handleToggle(event, agentName);
            }}
            disabled={isPending}
            title={`${agentDisplayName(agentName)}${
              installedForAgent ? " · 点击移除" : " · 安装到全局"
            }`}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
              installedForAgent
                ? "border-border/70 bg-muted/40 shadow-sm"
                : "border-transparent bg-transparent"
            } hover:scale-[1.03] hover:border-border/60 ${
              isPending ? "opacity-70" : ""
            }`}
          >
            <div className={installedForAgent ? "" : "grayscale opacity-40"}>
              <AgentMascot name={agentName} size={20} />
            </div>
          </button>
        );
      })}
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
