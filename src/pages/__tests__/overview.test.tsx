import { render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Extension } from "@/lib/types";
import OverviewPage from "@/pages/overview";

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

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  agentState: {
    agents: [] as Array<{
      name: string;
      detected: boolean;
      extension_count: number;
      path: string;
      enabled: boolean;
    }>,
    fetch: vi.fn(() => Promise.resolve()),
    agentOrder: [] as readonly string[],
  },
  auditState: {
    results: [],
    loadCached: vi.fn(),
    runAudit: vi.fn(() => Promise.resolve()),
  },
  extensionState: {
    extensions: [
      makeExtension({
        id: "installed-skill",
        kind: "skill",
        name: "installed-skill",
      }),
    ],
    hasFetched: true,
    checkUpdates: vi.fn(() => Promise.resolve()),
    checkingUpdates: false,
    updateStatuses: new Map<string, { status: string }>(),
    grouped: vi.fn(() => []),
  },
  hubState: {
    extensions: [] as Extension[],
    hasFetched: true,
    fetch: vi.fn(() => Promise.resolve()),
  },
  projectState: {
    projects: [
      {
        id: "project-1",
        name: "alpha-project",
        path: "/workspace/alpha-project",
        exists: true,
      },
    ],
    loaded: true,
    loading: false,
    loadProjects: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("@/components/shared/agent-card", () => ({
  AgentCard: () => null,
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
  useAgentStore: (selector: (state: typeof mocks.agentState) => unknown) =>
    selector(mocks.agentState),
}));
vi.mock("@/stores/audit-store", () => ({
  useAuditStore: (selector: (state: typeof mocks.auditState) => unknown) =>
    selector(mocks.auditState),
}));
vi.mock("@/stores/extension-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/stores/extension-store")>();
  return {
    ...actual,
    useExtensionStore: Object.assign(
      (selector: (state: typeof mocks.extensionState) => unknown) =>
        selector(mocks.extensionState),
      {
        getState: () => mocks.extensionState,
      },
    ),
  };
});
vi.mock("@/stores/hub-store", () => ({
  useHubStore: (selector: (state: typeof mocks.hubState) => unknown) =>
    selector(mocks.hubState),
}));
vi.mock("@/stores/project-store", () => ({
  useProjectStore: (selector: (state: typeof mocks.projectState) => unknown) =>
    selector(mocks.projectState),
}));
vi.mock("@/stores/toast-store", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  mocks.navigate.mockClear();
  mocks.agentState.fetch.mockClear();
  mocks.auditState.loadCached.mockClear();
  mocks.auditState.runAudit.mockClear();
  mocks.extensionState.checkUpdates.mockClear();
  mocks.extensionState.grouped.mockClear();
  mocks.projectState.loadProjects.mockClear();
  mocks.hubState.fetch.mockClear();
  mocks.hubState.extensions = [
    makeExtension({
      id: "hub-skill-a",
      kind: "skill",
      name: "frontend-design",
      pack: "acme/frontend-design",
    }),
    makeExtension({
      id: "hub-skill-b",
      kind: "skill",
      name: "frontend-design",
      source: { origin: "agent", url: null, version: null, commit_hash: null },
      pack: null,
    }),
    makeExtension({
      id: "hub-skill-c",
      kind: "skill",
      name: "code-review",
      pack: "acme/code-review",
    }),
    makeExtension({
      id: "hub-mcp",
      kind: "mcp",
      name: "chrome-devtools",
      pack: "acme/chrome-devtools",
    }),
    makeExtension({
      id: "hub-plugin",
      kind: "plugin",
      name: "browser-use",
      pack: "acme/browser-use",
    }),
    makeExtension({
      id: "hub-hook",
      kind: "hook",
      name: "post:.*:notify",
      pack: null,
    }),
    makeExtension({
      id: "hub-cli",
      kind: "cli",
      name: "gh",
      pack: null,
    }),
  ];
});

describe("OverviewPage", () => {
  it("renders the Overview title and pure statistics sections", async () => {
    render(<OverviewPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Overview" })).toBeTruthy();
    });

    expect(screen.queryByText("hk status")).toBeNull();
    expect(screen.queryByText("Welcome to HarnessKit")).toBeNull();

    const localHubHeading = screen.getByText("Local Hub Overview");
    const localHubSection = localHubHeading.closest("section");
    expect(localHubSection).toBeTruthy();
    const localHub = within(localHubSection as HTMLElement);
    expect(localHub.getByText("Assets")).toBeTruthy();
    expect(localHub.getByText("Skills")).toBeTruthy();
    expect(localHub.getByText("MCP")).toBeTruthy();
    expect(localHub.getByText("Plugins")).toBeTruthy();
    expect(localHub.getByText("4")).toBeTruthy();
    expect(localHub.getByText("2")).toBeTruthy();
    expect(localHub.getAllByText("1")).not.toHaveLength(0);

    const projectsHeading = screen.getByText("Projects overview");
    const projectsSection = projectsHeading.closest("section");
    expect(projectsSection).toBeTruthy();
    const projects = within(projectsSection as HTMLElement);
    expect(projects.queryByRole("button", { name: /view all/i })).toBeNull();
    expect(projects.queryByText("alpha-project")).toBeNull();
  });
});
