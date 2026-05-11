import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HubDetail } from "@/components/local-hub/hub-detail";
import type { AgentInstallIconItem } from "@/components/shared/agent-install-icon-row";
import type { Extension } from "@/lib/types";

const capturedProjectPanelProps: Array<{
  projects: Array<{ path: string; exists: boolean }>;
  selectedProjectPath: string;
  selectedProjectName: string | null | undefined;
}> = [];
const capturedAgentItems: AgentInstallIconItem[][] = [];

const stores = vi.hoisted(() => {
  const hubState = {
    extensions: [
      {
        id: "hub-skill",
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
    selectedId: "hub-skill",
    setSelectedId: vi.fn(),
    deleteFromHub: vi.fn(),
    installFromHub: vi.fn(),
    extensionContent: new Map(),
    loadExtensionContent: vi.fn(),
  };
  const extensionState = {
    extensions: [] as Extension[],
    rescanAndFetch: vi.fn(),
  };
  const agentState = {
    agents: [{ name: "claude", detected: true, extension_count: 1, path: "", enabled: true }],
    agentOrder: ["claude"],
    fetch: vi.fn(),
  };
  const projectState = {
    loaded: true,
    projects: [
      {
        id: "alpha",
        name: "alpha",
        path: "/projects/alpha",
        created_at: "2026-05-09T00:00:00.000Z",
        exists: false,
      },
    ],
    loadProjects: vi.fn(),
  };
  const api = {
    getExtensionContent: vi.fn().mockResolvedValue({
      content: "",
      path: null,
      symlink_target: null,
    }),
    getSkillLocations: vi.fn().mockResolvedValue([]),
  };
  return { hubState, extensionState, agentState, projectState, api };
});

vi.mock("@/components/extensions/delete-dialog", () => ({ DeleteDialog: () => null }));
vi.mock("@/components/extensions/detail-cli-sections", () => ({ CliSections: () => null }));
vi.mock("@/components/extensions/detail-header", () => ({ DetailHeader: () => null }));
vi.mock("@/components/extensions/detail-paths", () => ({ DetailPaths: () => null }));
vi.mock("@/components/extensions/permission-detail", () => ({ PermissionDetail: () => null }));
vi.mock("@/components/extensions/skill-file-section", () => ({ SkillFileSection: () => null }));
vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: { items: AgentInstallIconItem[] }) => {
    capturedAgentItems.push(props.items);
    return null;
  },
}));
vi.mock("@/components/shared/project-install-panel", () => ({
  ProjectInstallPanel: (props: {
    projects: Array<{ path: string; exists: boolean }>;
    selectedProjectPath: string;
    selectedProjectName: string | null | undefined;
  }) => {
    capturedProjectPanelProps.push(props);
    return null;
  },
}));
vi.mock("@/lib/invoke", () => ({ api: stores.api }));
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
vi.mock("@/stores/project-store", () => ({
  useProjectStore: (selector: (state: typeof stores.projectState) => unknown) =>
    selector(stores.projectState),
}));

describe("HubDetail stale project handling", () => {
  beforeEach(() => {
    capturedProjectPanelProps.length = 0;
    capturedAgentItems.length = 0;
    stores.extensionState.extensions = [];
    stores.agentState.agents = [
      { name: "claude", detected: true, extension_count: 1, path: "", enabled: true },
    ];
    stores.agentState.agentOrder = ["claude"];
  });

  it("hides missing projects from the project install panel", async () => {
    render(<HubDetail />);

    await waitFor(() => {
      const props = capturedProjectPanelProps[capturedProjectPanelProps.length - 1];
      expect(props?.projects).toEqual([]);
      expect(props?.selectedProjectPath).toBe("");
      expect(props?.selectedProjectName ?? null).toBeNull();
    });
  });

  it("matches global installs by logical identity for the install-to-agent row", async () => {
    stores.agentState.agents = [
      { name: "claude", detected: true, extension_count: 1, path: "", enabled: true },
      { name: "codex", detected: true, extension_count: 0, path: "", enabled: true },
    ];
    stores.agentState.agentOrder = ["claude", "codex"];
    stores.extensionState.extensions = [
      {
        ...stores.hubState.extensions[0],
        id: "global-frontend-design",
        source: { origin: "agent", url: null, version: null, commit_hash: null },
        pack: null,
        agents: ["claude"],
        scope: { type: "global" as const },
      },
    ];

    render(<HubDetail />);

    await waitFor(() => {
      const items = capturedAgentItems[capturedAgentItems.length - 1] ?? [];
      expect(items.map((item) => [item.name, item.installed])).toEqual([
        ["claude", true],
        ["codex", false],
      ]);
      expect(items.some((item) => item.installed)).toBe(true);
    });
  });
});
