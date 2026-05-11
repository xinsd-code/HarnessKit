import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionDetail } from "@/components/extensions/extension-detail";
import type { AgentInstallIconItem } from "@/components/shared/agent-install-icon-row";
import type { ConfigScope, Extension, Project } from "@/lib/types";

const capturedAgentItems: AgentInstallIconItem[][] = [];
const capturedProjectPanels: Array<{
  agentItems: AgentInstallIconItem[];
  projects: Project[];
  selectedProjectPath: string;
}> = [];

const mocks = vi.hoisted(() => {
  const extensionStoreState = {
    grouped: vi.fn(() => [] as unknown[]),
    selectedId: null as string | null,
    toggle: vi.fn(),
    updateStatuses: new Map<string, unknown>(),
    updateExtension: vi.fn(),
    updatePack: vi.fn(),
    installToAgent: vi.fn(),
    installToProject: vi.fn(),
    deleteFromAgents: vi.fn(),
    rescanAndFetch: vi.fn(),
    extensions: [] as unknown[],
  };
  const agentStoreState: {
    agents: unknown[];
    agentOrder: readonly string[];
  } = {
    agents: [],
    agentOrder: [],
  };
  const projectStoreState: {
    projects: Array<{
      id: string;
      name: string;
      path: string;
      created_at: string;
      exists: boolean;
    }>;
  } = {
    projects: [],
  };
  const hubStoreState = {
    backupToHub: vi.fn(),
  };
  const api = {
    getExtensionContent: vi.fn(),
    getSkillLocations: vi.fn(),
    deleteExtension: vi.fn(),
  };
  return {
    extensionStoreState,
    agentStoreState,
    projectStoreState,
    hubStoreState,
    api,
  };
});

vi.mock("@/components/extensions/detail-cli-sections", () => ({
  CliSections: () => null,
}));
vi.mock("@/components/extensions/detail-header", () => ({
  DetailHeader: () => null,
}));
vi.mock("@/components/extensions/detail-paths", () => ({
  DetailPaths: () => null,
}));
vi.mock("@/components/extensions/permission-detail", () => ({
  PermissionDetail: () => null,
}));
vi.mock("@/components/extensions/skill-file-section", () => ({
  SkillFileSection: () => null,
}));
vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: { items: AgentInstallIconItem[] }) => {
    capturedAgentItems.push(props.items);
    return null;
  },
}));
vi.mock("@/components/shared/project-install-panel", () => ({
  ProjectInstallPanel: (props: {
    agentItems: AgentInstallIconItem[];
    projects: Project[];
    selectedProjectPath: string;
  }) => {
    capturedProjectPanels.push({
      agentItems: props.agentItems,
      projects: props.projects,
      selectedProjectPath: props.selectedProjectPath,
    });
    return null;
  },
}));
vi.mock("@/lib/invoke", () => ({
  api: mocks.api,
}));
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (selector: (state: typeof mocks.agentStoreState) => unknown) =>
    selector(mocks.agentStoreState),
}));
vi.mock("@/stores/extension-store", () => ({
  useExtensionStore: (
    selector: (state: typeof mocks.extensionStoreState) => unknown,
  ) => selector(mocks.extensionStoreState),
}));
vi.mock("@/stores/hub-store", () => ({
  useHubStore: {
    getState: () => mocks.hubStoreState,
  },
}));
vi.mock("@/stores/project-store", () => ({
  useProjectStore: (
    selector: (state: typeof mocks.projectStoreState) => unknown,
  ) => selector(mocks.projectStoreState),
}));

const projectScope = {
  type: "project" as const,
  name: "alpha",
  path: "/projects/alpha",
};

function makeExtension(overrides: {
  id: string;
  name?: string;
  agents: string[];
  scope: ConfigScope;
}): Extension {
  return {
    id: overrides.id,
    kind: "skill",
    name: overrides.name ?? "frontend-design",
    description: "desc",
    source: {
      origin: "registry",
      url: null,
      version: null,
      commit_hash: null,
    },
    agents: overrides.agents,
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
    scope: overrides.scope,
  };
}

const group = {
  groupKey: "skill\0frontend-design",
  name: "frontend-design",
  kind: "skill" as const,
  description: "desc",
  source: {
    origin: "registry" as const,
    url: null,
    version: null,
    commit_hash: null,
  },
  agents: [],
  tags: [],
  pack: null,
  permissions: [],
  enabled: true,
  trust_score: null,
  installed_at: "2026-05-09T00:00:00.000Z",
  updated_at: "2026-05-09T00:00:00.000Z",
  instances: [
    makeExtension({
      id: "project-frontend-design",
      agents: ["claude"],
      scope: projectScope,
    }),
    makeExtension({
      id: "global-frontend-design",
      agents: ["codex"],
      scope: { type: "global" },
    }),
  ],
};

const groupWithClaudeGlobal = {
  ...group,
  instances: [
    ...group.instances,
    makeExtension({
      id: "global-frontend-design-claude",
      agents: ["claude"],
      scope: { type: "global" },
    }),
  ],
};

const otherGroup = {
  ...group,
  groupKey: "skill\0design-system",
  name: "design-system",
  instances: [
    makeExtension({
      id: "other-global-design-system",
      name: "design-system",
      agents: ["codex"],
      scope: { type: "global" },
    }),
  ],
};

beforeEach(() => {
  localStorage.clear();
  capturedAgentItems.length = 0;
  capturedProjectPanels.length = 0;
  mocks.extensionStoreState.grouped = vi.fn(() => [group]);
  mocks.extensionStoreState.selectedId = group.groupKey;
  mocks.extensionStoreState.extensions = group.instances;
  mocks.agentStoreState.agents = [];
  mocks.agentStoreState.agentOrder = [];
  mocks.projectStoreState.projects = [
    {
      id: "alpha",
      name: "alpha",
      path: projectScope.path,
      created_at: "2026-05-09T00:00:00.000Z",
      exists: false,
    },
  ];
  vi.mocked(mocks.api.getExtensionContent).mockResolvedValue({
    content: "",
    path: null,
    symlink_target: null,
  });
  vi.mocked(mocks.api.getSkillLocations).mockResolvedValue([]);
  vi.mocked(mocks.api.deleteExtension).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ExtensionDetail project scope recovery", () => {
  it("clears a stale project scope when the project no longer exists", async () => {
    const onInstallProjectScopeChange = vi.fn();

    render(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={onInstallProjectScopeChange}
      />,
    );

    await waitFor(() => {
      expect(onInstallProjectScopeChange).toHaveBeenCalledWith(null);
    });
  });
});

describe("ExtensionDetail agent install state", () => {
  it("highlights only global installs in Install to Agent and project installs in the project panel", async () => {
    mocks.agentStoreState.agents = [
      {
        name: "claude",
        detected: true,
        extension_count: 1,
        path: "/agents/claude",
        enabled: true,
      },
      {
        name: "codex",
        detected: true,
        extension_count: 1,
        path: "/agents/codex",
        enabled: true,
      },
    ];
    mocks.agentStoreState.agentOrder = ["claude", "codex"];
    mocks.projectStoreState.projects = [
      {
        id: "alpha",
        name: "alpha",
        path: projectScope.path,
        created_at: "2026-05-09T00:00:00.000Z",
        exists: true,
      },
    ];

    render(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(items.map((item) => [item.name, item.installed])).toEqual([
        ["claude", false],
        ["codex", true],
      ]);
    });
    const panel = capturedProjectPanels[capturedProjectPanels.length - 1];
    expect(
      panel?.agentItems.map((item: AgentInstallIconItem) => [
        item.name,
        item.installed,
      ]),
    ).toEqual([
      ["claude", true],
      ["codex", false],
    ]);
  });

  it("recomputes Insert to Agent from global installs when the detail is reopened", async () => {
    mocks.agentStoreState.agents = [
      {
        name: "claude",
        detected: true,
        extension_count: 1,
        path: "/agents/claude",
        enabled: true,
      },
      {
        name: "codex",
        detected: true,
        extension_count: 1,
        path: "/agents/codex",
        enabled: true,
      },
    ];
    mocks.agentStoreState.agentOrder = ["claude", "codex"];
    mocks.projectStoreState.projects = [
      {
        id: "alpha",
        name: "alpha",
        path: projectScope.path,
        created_at: "2026-05-09T00:00:00.000Z",
        exists: true,
      },
    ];

    const onInstallProjectScopeChange = vi.fn();
    const firstRender = render(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={onInstallProjectScopeChange}
      />,
    );

    await waitFor(() => {
      const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(items.map((item) => [item.name, item.installed])).toEqual([
        ["claude", false],
        ["codex", true],
      ]);
    });

    firstRender.unmount();
    capturedAgentItems.length = 0;
    capturedProjectPanels.length = 0;
    mocks.extensionStoreState.grouped = vi.fn(() => [groupWithClaudeGlobal]);
    mocks.extensionStoreState.extensions = groupWithClaudeGlobal.instances;

    render(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={onInstallProjectScopeChange}
      />,
    );

    await waitFor(() => {
      const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(items.map((item) => [item.name, item.installed])).toEqual([
        ["claude", true],
        ["codex", true],
      ]);
    });
    const panel = capturedProjectPanels[capturedProjectPanels.length - 1];
    expect(
      panel?.agentItems.map((item: AgentInstallIconItem) => [
        item.name,
        item.installed,
      ]),
    ).toEqual([
      ["claude", true],
      ["codex", false],
    ]);
  });

  it("clears pending agent state when switching to another group", async () => {
    mocks.agentStoreState.agents = [
      {
        name: "claude",
        detected: true,
        extension_count: 1,
        path: "/agents/claude",
        enabled: true,
      },
      {
        name: "codex",
        detected: true,
        extension_count: 1,
        path: "/agents/codex",
        enabled: true,
      },
    ];
    mocks.agentStoreState.agentOrder = ["claude", "codex"];
    mocks.projectStoreState.projects = [
      {
        id: "alpha",
        name: "alpha",
        path: projectScope.path,
        created_at: "2026-05-09T00:00:00.000Z",
        exists: true,
      },
    ];
    mocks.extensionStoreState.grouped = vi.fn(() => [group, otherGroup]);

    let resolveInstall: (() => void) | undefined;
    mocks.extensionStoreState.installToAgent.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveInstall = resolve;
        }),
    );

    const view = render(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(items.map((item) => [item.name, item.installed])).toEqual([
        ["claude", false],
        ["codex", true],
      ]);
    });

    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    items[0].onClick?.();

    await waitFor(() => {
      const pendingItems = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(pendingItems.find((item) => item.name === "claude")?.pending).toBe(
        true,
      );
    });

    mocks.extensionStoreState.selectedId = otherGroup.groupKey;
    view.rerender(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      const rerenderedItems = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(rerenderedItems.every((item) => !item.pending)).toBe(true);
    });

    resolveInstall?.();
  });
});

describe("ExtensionDetail delete flow", () => {
  it("deletes only the selected global instance instead of every instance for the same agent", async () => {
    mocks.extensionStoreState.grouped = vi.fn(() => [groupWithClaudeGlobal]);
    mocks.extensionStoreState.extensions = groupWithClaudeGlobal.instances;
    vi.mocked(mocks.api.getExtensionContent).mockImplementation(
      async (instanceId: string) => {
        const paths: Record<string, string> = {
          "project-frontend-design":
            "/projects/alpha/.claude/skills/frontend-design/SKILL.md",
          "global-frontend-design":
            "/Users/test/.codex/skills/frontend-design/SKILL.md",
          "global-frontend-design-claude":
            "/Users/test/.claude/skills/frontend-design/SKILL.md",
        };
        return {
          content: "",
          path: paths[instanceId] ?? null,
          symlink_target: null,
        };
      },
    );

    render(
      <ExtensionDetail
        installProjectScope={projectScope}
        onInstallProjectScopeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete..." }));

    const globalClaudeCheckbox = await screen.findByRole("checkbox", {
      name: /\/Users\/test\/\.claude\/skills\/frontend-design\/SKILL\.md/,
    });
    fireEvent.click(globalClaudeCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Remove 1 item" }));

    await waitFor(() => {
      expect(mocks.api.deleteExtension).toHaveBeenCalledWith(
        "global-frontend-design-claude",
      );
    });
    expect(mocks.api.deleteExtension).toHaveBeenCalledTimes(1);
    expect(mocks.api.deleteExtension).not.toHaveBeenCalledWith(
      "project-frontend-design",
    );
    expect(mocks.extensionStoreState.deleteFromAgents).not.toHaveBeenCalled();
  });
});
