import { clsx } from "clsx";
import { agentDisplayName } from "@/lib/types";
import { useAgentConfigStore } from "@/stores/agent-config-store";

export function AgentList() {
  const agentDetails = useAgentConfigStore((s) => s.agentDetails);
  const selectedAgent = useAgentConfigStore((s) => s.selectedAgent);
  const selectAgent = useAgentConfigStore((s) => s.selectAgent);

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Agents
      </div>
      {agentDetails.map((agent) => {
        const isSelected = agent.name === selectedAgent;
        const itemCount = agent.config_files.length;
        return (
          <button
            key={agent.name}
            onClick={() => selectAgent(agent.name)}
            className={clsx(
              "flex flex-col items-start rounded-lg px-3 py-2.5 text-left transition-colors",
              isSelected
                ? "bg-accent text-accent-foreground"
                : agent.detected
                  ? "text-foreground/80 hover:bg-accent/50"
                  : "text-muted-foreground/50 cursor-default"
            )}
            disabled={!agent.detected}
          >
            <span className="text-[13px] font-medium">{agentDisplayName(agent.name)}</span>
            <span className="text-[10px] text-muted-foreground">
              {agent.detected ? `${itemCount} items` : "Not detected"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
