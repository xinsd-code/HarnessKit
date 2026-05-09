import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HubTable } from "@/components/local-hub/hub-table";
import type { AgentInstallIconItem } from "@/components/shared/agent-install-icon-row";

const capturedAgentItems: AgentInstallIconItem[][] = [];

const stores = vi.hoisted(() => {
  const hubState = {
    selectedId: null as string | null,
    setSelectedId: vi.fn(),
  };
  const extensionState = {
    extensions: [
      {
        id: "project-instance",
        kind: "skill" as const,
        name: "frontend-design",
        description: "desc",
        source: {
          origin: "git" as const,
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
        scope: {
          type: "project" as const,
          name: "alpha",
          path: "/projects/alpha",
        },
      },
    ],
    rescanAndFetch: vi.fn(),
  };
  const agentState = {
    agents: [{ name: "claude", detected: true, extension_count: 1, path: "", enabled: true }],
    agentOrder: ["claude"],
  };
  return { hubState, extensionState, agentState };
});

vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: { items: AgentInstallIconItem[] }) => {
    capturedAgentItems.push(props.items);
    return null;
  },
}));
vi.mock("@/components/shared/kind-badge", () => ({ KindBadge: () => null }));
vi.mock("@/components/shared/permission-tags", () => ({ PermissionTags: () => null }));
vi.mock("@/components/shared/trust-badge", () => ({ TrustBadge: () => null }));
vi.mock("@/lib/invoke", () => ({ api: { deleteExtension: vi.fn() } }));
vi.mock("@/stores/agent-store", () => ({
  useAgentStore: (selector: (state: typeof stores.agentState) => unknown) =>
    selector(stores.agentState),
}));
vi.mock("@/stores/extension-store", () => ({
  useExtensionStore: (selector: (state: typeof stores.extensionState) => unknown) =>
    selector(stores.extensionState),
}));
vi.mock("@/stores/hub-store", () => ({
  useHubStore: (selector: (state: typeof stores.hubState) => unknown) =>
    selector(stores.hubState),
}));
vi.mock("@/stores/toast-store", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("HubTable local hub install state", () => {
  beforeEach(() => {
    capturedAgentItems.length = 0;
    stores.hubState.selectedId = null;
    stores.hubState.setSelectedId.mockClear();
  });

  it("treats project-only installs as open-detail without marking them installed", () => {
    render(
      <HubTable
        data={[
          {
            id: "hub-skill",
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
            scope: {
              type: "global",
            },
          },
        ]}
      />,
    );

    const items = capturedAgentItems.at(-1) ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].installed).toBe(false);
    expect(items[0].title).toContain("已安装到项目");

    items[0].onClick?.();
    expect(stores.hubState.setSelectedId).toHaveBeenCalledWith("hub-skill");
  });
});
