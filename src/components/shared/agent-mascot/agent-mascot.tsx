import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { getAgentIconPath } from "@/lib/agent-icons";
import { FallbackMascot } from "./fallback-mascot";

interface AgentMascotProps {
  name: string;
  size?: number;
  animated?: boolean;
  clicked?: boolean;
}

export function AgentMascot({
  name,
  size = 48,
  animated = false,
  clicked = false,
}: AgentMascotProps) {
  const iconPath = getAgentIconPath(name);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [name, iconPath]);

  if (!iconPath || hasError) {
    return <FallbackMascot size={size} />;
  }

  return (
    <div
      className={clsx(
        "flex items-center justify-center rounded-lg transition-transform duration-300",
        animated && "scale-[1.06]",
        clicked && "scale-95 rotate-3",
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={iconPath}
        alt={name}
        className="max-h-full max-w-full object-contain"
        style={{ width: size, height: size }}
        onError={() => setHasError(true)}
      />
    </div>
  );
}
