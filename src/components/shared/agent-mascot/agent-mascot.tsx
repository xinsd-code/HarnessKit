import "./mascot.css";
import { ClaudeMascot } from "./claude-mascot";
import { CursorMascot } from "./cursor-mascot";
import { CodexMascot } from "./codex-mascot";
import { GeminiMascot } from "./gemini-mascot";
import { FallbackMascot } from "./fallback-mascot";

interface AgentMascotProps {
  name: string;
  size?: number;
  animated?: boolean;
  clicked?: boolean;
}

const MASCOT_MAP: Record<string, { component: React.ComponentType<{ size: number }>; className: string }> = {
  claude: { component: ClaudeMascot, className: "mascot-claude" },
  cursor: { component: CursorMascot, className: "mascot-cursor" },
  codex: { component: CodexMascot, className: "mascot-codex" },
  gemini: { component: GeminiMascot, className: "mascot-gemini" },
};

export function AgentMascot({ name, size = 48, animated = false, clicked = false }: AgentMascotProps) {
  const entry = MASCOT_MAP[name];
  const Comp = entry?.component ?? FallbackMascot;
  const baseClass = entry?.className ?? "mascot-fallback";

  const classes = [baseClass, animated && "is-animated", clicked && "is-clicked"].filter(Boolean).join(" ");

  return (
    <div className={classes} style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Comp size={size} />
    </div>
  );
}
