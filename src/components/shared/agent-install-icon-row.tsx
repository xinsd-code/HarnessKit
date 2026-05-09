import { clsx } from "clsx";
import { Loader2 } from "lucide-react";
import { AgentMascot } from "@/components/shared/agent-mascot/agent-mascot";
import { agentDisplayName } from "@/lib/types";

export const AGENT_ICON_TONES: Record<string, string> = {
  claude: "border-[#f6c89a] bg-[#fff2e4]",
  codex: "border-[#b7d7c4] bg-[#effaf3]",
  gemini: "border-[#d1d6ff] bg-[#eef1ff]",
  cursor: "border-[#cfd4dc] bg-[#f4f6f8]",
  antigravity: "border-[#d2d2d2] bg-[#f5f5f5]",
  copilot: "border-[#ced4ff] bg-[#eef1ff]",
  windsurf: "border-[#d2d7ff] bg-[#f0f2ff]",
};

export interface AgentInstallIconItem {
  name: string;
  title?: string;
  installed?: boolean;
  pending?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  activeToneClassName?: string;
}

interface AgentInstallIconRowProps {
  items: AgentInstallIconItem[];
  className?: string;
  emptyText?: string;
}

export function AgentInstallIconRow({
  items,
  className,
  emptyText,
}: AgentInstallIconRowProps) {
  if (items.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        {emptyText}
      </div>
    );
  }

  return (
    <div className={clsx("flex flex-wrap gap-1.5", className)}>
      {items.map((item) => {
        const interactive = Boolean(item.onClick) && !item.disabled;
        const isInstalled = Boolean(item.installed);
        const isPending = Boolean(item.pending);
        return (
          <button
            key={item.name}
            type="button"
            title={item.title ?? agentDisplayName(item.name)}
            aria-label={item.title ?? agentDisplayName(item.name)}
            disabled={item.disabled || isPending}
            onClick={item.onClick}
            className={clsx(
              "flex h-11 w-11 items-center justify-center rounded-full border transition-all",
              isInstalled
                ? `${item.activeToneClassName ?? AGENT_ICON_TONES[item.name] ?? "border-border bg-muted/40"} shadow-sm`
                : "border-border bg-muted/30",
              interactive && "hover:scale-[1.03] hover:border-border/60",
              (item.disabled || isPending) && "opacity-70",
              !interactive && !isPending && "cursor-default",
            )}
          >
            <div
              className={clsx(
                "flex h-6 w-6 items-center justify-center",
                !isInstalled && "grayscale opacity-40",
              )}
            >
              {isPending ? (
                <Loader2
                  size={14}
                  className="animate-spin text-muted-foreground"
                />
              ) : (
                <AgentMascot name={item.name} size={20} />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
