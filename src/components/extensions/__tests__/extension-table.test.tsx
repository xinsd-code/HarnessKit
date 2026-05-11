import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionTable } from "@/components/extensions/extension-table";
import type { AgentInstallIconItem } from "@/components/shared/agent-install-icon-row";
import { api } from "@/lib/invoke";
import type { GroupedExtension } from "@/lib/types";

const capturedAgentItems: AgentInstallIconItem[][] = [];

const mocks = vi.hoisted(() => {
  const buildInstallState = vi.fn();
  const getInstallSourceInstance = vi.fn();
  const navigate = vi.fn();
  const extensionStoreState = {
    selectedIds: new Set<string>(),
    filtered: vi.fn(() => [] as GroupedExtension[]),
    updateStatuses: new Map<string, unknown>(),
    selectAll: vi.fn(),
    clearSelection: vi.fn(),
    toggleSelected: vi.fn(),
    toggle: vi.fn(),
    setSelectedId: vi.fn(),
    installToAgent: vi.fn(),
    deleteFromAgents: vi.fn(),
    rescanAndFetch: vi.fn(),
    extensions: [] as unknown[],
  };
  const agentStoreState = {
    agents: [] as Array<{
      name: string;
      detected: boolean;
      extension_count: number;
      path: string;
      enabled: boolean;
    }>,
    agentOrder: [] as readonly string[],
  };
  const useScopeState = {
    scope: { type: "all" as const },
    scopeId: "all",
    isAll: true,
    setScope: vi.fn(),
  };

  return {
    buildInstallState,
    getInstallSourceInstance,
    navigate,
    extensionStoreState,
    agentStoreState,
    useScopeState,
  };
});

vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: { items: AgentInstallIconItem[] }) => {
    capturedAgentItems.push(props.items);
    return null;
  },
}));
vi.mock("@/hooks/use-scope", () => ({
  useScope: () => mocks.useScopeState,
}));
vi.mock("@/lib/install-surface", () => ({
  buildInstallState: (...args: unknown[]) => mocks.buildInstallState(...args),
  getInstallSourceInstance: (...args: unknown[]) =>
    mocks.getInstallSourceInstance(...args),
  resolveProjectSelection: vi.fn(),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
  };
});
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (
    selector: (state: typeof mocks.agentStoreState) => unknown,
  ) => selector(mocks.agentStoreState),
}));
vi.mock("@/stores/extension-store", () => {
  const store = (selector: (state: typeof mocks.extensionStoreState) => unknown) =>
    selector(mocks.extensionStoreState);
  return {
    useExtensionStore: Object.assign(store, {
      getState: () => mocks.extensionStoreState,
    }),
  };
});
vi.mock("@/stores/toast-store", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/invoke", () => ({
  api: {
    deleteExtension: vi.fn(),
    uninstallCliBinary: vi.fn(),
  },
}));

describe("ExtensionTable agent install state", () => {
  beforeEach(() => {
    capturedAgentItems.length = 0;
    mocks.navigate.mockClear();
    mocks.buildInstallState.mockReset();
    mocks.getInstallSourceInstance.mockReset();
    mocks.extensionStoreState.selectedIds = new Set();
    mocks.extensionStoreState.filtered.mockImplementation(
      () => [group] as GroupedExtension[],
    );
    mocks.extensionStoreState.setSelectedId.mockClear();
    mocks.extensionStoreState.installToAgent.mockClear();
    mocks.extensionStoreState.deleteFromAgents.mockClear();
    mocks.extensionStoreState.rescanAndFetch.mockClear();
    vi.mocked(api.deleteExtension).mockReset();
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
  });

  const group: GroupedExtension = {
    groupKey: "mcp\0chrome-devtools\0/projects/alpha",
    name: "chrome-devtools",
    kind: "mcp",
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
    instances: [
      {
        id: "ext-alpha",
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
        scope: {
          type: "project",
          name: "alpha",
          path: "/projects/alpha",
        },
      },
      {
        id: "ext-global",
        kind: "mcp",
        name: "chrome-devtools",
        description: "desc",
        source: {
          origin: "registry",
          url: null,
          version: null,
          commit_hash: null,
        },
        agents: ["codex"],
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
        scope: { type: "global" },
      },
    ],
  };

  it("uses complete grouped instances and installs project-only entries to global scope", async () => {
    mocks.buildInstallState.mockImplementation(
      ({ agentName }: { agentName: string }) =>
        agentName === "claude"
          ? {
              installed: true,
              globalInstalled: false,
              projectInstalled: true,
              globalInstances: [],
              projectInstances: [group.instances[0]],
              listAction: "install",
            }
          : {
              installed: true,
              globalInstalled: true,
              projectInstalled: false,
              globalInstances: [group.instances[1]],
              projectInstances: [],
              listAction: "uninstall",
            },
    );
    mocks.getInstallSourceInstance.mockReturnValue(group.instances[1]);

    render(<ExtensionTable data={[group]} />);

    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    expect(mocks.buildInstallState).toHaveBeenCalledWith(
      expect.objectContaining({
        agentName: "claude",
        instances: group.instances,
        surface: "extension-list",
      }),
    );
    expect(items.map((item) => [item.name, item.installed])).toEqual([
      ["claude", false],
      ["codex", true],
    ]);
    expect(items[0].title).toContain("点击添加全局安装");

    await act(async () => {
      items[0].onClick?.();
    });
    await waitFor(() => {
      expect(mocks.extensionStoreState.installToAgent).toHaveBeenCalledWith(
        group.instances[1].id,
        "claude",
      );
    });
    expect(mocks.extensionStoreState.setSelectedId).not.toHaveBeenCalled();
  });

  it("removes only global instances when an agent has both global and project installs", async () => {
    const sharedAgentGroup: GroupedExtension = {
      ...group,
      instances: [
        {
          ...group.instances[0],
          id: "project-claude",
          agents: ["claude"],
        },
        {
          ...group.instances[1],
          id: "global-claude",
          agents: ["claude"],
        },
      ],
    };

    mocks.extensionStoreState.filtered.mockImplementation(
      () => [sharedAgentGroup] as GroupedExtension[],
    );
    mocks.buildInstallState.mockImplementation(
      ({ agentName }: { agentName: string }) =>
        agentName === "claude"
          ? {
              installed: true,
              globalInstalled: true,
              projectInstalled: true,
              globalInstances: [sharedAgentGroup.instances[1]],
              projectInstances: [sharedAgentGroup.instances[0]],
              listAction: "uninstall",
            }
          : {
              installed: false,
              globalInstalled: false,
              projectInstalled: false,
              globalInstances: [],
              projectInstances: [],
              listAction: "install",
            },
    );

    render(<ExtensionTable data={[sharedAgentGroup]} />);

    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    expect(items[0].installed).toBe(true);
    expect(items[0].title).toContain("点击移除全局安装");

    await act(async () => {
      items[0].onClick?.();
    });

    await waitFor(() => {
      expect(api.deleteExtension).toHaveBeenCalledWith("global-claude");
    });
    expect(api.deleteExtension).toHaveBeenCalledTimes(1);
    expect(mocks.extensionStoreState.deleteFromAgents).not.toHaveBeenCalled();
    expect(mocks.extensionStoreState.rescanAndFetch).toHaveBeenCalledTimes(1);
  });
});
