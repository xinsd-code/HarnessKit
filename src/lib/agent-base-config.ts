import rawConfigs from "./agent-base-config.json";

export interface AgentBaseConfigProfile {
  id: string;
  label: string;
  iconPath: string | null;
  globalSkillsPath: string;
  projectSkillsPath: string;
  mcpConfigPath: string | null;
  hooksConfigPath: string | null;
}

export const AGENT_BASE_CONFIGS = rawConfigs as AgentBaseConfigProfile[];

function trimLeadingPathMarker(path: string): string {
  return path.replace(/^\.?\//, "");
}

export function buildHomeRelativePath(relativePath: string): string {
  return `~/${trimLeadingPathMarker(relativePath)}`;
}

export function buildProjectRelativePath(
  projectPath: string,
  relativePath: string,
): string {
  return `${projectPath}/${trimLeadingPathMarker(relativePath)}`;
}

export function deriveAgentBasePath(config: AgentBaseConfigProfile): string {
  const normalized = trimLeadingPathMarker(config.globalSkillsPath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return `~/${normalized}`;
  }
  return `~/${segments.slice(0, -1).join("/")}`;
}
