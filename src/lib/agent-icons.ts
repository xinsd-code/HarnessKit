export const DEFAULT_AGENT_ICON_PATHS: Record<string, string> = {
  claude: "/agent-logos/claude-code.svg",
  codex: "/agent-logos/codex.svg",
  gemini: "/agent-logos/gemini-cli.svg",
  cursor: "/agent-logos/cursor.svg",
  antigravity: "/agent-logos/antigravity.png",
  copilot: "/agent-logos/copilot.svg",
  windsurf: "/agent-logos/windsurf.svg",
  codebuddy: "/agent-logos/codebuddy.svg",
  "kilo-code": "/agent-logos/kilo-code.svg",
  "kimi-code-cli": "/agent-logos/kimi-code-cli.ico",
  "kiro-cli": "/agent-logos/kiro-cli.svg",
  openclaw: "/agent-logos/openclaw.svg",
  opencode: "/agent-logos/opencode.png",
  qoder: "/agent-logos/qoder.svg",
  "qwen-code": "/agent-logos/qwen-code.png",
  trae: "/agent-logos/trae.png",
  "trae-cn": "/agent-logos/trae.png",
};

export const AGENT_LOGO_OPTIONS = [
  { label: "Claude Code", src: DEFAULT_AGENT_ICON_PATHS.claude },
  { label: "Codex", src: DEFAULT_AGENT_ICON_PATHS.codex },
  { label: "Gemini CLI", src: DEFAULT_AGENT_ICON_PATHS.gemini },
  { label: "Cursor", src: DEFAULT_AGENT_ICON_PATHS.cursor },
  { label: "Antigravity", src: DEFAULT_AGENT_ICON_PATHS.antigravity },
  { label: "GitHub Copilot", src: DEFAULT_AGENT_ICON_PATHS.copilot },
  { label: "Windsurf", src: DEFAULT_AGENT_ICON_PATHS.windsurf },
  { label: "CodeBuddy", src: "/agent-logos/codebuddy.svg" },
  { label: "Kilo Code", src: "/agent-logos/kilo-code.svg" },
  { label: "Kimi Code CLI", src: "/agent-logos/kimi-code-cli.ico" },
  { label: "Kiro CLI", src: "/agent-logos/kiro-cli.svg" },
  { label: "OpenClaw", src: "/agent-logos/openclaw.svg" },
  { label: "OpenCode", src: "/agent-logos/opencode.png" },
  { label: "Qoder", src: "/agent-logos/qoder.svg" },
  { label: "Qwen Code", src: "/agent-logos/qwen-code.png" },
  { label: "Trae", src: "/agent-logos/trae.png" },
] as const;

export function getAgentIconPath(
  name: string,
  customIconPath?: string | null,
): string | null {
  return customIconPath ?? DEFAULT_AGENT_ICON_PATHS[name] ?? null;
}
