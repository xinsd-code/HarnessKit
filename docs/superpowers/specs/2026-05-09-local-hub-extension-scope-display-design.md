# Local Hub 与 Extensions 的作用域展示设计

日期：2026-05-09

## 背景

当前 `Local Hub` 和 `Extensions` 两个页面都在展示同一类资产的安装状态，但它们使用的作用域语义混在了一起：

- 列表页中的 Agent 列有时把 Project 安装态也算进去，导致用户无法直观看出“全局是否安装”。
- 详情页中的 `Install to Agent` 会把可安装 Agent 置灰，原因是只看到了 Project 层面的状态，没有把全局安装态纳入判断。
- `Local Hub` 详情页需要同时表达两种事实：
  - 全局 Agent 当前是否已安装该资产
  - 选中 Project 下的 Agent 当前是否已安装该资产

用户希望把语义拆清楚：

- 列表页只展示全局 Agent 的安装情况。
- 详情页同时展示全局 Agent 安装情况和 Project 下 Agent 安装情况。
- `Local Hub` 读取的是 `~/.harnesskit` 下的统一仓库资产。
- `Extensions` 读取的是所有 Agent 和 Project 下的已安装资产。

## 目标

1. 保持 `Local Hub` 和 `Extensions` 的列表页 Agent 列语义一致：只反映全局安装态。
2. 在详情页中同时展示全局安装态与 Project 安装态。
3. 修复 `Local Hub` 详情页 `Install to Agent` 全部置灰的问题，让它基于全局安装态正确显示已安装 Agent。
4. 不改变现有数据存储格式，不引入新的作用域类型。
5. 复用现有共享安装状态逻辑，避免两页各自重新实现判断。

## 非目标

1. 不重做页面视觉设计。
2. 不修改 Local Hub 资产的扫描来源，仍然读取 `~/.harnesskit`。
3. 不改变 `Extensions` 的资产来源，仍然读取所有 Agent / Project 安装实例。
4. 不引入第三种作用域或跨项目聚合视图。
5. 不把 Project 安装态混入列表页的 Agent 列。

## 术语

- **全局安装态**：资产在某个 Agent 的全局目录中是否存在。
- **Project 安装态**：资产在某个具体 Project 下的安装目录中是否存在。
- **列表页**：`Local Hub` 和 `Extensions` 的表格/行级视图。
- **详情页**：资产展开后的面板，包括 `Install to Agent` 和 `Install to Project`。

## 行为规则

### 1. 列表页只看全局

`Local Hub` 和 `Extensions` 的列表页 Agent 列只允许使用全局安装态判断：

- 已在全局安装时高亮
- 未在全局安装时置灰
- Project 安装态不参与列表页高亮
- 列表页点击行为仍然只针对全局安装 / 全局卸载

这样做的原因是列表页承担的是“快速浏览仓库里有哪些全局可用资产”的职责，而不是呈现所有作用域的明细。

### 2. 详情页拆成两套状态

详情页需要展示两个独立区域：

- `Install to Agent`
  - 只表示全局安装态
  - 已安装的 Agent 需要高亮
  - 未安装的 Agent 保持可点击
- `Install to Project`
  - 只表示当前选中 Project 下的安装态
  - 已安装的 Agent 需要高亮
  - 未安装的 Agent 保持可点击

如果当前资产不支持 Project 安装，则只显示全局区域。

### 3. Local Hub 详情页的默认项目选择

当 `Local Hub` 详情页进入某个资产时：

1. 如果用户已经明确选中了一个存在的 Project，则继续使用该 Project。
2. 否则，如果该资产已经在某个 Project 中安装，则默认选中第一个已安装的 Project。
3. 否则保持未选择状态。

如果用户之前选中的 Project 已不存在，则应自动回退到第 2 条或第 3 条。

### 4. Agent 是否“已安装”的判断

详情页中用于高亮的判断必须区分作用域：

- `Install to Agent` 使用全局安装实例集合
- `Install to Project` 使用当前 Project 的安装实例集合

`Local Hub` 详情页在判断全局安装态时，不能因为某个 Project 已安装就把全局区全部置灰。

## 设计方案

### 共享状态计算

保留并复用现有的安装状态辅助逻辑，将“是否安装”的判断统一拆成两个结果：

- `globalInstalled`
- `projectInstalled`

页面组件不再手写“只要有安装就算已安装”的混合逻辑，而是明确选取当前区域需要的那一个字段。

### Local Hub 详情页

`Local Hub` 详情页的实现应满足：

- 全局 Agent 行：从全局安装态集合中计算高亮
- Project 面板：只有在选择了有效 Project 后才展示 Project 安装态
- Project 选择器：只展示 `exists=true` 的 Project
- `Install to Agent` 的点击逻辑：只根据全局安装态决定安装或卸载

### Extensions 详情页

`Extensions` 详情页沿用相同语义，但数据源是已安装实例：

- 全局区域：只看全局安装态
- Project 区域：只看当前 Project 安装态
- 默认项目选择：遵循同一套回退规则

### 列表页

列表页不改变现有信息密度：

- `Local Hub` 列表页继续代表统一仓库中各资产的全局可用状态
- `Extensions` 列表页继续代表安装实例的全局状态
- 不在列表页新增 Project 安装明细

## 需要修改的边界

### 前端

优先修改这些区域：

- `src/components/local-hub/hub-detail.tsx`
- `src/components/extensions/extension-detail.tsx`
- `src/components/local-hub/hub-table.tsx`
- `src/components/extensions/extension-table.tsx`
- `src/lib/install-surface.ts`
- `src/components/shared/project-install-panel.tsx`

### 后端

后端不需要新增存储字段或新的同步路径。

如果发现某个页面的作用域显示不对，优先修前端状态推导，而不是改数据库结构。

## 测试策略

必须补的回归覆盖：

1. 列表页只用全局安装态判断 Agent 列高亮。
2. 详情页的全局区域能正确显示已安装 Agent，不受 Project 安装态干扰。
3. 详情页在存在 Project 安装时，Project 区域能正确显示该 Project 的 Agent 安装态。
4. `Local Hub` 详情页在 Project 被删除或失效时，会自动回退选中状态。
5. `Local Hub` 详情页不会把不存在的 Project 展示在选择器中。

## 验收标准

1. `Local Hub` 和 `Extensions` 的列表页中，Agent 列只反映全局安装态。
2. 两个页面的详情页都能同时表达全局安装态和 Project 安装态。
3. `Local Hub` 详情页的 `Install to Agent` 不再把所有 Agent 置灰。
4. Project 不存在时，详情页不会展示失效的 Project 选择项。
5. 现有安装、卸载、同步行为不回退。

## 风险与约束

- 如果把 Project 安装态混入列表页，用户会误解“全局是否安装”，因此列表页必须保持纯全局语义。
- 如果详情页继续使用单一布尔值表达安装状态，会再次把全局和 Project 混淆，必须拆成两个字段。
- 如果默认项目选择没有统一，`Local Hub` 和 `Extensions` 会继续出现行为分叉。
