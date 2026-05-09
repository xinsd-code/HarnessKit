# Local Hub / Extensions 作用域展示修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `Local Hub` 和 `Extensions` 的列表页只展示全局 Agent 安装态，同时让详情页同时展示全局安装态与 Project 安装态，并修复 `Local Hub` 详情页 `Install to Agent` 置灰异常。

**Architecture:** 保持现有的数据源不变，列表页和详情页只共享一套安装态推导逻辑，但在不同视图里取不同字段：列表页只看 `globalInstalled`，详情页分开渲染 `globalInstalled` 与 `projectInstalled`。Local Hub 继续读取 `~/.harnesskit` 的统一仓库资产，Extensions 继续读取所有 Agent / Project 的已安装实例，项目选择只从 `exists=true` 的项目里回填。实现时优先改前端视图层和共享 helper，不引入新存储字段或新的作用域类型。

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Tauri 前端调用层, 现有 `buildInstallState` / `resolveProjectSelection` / `ProjectInstallPanel` / `AgentInstallIconRow`

---

### Task 1: 锁定共享安装态语义和回归测试

**Files:**
- Modify: `src/lib/install-surface.ts`
- Modify: `src/lib/__tests__/install-surface.test.ts`

- [ ] **Step 1: 先写会失败的语义测试**

```ts
import { describe, expect, it } from "vitest";
import { buildInstallState, resolveProjectSelection } from "@/lib/install-surface";
import type { ConfigScope, Extension, Project } from "@/lib/types";

const globalScope: ConfigScope = { type: "global" };
const alphaScope: ConfigScope = { type: "project", name: "alpha", path: "/projects/alpha" };

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
    scope: globalScope,
    ...overrides,
  };
}

function makeProject(exists: boolean): Project {
  return {
    id: "alpha",
    name: "alpha",
    path: "/projects/alpha",
    created_at: "2026-05-09T00:00:00.000Z",
    exists,
  };
}

it("treats project-only installs as not installed on list surfaces", () => {
  const state = buildInstallState({
    agentName: "claude",
    instances: [makeExtension({ scope: alphaScope, agents: ["claude"] })],
    surface: "local-hub",
  });

  expect(state.globalInstalled).toBe(false);
  expect(state.projectInstalled).toBe(true);
  expect(state.installed).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认当前实现与新语义不一致**

Run: `npm test -- src/lib/__tests__/install-surface.test.ts`

Expected: 至少有一条与列表页/详情页作用域语义相关的断言失败，证明测试能卡住旧行为。

- [ ] **Step 3: 只调整 helper 的返回语义，不动页面逻辑**

```ts
export function buildInstallState({
  agentName,
  instances,
  projectScope = null,
  surface,
}: BuildInstallStateOptions): InstallState {
  const matchingInstances = instances.filter(
    (instance) =>
      instance.agents.includes(agentName) &&
      (instance.scope.type === "global" ||
        projectScope == null ||
        scopeMatches(instance.scope, projectScope) ||
        instance.scope.type === "project"),
  );
  const globalInstances = matchingInstances.filter(
    (instance) => instance.scope.type === "global",
  );
  const projectInstances =
    projectScope?.type === "project"
      ? matchingInstances.filter(
          (instance) =>
            instance.scope.type === "project" &&
            instance.scope.path === projectScope.path,
        )
      : matchingInstances.filter((instance) => instance.scope.type === "project");

  return {
    globalInstalled: globalInstances.length > 0,
    projectInstalled: projectInstances.length > 0,
    installed:
      surface === "extension-detail"
        ? globalInstances.length > 0 || projectInstances.length > 0
        : globalInstances.length > 0,
    globalInstances,
    projectInstances,
    listAction:
      surface === "local-hub" || surface === "extension-list"
        ? globalInstances.length > 0
          ? "uninstall"
          : "install"
        : globalInstances.length > 0 || projectInstances.length > 0
          ? "uninstall"
          : "install",
  };
}
```

- [ ] **Step 4: 跑刚才的测试并确认通过**

Run: `npm test -- src/lib/__tests__/install-surface.test.ts`

Expected: PASS，且 `resolveProjectSelection` 继续满足“只回填存在的项目、优先当前 project scope、再按已安装项目回填”的规则。

- [ ] **Step 5: 提交这一小步**

```bash
git add src/lib/install-surface.ts src/lib/__tests__/install-surface.test.ts
git commit -m "test: lock install scope semantics"
```

### Task 2: 修正 Local Hub 的列表页与详情页

**Files:**
- Modify: `src/components/local-hub/hub-table.tsx`
- Modify: `src/components/local-hub/hub-detail.tsx`
- Modify: `src/components/shared/project-install-panel.tsx`
- Modify: `src/components/local-hub/__tests__/hub-detail.test.tsx`
- Create: `src/components/local-hub/__tests__/hub-table.test.tsx`
- Modify: `src/components/shared/__tests__/project-install-panel.test.tsx`

- [ ] **Step 1: 先写 Local Hub 列表页的失败测试**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HubTable } from "@/components/local-hub/hub-table";

const captured: Array<{ installed: boolean }[]> = [];

vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: { items: Array<{ installed: boolean }> }) => {
    captured.push(props.items);
    return null;
  },
}));

it("renders project-only Local Hub installs as not installed in the table", () => {
  render(
    <HubTable
      data={[
        {
          id: "hub-skill",
          kind: "skill",
          name: "frontend-design",
          description: "",
          source: {
            origin: "git",
            url: "https://github.com/acme/frontend-design.git",
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
          scope: { type: "project", name: "alpha", path: "/projects/alpha" },
        },
      ]}
    />,
  );

  expect(captured.at(-1)?.[0].installed).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认旧逻辑会把 Project 安装态渲染进列表**

Run: `npm test -- src/components/local-hub/__tests__/hub-table.test.tsx`

Expected: FAIL，证明列表页当前仍然把 Project 安装态当成“已安装”显示。

- [ ] **Step 3: 修改 Local Hub 表格只取全局安装态**

```ts
const installState = buildInstallState({
  agentName,
  instances: matchingInstances,
  surface: "local-hub",
});
const installed = installState.globalInstalled || optimistic;
const title = installed
  ? `${agentDisplayName(agentName)} · 点击移除全局安装`
  : `${agentDisplayName(agentName)} · 安装到全局`;
```

同时把详情页里的项目选择回填收敛到只读 `exists=true` 的项目：

```ts
const availableProjects = projects.filter((project) => project.exists);
const selectedProject = resolveProjectSelection({
  contextScope: null,
  installedInstances: installedExtensions.filter(
    (instance) => instance.kind === ext.kind && instance.name === ext.name,
  ),
  projects: availableProjects,
});
```

`ProjectInstallPanel` 继续只接收可用项目列表，不再由页面手写空态判断。

- [ ] **Step 4: 把 Local Hub 详情页回归测试补齐**

```tsx
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HubDetail } from "@/components/local-hub/hub-detail";

// 复用现有 mock store，额外断言：
// 1) 传给 ProjectInstallPanel 的 projects 只包含 exists=true 的项目
// 2) 全局 Agent 图标的 installed 状态来自 globalInstalled
// 3) 选中项目变化后，projectAgentItems 只反映当前 projectScope
```

- [ ] **Step 5: 跑 Local Hub 相关测试**

Run:
`npm test -- src/components/local-hub/__tests__/hub-table.test.tsx src/components/local-hub/__tests__/hub-detail.test.tsx src/components/shared/__tests__/project-install-panel.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/local-hub/hub-table.tsx src/components/local-hub/hub-detail.tsx src/components/shared/project-install-panel.tsx src/components/local-hub/__tests__/hub-table.test.tsx src/components/local-hub/__tests__/hub-detail.test.tsx src/components/shared/__tests__/project-install-panel.test.tsx
git commit -m "feat: fix local hub scope display"
```

### Task 3: 修正 Extensions 的列表页与详情页

**Files:**
- Modify: `src/components/extensions/extension-table.tsx`
- Modify: `src/components/extensions/extension-detail.tsx`
- Create: `src/components/extensions/__tests__/extension-table.test.tsx`
- Modify: `src/components/extensions/__tests__/extension-install-flow.test.tsx`

- [ ] **Step 1: 先写 Extensions 列表页的失败测试**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExtensionTable } from "@/components/extensions/extension-table";

const captured: Array<{ installed?: boolean }[]> = [];

vi.mock("@/components/shared/agent-install-icon-row", () => ({
  AgentInstallIconRow: (props: { items: Array<{ installed?: boolean }> }) => {
    captured.push(props.items);
    return null;
  },
}));

it("renders project-only extension installs as not installed in the table", () => {
  render(
    <ExtensionTable
      data={[
        {
          groupKey: "frontend-design",
          kind: "skill",
          name: "frontend-design",
          description: "",
          instances: [
            {
              id: "project",
              kind: "skill",
              name: "frontend-design",
              agents: ["claude"],
              scope: { type: "project", name: "alpha", path: "/projects/alpha" },
            },
          ],
        } as never,
      ]}
    />,
  );

  expect(captured.at(-1)?.[0].installed).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认旧列表逻辑仍然把 Project 安装态当成已安装**

Run: `npm test -- src/components/extensions/__tests__/extension-table.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 修改 Extensions 列表页只取全局安装态**

```ts
const state = buildInstallState({
  agentName,
  instances: ext.instances,
  surface: "extension-list",
});

return {
  name: agentName,
  installed: state.globalInstalled,
  pending: isPending,
  disabled: isUnsupportedAdd,
  title: state.globalInstalled
    ? `${agentDisplayName(agentName)} · 点击移除全局安装`
    : `${agentDisplayName(agentName)} · 点击添加全局安装`,
  onClick: () => void handleToggle(agentName),
};
```

详情页继续使用两套状态：

```ts
const globalAgentItems = detectedAgents.map((agent) => {
  const state = buildInstallState({
    agentName: agent.name,
    instances: group.instances,
    surface: "extension-detail",
  });
  return {
    name: agent.name,
    installed: state.globalInstalled,
    pending: deploying === agent.name,
  };
});

const projectAgentItems = projectInstallAgents.map((agent) => {
  const state = buildInstallState({
    agentName: agent.name,
    instances: projectStateInstances,
    projectScope: installProjectScope,
    surface: "extension-detail",
  });
  return {
    name: agent.name,
    installed: state.projectInstalled,
    pending: projectDeploying === agent.name,
  };
});
```

- [ ] **Step 4: 把 Extensions 详情页回归测试补齐**

```tsx
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExtensionDetail } from "@/components/extensions/extension-detail";

// 断言：
// 1) 列表页只用 globalInstalled
// 2) 详情页的 global 区和 project 区各自从对应 scope 取状态
// 3) project scope 缺失时回退到第一个存在的项目
```

- [ ] **Step 5: 跑 Extensions 相关测试**

Run:
`npm test -- src/components/extensions/__tests__/extension-table.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/components/extensions/extension-table.tsx src/components/extensions/extension-detail.tsx src/components/extensions/__tests__/extension-table.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx
git commit -m "feat: fix extension scope display"
```

### Task 4: 全量前端回归与收尾

**Files:**
- Modify: `src/components/local-hub/__tests__/hub-detail.test.tsx`
- Modify: `src/components/extensions/__tests__/extension-install-flow.test.tsx`
- Modify: `src/lib/__tests__/install-surface.test.ts`

- [ ] **Step 1: 补最后一组跨页面回归断言**

```tsx
// Local Hub:
// - 非存在项目不会进入 ProjectInstallPanel 的 projects
// - 详情页在项目被删掉后会自动回退 selectedProjectPath
//
// Extensions:
// - 详情页在 project scope 变更后保持 global/project 两套状态不串线
```

- [ ] **Step 2: 跑定向测试**

Run:
`npm test -- src/lib/__tests__/install-surface.test.ts src/components/shared/__tests__/project-install-panel.test.tsx src/components/local-hub/__tests__/hub-table.test.tsx src/components/local-hub/__tests__/hub-detail.test.tsx src/components/extensions/__tests__/extension-table.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx`

Expected: PASS。

- [ ] **Step 3: 跑全量前端测试和构建**

Run:
`npm test`

Expected: PASS。

Run:
`npm run build`

Expected: PASS。

- [ ] **Step 4: 收尾提交**

```bash
git add src/components/local-hub/__tests__/hub-detail.test.tsx src/components/extensions/__tests__/extension-install-flow.test.tsx src/lib/__tests__/install-surface.test.ts
git commit -m "test: cover scope display regression"
```

## Spec Coverage Check

- 列表页只展示全局 Agent 安装态：Task 2 和 Task 3 都要求列表 cell 只读 `globalInstalled`。
- 详情页同时展示全局与 Project 安装态：Task 2 和 Task 3 都把详情页拆成两套 item 集合。
- Local Hub 详情页的 `Install to Agent` 不再全灰：Task 2 的全局 item 测试和实现都围绕 `globalInstalled`。
- 只展示存在的 Project：Task 2 直接把 `projects.filter((project) => project.exists)` 纳入实现。
- 不改存储结构、不加新作用域：全计划都只改前端 helper 和视图层。

## Self-Review Notes

- 没有使用 `TBD` / `TODO` / `implement later`。
- 每个任务都能单独落地、单独测试、单独提交。
- 计划里没有引入新的 helper 名称或未定义的类型。
- 任务顺序遵循先失败测试、再最小实现、再回归验证的顺序。
