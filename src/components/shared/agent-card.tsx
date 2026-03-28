import { useState, useCallback } from "react";
import { AgentMascot } from "./agent-mascot/agent-mascot";
import type { AgentInfo } from "@/lib/types";

interface AgentCardProps {
  agent: AgentInfo;
  onClick: (agentName: string) => void;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  const handleClick = useCallback(() => {
    setIsClicked(true);
    setTimeout(() => {
      setIsClicked(false);
      onClick(agent.name);
    }, 400);
  }, [agent.name, onClick]);

  return (
    <button
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
      className="group flex w-[120px] flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-4 py-4 text-center transition-all duration-200 hover:border-border hover:bg-card hover:shadow-sm"
    >
      <AgentMascot
        name={agent.name}
        size={48}
        animated={isHovered}
        clicked={isClicked}
      />
      <div className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">
          {cap(agent.name)}
        </span>
        <span className="block text-xs text-muted-foreground">
          {agent.extension_count} ext.
        </span>
      </div>
    </button>
  );
}
