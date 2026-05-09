import { describe, expect, it } from "vitest";
import { buildInstallState, resolveProjectSelection } from "@/lib/install-surface";
import type { ConfigScope, Extension, Project } from "@/lib/types";

const allScope = { type: "all" } as const;
const xinsdApiScope: ConfigScope = {
  type: "project",
  name: "xinsd-api",
  path: "/Users/xinsd/Documents/vibe_coding/xinsd-api",
};
const skillsHubScope: ConfigScope = {
  type: "project",
  name: "skills-hub",
  path: "/Users/xinsd/Documents/vibe_coding/skills-hub",
};

function makeProject(name: string, path: string): Project {
  return {
    id: name,
    name,
    path,
    created_at: "2026-05-09T00:00:00.000Z",
    exists: true,
  };
}

function makeExtension(scope: ConfigScope): Extension {
  return {
    id: `${scope.type}-${scope.type === "project" ? scope.path : "global"}`,
    kind: "mcp",
    name: "chrome-devtools",
    description: "desc",
    source: {
      origin: "registry",
      url: null,
      version: null,
      commit_hash: null,
    },
    agents: ["claude"],
    tags: [],
    pack: null,
    permissions: [],
    enabled: true,
    trust_score: null,
    installed_at: "2026-05-09T00:00:00.000Z",
    updated_at: "2026-05-09T00:00:00.000Z",
    source_path: null,
    cli_parent_id: null,
    cli_meta: null,
    install_meta: null,
    scope,
  };
}

describe("extension install flow helpers", () => {
  it("defaults MCP project selection to the first installed project in project list order", () => {
    const installedInstances = [
      makeExtension(skillsHubScope),
      makeExtension(xinsdApiScope),
    ];
    const projects = [
      makeProject("xinsd-api", xinsdApiScope.path),
      makeProject("skills-hub", skillsHubScope.path),
    ];

    expect(
      resolveProjectSelection({
        contextScope: allScope,
        installedInstances,
        projects,
      }),
    ).toEqual(xinsdApiScope);
  });

  it("keeps project-only installs on the open-detail path in list mode", () => {
    const state = buildInstallState({
      agentName: "claude",
      instances: [makeExtension(xinsdApiScope)],
      surface: "extension-list",
    });

    expect(state.globalInstalled).toBe(false);
    expect(state.projectInstalled).toBe(true);
    expect(state.listAction).toBe("open-detail");
  });
});
