import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionTable } from "@/components/extensions/extension-table";
import type { AgentInstallIconItem } from "@/components/shared/agent-install-icon-row";
import type { GroupedExtension } from "@/lib/types";

const capturedAgentItems: AgentInstallIconItem[][] = [];

const mocks = vi.hoisted(() => {
  const buildInstallState = vi.fn();
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
  getInstallSourceInstance: vi.fn(),
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

describe("ExtensionTable agent install state", () => {
  beforeEach(() => {
    capturedAgentItems.length = 0;
    mocks.navigate.mockClear();
    mocks.buildInstallState.mockReset();
    mocks.extensionStoreState.selectedIds = new Set();
    mocks.extensionStoreState.filtered.mockImplementation(
      () => [group] as GroupedExtension[],
    );
    mocks.extensionStoreState.setSelectedId.mockClear();
    mocks.agentStoreState.agents = [
      {
        name: "claude",
        detected: true,
        extension_count: 1,
        path: "/agents/claude",
        enabled: true,
      },
    ];
    mocks.agentStoreState.agentOrder = ["claude"];
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
    ],
  };

  it("uses only global install state for the list view and keeps project-only clicks on detail", () => {
    mocks.buildInstallState.mockReturnValue({
      installed: true,
      globalInstalled: false,
      projectInstalled: true,
      globalInstances: [],
      projectInstances: [],
      listAction: "open-detail",
    });

    render(<ExtensionTable data={[group]} />);

    const items = capturedAgentItems.at(-1) ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].installed).toBe(false);
    expect(items[0].title).toContain("已安装到项目");

    items[0].onClick?.();
    expect(mocks.extensionStoreState.setSelectedId).toHaveBeenCalledWith(
      group.groupKey,
    );
  });
});
