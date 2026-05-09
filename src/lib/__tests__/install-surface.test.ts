import { describe, expect, it } from "vitest";
import {
  buildInstallState,
  getInstallSourceInstance,
  resolveProjectSelection,
} from "@/lib/install-surface";
import type { ConfigScope, Extension, Project } from "@/lib/types";

const globalScope: ConfigScope = { type: "global" };
const alphaScope: ConfigScope = {
  type: "project",
  name: "alpha",
  path: "/projects/alpha",
};
const betaScope: ConfigScope = {
  type: "project",
  name: "beta",
  path: "/projects/beta",
};

function makeExtension(overrides: Partial<Extension>): Extension {
  return {
    id: "ext-1",
    kind: "skill",
    name: "frontend-design",
    description: "desc",
    source: {
      origin: "git",
      url: "https://github.com/acme/frontend-design.git",
      version: null,
      commit_hash: null,
    },
    agents: ["claude"],
    tags: [],
    pack: "acme/frontend-design",
    permissions: [],
    enabled: true,
    trust_score: null,
    installed_at: "2026-05-09T00:00:00.000Z",
    updated_at: "2026-05-09T00:00:00.000Z",
    source_path: null,
    cli_parent_id: null,
    cli_meta: null,
    install_meta: null,
    scope: globalScope,
    ...overrides,
  };
}

function makeProject(name: string, path: string): Project {
  return {
    id: name,
    name,
    path,
    created_at: "2026-05-09T00:00:00.000Z",
    exists: true,
  };
}

describe("resolveProjectSelection", () => {
  it("prefers the current project scope when the page already knows it", () => {
    const result = resolveProjectSelection({
      contextScope: alphaScope,
      installedInstances: [makeExtension({ id: "alpha", scope: alphaScope })],
      projects: [makeProject("alpha", "/projects/alpha")],
    });

    expect(result).toEqual(alphaScope);
  });

  it("falls back to the first project in the project list, not install order", () => {
    const result = resolveProjectSelection({
      contextScope: { type: "all" },
      installedInstances: [
        makeExtension({ id: "beta", scope: betaScope }),
        makeExtension({ id: "alpha", scope: alphaScope }),
      ],
      projects: [
        makeProject("alpha", "/projects/alpha"),
        makeProject("beta", "/projects/beta"),
      ],
    });

    expect(result).toEqual(alphaScope);
  });

  it("returns null when no installed project exists", () => {
    const result = resolveProjectSelection({
      contextScope: { type: "all" },
      installedInstances: [makeExtension({ id: "global", scope: globalScope })],
      projects: [makeProject("alpha", "/projects/alpha")],
    });

    expect(result).toBeNull();
  });
});

describe("buildInstallState", () => {
  it("treats Local Hub project-only installs as open-detail in the list", () => {
    const state = buildInstallState({
      agentName: "claude",
      instances: [makeExtension({ id: "alpha", scope: alphaScope, agents: ["claude"] })],
      surface: "local-hub",
    });

    expect(state.globalInstalled).toBe(false);
    expect(state.projectInstalled).toBe(true);
    expect(state.installed).toBe(false);
    expect(state.listAction).toBe("open-detail");
  });

  it("keeps global and project installs separate when both exist", () => {
    const state = buildInstallState({
      agentName: "claude",
      instances: [
        makeExtension({ id: "global", scope: globalScope, agents: ["claude"] }),
        makeExtension({ id: "project", scope: alphaScope, agents: ["claude"] }),
      ],
      projectScope: alphaScope,
      surface: "extension-detail",
    });

    expect(state.globalInstalled).toBe(true);
    expect(state.projectInstalled).toBe(true);
    expect(state.installed).toBe(true);
    expect(state.globalInstances.map((ext) => ext.id)).toEqual(["global"]);
    expect(state.projectInstances.map((ext) => ext.id)).toEqual(["project"]);
  });

  it("treats extension-detail project installs as installed", () => {
    const state = buildInstallState({
      agentName: "claude",
      instances: [makeExtension({ id: "alpha", scope: alphaScope, agents: ["claude"] })],
      projectScope: alphaScope,
      surface: "extension-detail",
    });

    expect(state.globalInstalled).toBe(false);
    expect(state.projectInstalled).toBe(true);
    expect(state.installed).toBe(true);
    expect(state.listAction).toBe("uninstall");
  });
});

describe("getInstallSourceInstance", () => {
  it("prefers the matching project instance, then the global instance, then the first fallback", () => {
    const instances = [
      makeExtension({ id: "global", scope: globalScope }),
      makeExtension({ id: "alpha", scope: alphaScope }),
    ];

    expect(getInstallSourceInstance(instances, alphaScope)?.id).toBe("alpha");
    expect(getInstallSourceInstance(instances, globalScope)?.id).toBe("global");
    expect(
      getInstallSourceInstance(
        [makeExtension({ id: "fallback", scope: alphaScope })],
        globalScope,
      )?.id,
    ).toBe("fallback");
  });
});
