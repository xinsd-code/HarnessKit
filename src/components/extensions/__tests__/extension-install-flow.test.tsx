import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionDetail } from "@/components/extensions/extension-detail";
import { ExtensionTable } from "@/components/extensions/extension-table";
import { api } from "@/lib/invoke";
import { buildGroups } from "@/stores/extension-helpers";
import type { ConfigScope, Extension } from "@/lib/types";
import { extensionGroupKey } from "@/lib/types";
import { useAgentStore } from "@/stores/agent-store";
import { useExtensionStore } from "@/stores/extension-store";
import { useProjectStore } from "@/stores/project-store";
import { useScopeStore } from "@/stores/scope-store";

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

function makeMcpInstance(id: string, scope: ConfigScope): Extension {
  return {
    id,
    kind: "mcp",
    name: "chrome-devtools",
    description: "desc",
    source: {
      origin: "registry",
      url: "https://github.com/acme/chrome-devtools.git",
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
    scope,
  };
}

function makeProject(scope: ConfigScope) {
  return {
    id: scope.name,
    name: scope.name,
    path: scope.path,
    created_at: "2026-05-09T00:00:00.000Z",
    exists: true,
  };
}

function makeAgent() {
  return {
    name: "claude",
    detected: true,
    extension_count: 0,
    path: "/agents/claude",
    enabled: true,
  };
}

function resetStores() {
  useScopeStore.setState({ current: { type: "all" }, hydrated: true });
  useProjectStore.setState({ projects: [], loading: false, loaded: true });
  useAgentStore.setState({
    agents: [],
    loading: false,
    agentOrder: ["claude"],
  });
  useExtensionStore.setState({
    extensions: [],
    loading: false,
    hasFetched: true,
    selectedId: null,
    selectedIds: new Set(),
    updateStatuses: new Map(),
    kindFilter: null,
    agentFilter: null,
    searchQuery: "",
    tagFilter: null,
    packFilter: null,
    allTags: [],
    allPacks: [],
    newRepoSkills: [],
    checkingUpdates: false,
    updatingAll: false,
  });
}

beforeEach(() => {
  resetStores();
  vi.spyOn(api, "getExtensionContent").mockResolvedValue({
    content: "",
    path: null,
    symlink_target: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  resetStores();
});

describe("ExtensionTable install flow", () => {
  it("keeps project-only installs on the project-scoped open-detail path", async () => {
    const alphaInstance = makeMcpInstance("alpha-instance", alphaScope);
    const betaInstance = makeMcpInstance("beta-instance", betaScope);
    const grouped = buildGroups([alphaInstance, betaInstance]);
    const group = grouped[0];

    useAgentStore.setState({
      agents: [makeAgent()],
      agentOrder: ["claude"],
    });
    useExtensionStore.setState({
      extensions: [alphaInstance, betaInstance],
      selectedId: null,
    });

    render(
      <MemoryRouter>
        <ExtensionTable data={grouped} />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Claude Code · 已安装到项目，点击查看详情",
      }),
    );

    expect(useExtensionStore.getState().selectedId).toBe(group.groupKey);
  });
});

describe("ExtensionDetail install flow", () => {
  it("defaults MCP project selection to the first matching project in project-list order", async () => {
    const alphaInstance = makeMcpInstance("alpha-instance", alphaScope);
    const betaInstance = makeMcpInstance("beta-instance", betaScope);
    const groupKey = extensionGroupKey(alphaInstance);

    useAgentStore.setState({
      agents: [makeAgent()],
      agentOrder: ["claude"],
    });
    useProjectStore.setState({
      projects: [makeProject(betaScope), makeProject(alphaScope)],
      loading: false,
      loaded: true,
    });
    useExtensionStore.setState({
      extensions: [alphaInstance, betaInstance],
      selectedId: groupKey,
    });

    function Harness() {
      const [projectScope, setProjectScope] = useState<ConfigScope | null>(null);

      return (
        <ExtensionDetail
          installProjectScope={projectScope}
          onInstallProjectScopeChange={setProjectScope}
        />
      );
    }

    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        (screen.getByRole("combobox", {
          name: "Select target project",
        }) as HTMLSelectElement).value,
      ).toBe(betaScope.path);
    });
  });
});
