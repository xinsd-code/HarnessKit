import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ExtensionsPage from "@/pages/extensions";

const capturedScopes: Array<
  { type: "global" } | { type: "project"; name: string; path: string } | null
> = [];

const mocks = vi.hoisted(() => {
  const extensionStoreState = {
    selectedId: "group-1",
    setSelectedId: vi.fn(),
    setAgentFilter: vi.fn(),
    setKindFilter: vi.fn(),
    setSearchQuery: vi.fn(),
    setPackFilter: vi.fn(),
    grouped: vi.fn(() => [
      {
        groupKey: "group-1",
        name: "chrome-devtools",
        kind: "mcp" as const,
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
          {
            id: "ext-1",
            kind: "mcp" as const,
            name: "chrome-devtools",
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
            source_path: null,
            cli_parent_id: null,
            cli_meta: null,
            install_meta: null,
            scope: {
              type: "project" as const,
              name: "alpha",
              path: "/projects/alpha",
            },
          },
        ],
      },
    ]),
    filtered: vi.fn(() => []),
    selectedIds: new Set<string>(),
    batchToggle: vi.fn(),
    clearSelection: vi.fn(),
    checkUpdates: vi.fn(),
    checkingUpdates: false,
    updateAll: vi.fn(),
    updatingAll: false,
    updateStatuses: new Map<string, unknown>(),
    newRepoSkills: [],
    installNewRepoSkills: vi.fn(),
    loading: false,
    fetch: vi.fn(),
    extensions: [
      {
        id: "ext-1",
        kind: "mcp" as const,
        name: "chrome-devtools",
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
        source_path: null,
        cli_parent_id: null,
        cli_meta: null,
        install_meta: null,
        scope: {
          type: "project" as const,
          name: "alpha",
          path: "/projects/alpha",
        },
      },
    ],
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
    fetch: vi.fn(),
  };

  const scopeStoreState = {
    hydrated: true,
  };

  const searchParams = new URLSearchParams();
  const setSearchParams = vi.fn();
  const navigate = vi.fn();

  let currentScope: { type: "project"; name: string; path: string } | { type: "all" } = {
    type: "project",
    name: "alpha",
    path: "/projects/alpha",
  };
  let clearRequested = false;
  const setScope = vi.fn((next: typeof currentScope) => {
    currentScope = next;
  });

  return {
    extensionStoreState,
    agentStoreState,
    scopeStoreState,
    searchParams,
    setSearchParams,
    navigate,
    getScope: () => currentScope,
    getClearRequested: () => clearRequested,
    setClearRequested: (value: boolean) => {
      clearRequested = value;
    },
    setScope,
  };
});

vi.mock("@/components/extensions/extension-filters", () => ({
  ExtensionFilters: () => null,
}));
vi.mock("@/components/extensions/extension-table", () => ({
  ExtensionTable: () => null,
}));
vi.mock("@/components/extensions/new-skills-dialog", () => ({
  NewSkillsDialog: () => null,
}));
vi.mock("@/components/extensions/extension-detail", () => ({
  ExtensionDetail: (props: {
    installProjectScope:
      | { type: "project"; name: string; path: string }
      | { type: "global" }
      | null;
    onInstallProjectScopeChange: (scope: unknown) => void;
  }) => {
    capturedScopes.push(props.installProjectScope);
    useEffect(() => {
      if (props.installProjectScope?.type === "project" && !mocks.getClearRequested()) {
        mocks.setClearRequested(true);
        props.onInstallProjectScopeChange(null);
      }
    }, [props.installProjectScope, props.onInstallProjectScopeChange]);
    return null;
  },
}));
vi.mock("@/hooks/use-scope", () => ({
  useScope: () => ({
    scope: mocks.getScope(),
    setScope: mocks.setScope,
  }),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [mocks.searchParams, mocks.setSearchParams] as const,
  };
});
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (
    selector: (state: typeof mocks.agentStoreState) => unknown,
  ) => selector(mocks.agentStoreState),
}));
vi.mock("@/stores/extension-store", () => ({
  useExtensionStore: Object.assign(
    (
      selector: (state: typeof mocks.extensionStoreState) => unknown,
    ) => selector(mocks.extensionStoreState),
    {
      setState: vi.fn(),
      getState: () => mocks.extensionStoreState,
    },
  ),
}));
vi.mock("@/stores/scope-store", () => ({
  useScopeStore: (
    selector: (state: typeof mocks.scopeStoreState) => unknown,
  ) => selector(mocks.scopeStoreState),
}));
vi.mock("@/stores/toast-store", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  capturedScopes.length = 0;
  mocks.setClearRequested(false);
  mocks.extensionStoreState.selectedId = "group-1";
  mocks.extensionStoreState.filtered.mockReturnValue([]);
  mocks.setSearchParams.mockClear();
  mocks.setScope.mockClear();
  mocks.navigate.mockClear();
  mocks.agentStoreState.fetch.mockClear();
  mocks.extensionStoreState.fetch.mockClear();
  mocks.extensionStoreState.setSelectedId.mockClear();
  mocks.extensionStoreState.setAgentFilter.mockClear();
  mocks.extensionStoreState.setKindFilter.mockClear();
  mocks.extensionStoreState.setSearchQuery.mockClear();
  mocks.extensionStoreState.setPackFilter.mockClear();
  mocks.extensionStoreState.checkUpdates.mockClear();
  mocks.extensionStoreState.updateAll.mockClear();
  mocks.extensionStoreState.installNewRepoSkills.mockClear();
  mocks.extensionStoreState.batchToggle.mockClear();
  mocks.extensionStoreState.clearSelection.mockClear();
  mocks.extensionStoreState.grouped.mockClear();
});

describe("ExtensionsPage project scope recovery", () => {
  it("does not reintroduce a stale project scope after the detail panel clears it", async () => {
    render(<ExtensionsPage />);

    await waitFor(() => {
      expect(capturedScopes).toContainEqual({
        type: "project",
        name: "alpha",
        path: "/projects/alpha",
      });
      expect(capturedScopes[capturedScopes.length - 1]).toBeNull();
    });
  });
});
