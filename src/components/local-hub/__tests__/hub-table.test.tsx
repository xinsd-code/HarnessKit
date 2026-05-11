import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extension } from "@/lib/types";
import { HubTable } from "@/components/local-hub/hub-table";
import type { AgentInstallIconItem } from "@/components/shared/agent-install-icon-row";
import { api } from "@/lib/invoke";

const capturedAgentItems: AgentInstallIconItem[][] = [];

const stores = vi.hoisted(() => {
  const hubState = {
    selectedId: null as string | null,
    setSelectedId: vi.fn(),
    installFromHub: vi.fn(),
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
      } as Extension,
    ] as Extension[],
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
    stores.hubState.installFromHub.mockReset();
    stores.hubState.installFromHub.mockResolvedValue(undefined);
    vi.mocked(api.deleteExtension).mockReset();
    stores.extensionState.rescanAndFetch.mockClear();
    stores.extensionState.extensions = [
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
    ];
    stores.agentState.agents = [
      { name: "claude", detected: true, extension_count: 1, path: "", enabled: true },
    ];
    stores.agentState.agentOrder = ["claude"];
  });

  it("installs project-only entries to global scope without opening detail", async () => {
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

    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].installed).toBe(false);
    expect(items[0].title).toContain("安装到全局");

    await act(async () => {
      items[0].onClick?.();
    });
    await waitFor(() => {
      expect(stores.hubState.installFromHub).toHaveBeenCalledWith(
        "hub-skill",
        "claude",
        { type: "global" },
        false,
      );
    });
    expect(stores.hubState.setSelectedId).not.toHaveBeenCalled();
  });

  it("matches Local Hub installs by logical identity for global Agent icons", () => {
    stores.agentState.agents = [
      { name: "claude", detected: true, extension_count: 1, path: "", enabled: true },
      { name: "codex", detected: true, extension_count: 1, path: "", enabled: true },
    ];
    stores.agentState.agentOrder = ["claude", "codex"];
    stores.extensionState.extensions = [
      {
        ...stores.extensionState.extensions[0],
        id: "global-agent-browser",
        name: "agent-browser",
        source: { origin: "agent", url: null, version: null, commit_hash: null },
        pack: null,
        agents: ["codex"],
        scope: { type: "global" as const },
      },
    ];

    render(
      <HubTable
        data={[
          {
            id: "hub-agent-browser",
            kind: "skill",
            name: "agent-browser",
            description: "desc",
            source: {
              origin: "git",
              url: "https://github.com/vercel-labs/agent-browser.git",
              version: null,
              commit_hash: null,
            },
            agents: [],
            tags: [],
            pack: "vercel-labs/agent-browser",
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
        ]}
      />,
    );

    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    expect(items.map((item) => [item.name, item.installed])).toEqual([
      ["claude", false],
      ["codex", true],
    ]);
  });

  it("shows remove-global title and deletes only global instances when globally installed", async () => {
    stores.extensionState.extensions = [
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
      {
        id: "global-instance",
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
        scope: { type: "global" as const },
      },
    ];

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
          },
        ]}
      />,
    );

    const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
    expect(items).toHaveLength(1);
    expect(items[0].installed).toBe(true);
    expect(items[0].title).toContain("点击移除全局安装");

    await act(async () => {
      items[0].onClick?.();
    });

    await waitFor(() => {
      expect(api.deleteExtension).toHaveBeenCalledWith("global-instance");
    });
    expect(api.deleteExtension).toHaveBeenCalledTimes(1);
    expect(stores.hubState.installFromHub).not.toHaveBeenCalled();
    expect(stores.extensionState.rescanAndFetch).toHaveBeenCalledTimes(1);
  });
});
