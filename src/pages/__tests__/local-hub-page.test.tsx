import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extension } from "@/lib/types";
import LocalHubPage from "@/pages/local-hub";

const capturedHubTableData: Extension[][] = [];

function makeHubExtension(overrides: Partial<Extension>): Extension {
  return {
    id: "hub-ext",
    kind: "skill",
    name: "frontend-design",
    description: "desc",
    source: {
      origin: "git",
      url: "https://github.com/acme/frontend-design.git",
      version: null,
      commit_hash: null,
    },
    agents: [],
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
    scope: { type: "global" },
    ...overrides,
  };
}

const stores = vi.hoisted(() => ({
  hubState: {
    loading: false,
    fetch: vi.fn(),
    selectedId: null as string | null,
    setSelectedId: vi.fn(),
    importToHub: vi.fn(),
    extensions: [] as Extension[],
    kindFilter: null as Extension["kind"] | null,
    searchQuery: "",
  },
  agentState: {
    fetch: vi.fn(),
    agents: [] as Array<{
      name: string;
      detected: boolean;
      extension_count: number;
      path: string;
      enabled: boolean;
    }>,
  },
  extensionState: {
    checkUpdates: vi.fn(),
    checkingUpdates: false,
    fetch: vi.fn(),
    extensions: [] as Extension[],
    updateStatuses: new Map<string, unknown>(),
  },
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  extensionListGroupKey: vi.fn(
    (ext: Pick<Extension, "kind" | "name">) => `${ext.kind}\0${ext.name}`,
  ),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@/lib/types", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/types")>();
  return {
    ...actual,
    extensionListGroupKey: (ext: Pick<Extension, "kind" | "name">) =>
      stores.extensionListGroupKey(ext),
  };
});
vi.mock("@/components/local-hub/hub-detail", () => ({ HubDetail: () => null }));
vi.mock("@/components/local-hub/hub-filters", () => ({ HubFilters: () => null }));
vi.mock("@/components/local-hub/sync-dialog", () => ({ SyncDialog: () => null }));
vi.mock("@/components/local-hub/hub-table", () => ({
  HubTable: (props: { data: Extension[] }) => {
    capturedHubTableData.push(props.data);
    return null;
  },
}));
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (selector: (state: typeof stores.agentState) => unknown) =>
    selector(stores.agentState),
}));
vi.mock("@/stores/extension-store", () => ({
  useExtensionStore: Object.assign(
    (selector: (state: typeof stores.extensionState) => unknown) =>
      selector(stores.extensionState),
    {
      getState: () => stores.extensionState,
    },
  ),
}));
vi.mock("@/stores/hub-store", () => ({
  useHubStore: Object.assign(
    (selector: (state: typeof stores.hubState) => unknown) =>
      selector(stores.hubState),
    {
      setState: vi.fn(),
    },
  ),
}));
vi.mock("@/stores/toast-store", () => ({
  toast: stores.toast,
}));

describe("LocalHubPage asset grouping", () => {
  beforeEach(() => {
    capturedHubTableData.length = 0;
    stores.hubState.extensions = [];
    stores.hubState.selectedId = null;
    stores.hubState.kindFilter = null;
    stores.hubState.searchQuery = "";
    stores.agentState.agents = [];
    stores.extensionState.extensions = [];
    stores.extensionState.updateStatuses = new Map();
    stores.extensionState.checkingUpdates = false;
    stores.hubState.fetch.mockClear();
    stores.hubState.setSelectedId.mockClear();
    stores.hubState.importToHub.mockClear();
    stores.agentState.fetch.mockClear();
    stores.extensionState.fetch.mockClear();
    stores.extensionState.checkUpdates.mockClear();
    stores.toast.success.mockClear();
    stores.toast.error.mockClear();
    stores.extensionListGroupKey.mockClear();
  });

  it("deduplicates Local Hub skill rows by logical identity before rendering the table", () => {
    stores.hubState.extensions = [
      makeHubExtension({
        id: "hub-a",
        name: "frontend-design",
        pack: "acme/frontend-design",
      }),
      makeHubExtension({
        id: "hub-b",
        name: "frontend-design",
        source: { origin: "agent", url: null, version: null, commit_hash: null },
        pack: null,
      }),
    ];

    render(<LocalHubPage />);

    const tableData = capturedHubTableData[capturedHubTableData.length - 1] ?? [];
    expect(tableData.map((item) => item.name)).toEqual([
      "frontend-design",
    ]);
  });

  it("counts updates by logical identity when hub and installed metadata differ", async () => {
    stores.hubState.extensions = [
      makeHubExtension({
        id: "hub-frontend-design",
        source: {
          origin: "git",
          url: "https://github.com/acme/frontend-design.git",
          version: null,
          commit_hash: null,
        },
        pack: "acme/frontend-design",
      }),
    ];
    stores.extensionState.extensions = [
      makeHubExtension({
        id: "installed-frontend-design",
        source: { origin: "agent", url: null, version: null, commit_hash: null },
        pack: null,
      }),
    ];
    stores.extensionState.updateStatuses = new Map([
      ["installed-frontend-design", { status: "update_available" }],
    ]);

    render(<LocalHubPage />);
    fireEvent.click(screen.getByRole("button", { name: /check updates/i }));

    await waitFor(() => {
      expect(stores.extensionListGroupKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "hub-frontend-design" }),
      );
      expect(stores.extensionListGroupKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "installed-frontend-design" }),
      );
      expect(stores.toast.success).toHaveBeenCalledWith(
        "1 个 Local Hub 资产有可用更新",
      );
    });
  });
});
