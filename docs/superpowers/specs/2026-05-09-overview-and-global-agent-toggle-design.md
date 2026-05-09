# Overview 与全局 Agent 图标切换修复设计

## 背景

当前 desktop 版还存在两组相关问题：

1. `Local Hub` 和 `Extensions` 总览列表页中的 `Agent` 图标点击语义不正确。
   - 当某个资产对某个 Agent 只有 Project 安装、没有全局安装时，列表页点击该 Agent 图标不会执行“安装到全局”，而是卡在无效状态或打开详情后仍无法正确回写。
   - 详情页 `Insert to Agent` 中点击安装成功后，列表页图标不亮；关闭并重新打开详情后，图标又可能变成置灰，说明全局安装态和 Project 安装态的写回、展示和点击语义没有统一。
2. 总览页结构不符合当前产品预期。
   - 页头标题仍是 `hk status` 终端样式。
   - `Projects Overview` 下面还展示了具体 Project 列表。
   - 缺少 `Local Hub` 资产概况板块。

这些问题的共同点是：页面上的“展示状态”和“点击动作”边界不清，尤其是列表页把全局态和 Project 态混在了一起。

## 目标

1. `Local Hub` 和 `Extensions` 列表页中的 `Agent` 图标点击永远只操作全局作用域。
2. 当某个 Agent 对某资产只有 Project 安装时，列表页点击该 Agent 图标要直接执行“安装到该 Agent 的全局作用域”。
3. 当某个 Agent 同时存在全局安装和 Project 安装时，列表页点击已点亮图标只卸载全局安装，不删除任何 Project 安装。
4. `Local Hub` 和 `Extensions` 详情页中的 `Insert to Agent` 只展示并操作全局安装态。
5. 详情页中的 Project 区域只展示并操作当前选中 Project 下的安装态。
6. 总览页标题改为 `Overview`，去掉具体 Project 列表，并新增 `Local Hub Overview` 统计板块。

## 非目标

1. 不改变后端安装 API 的作用域模型。
2. 不改变 `hook` / `cli` 的资产归并规则。
3. 不在总览页中新增 `Local Hub` 资产列表预览。
4. 不在这次需求中重构 `Overview` 页的其它视觉风格。

## 术语

- **全局安装态**：某资产是否已安装到某个 Agent 的全局目录。
- **Project 安装态**：某资产是否已安装到当前选中 Project 下某个 Agent 的项目目录。
- **列表页 Agent 图标**：`Local Hub` 与 `Extensions` 的表格中 `Agent` 列图标。
- **详情页 Insert to Agent**：详情页中全局安装区域的 Agent 图标行。

## 设计

### 1. 列表页 Agent 图标新语义

列表页 Agent 图标拆成两套语义：

- **展示语义**：图标是否点亮，只由 `globalInstalled` 决定
- **点击语义**：点击后永远只对全局作用域执行安装或卸载

对应规则：

1. `globalInstalled = true`
   - 图标点亮
   - 点击后只卸载全局安装
   - 如果该 Agent 在某个 Project 下仍有同名资产安装，Project 安装保留不动
2. `globalInstalled = false` 且 `projectInstalled = true`
   - 图标不点亮
   - 点击后直接安装到该 Agent 的全局作用域
   - 不再走“打开详情页”的兜底路径
3. `globalInstalled = false` 且 `projectInstalled = false`
   - 图标不点亮
   - 点击后安装到该 Agent 的全局作用域

这套规则同时适用于 `Local Hub` 与 `Extensions` 列表页。

### 2. 详情页全局区与 Project 区分离

详情页中的两块区域继续保留，但边界要彻底固定：

- `Insert to Agent`
  - 只展示 `globalInstalled`
  - 安装/卸载只对全局作用域生效
- Project 区域
  - 只展示当前选中 Project 下的 `projectInstalled`
  - 安装/卸载只对该 Project 作用域生效

安装成功后的回写要求：

1. 详情页点击 `Insert to Agent` 安装成功后，列表页中对应 Agent 图标必须立即或在一次刷新后点亮。
2. 再次打开详情页时，`Insert to Agent` 中对应图标必须继续保持点亮，不得因为同名 Project 安装态而被置灰或降级。
3. Project 区域状态变化不得污染全局区的高亮与 pending 状态；反之亦然。

### 3. 共享状态推导

为避免 `Local Hub`、`Extensions`、列表页、详情页四处再次分叉，状态推导必须统一：

1. 列表页动作语义不再使用“project-only 时 open-detail”的旧规则。
2. 列表页与详情页都基于同一份匹配后的资产实例集合计算：
   - `globalInstalled`
   - `projectInstalled`
   - 当前点击后应该执行的全局动作
3. `Local Hub` 和 `Extensions` 的差别只保留在数据来源，不保留在点击语义。

### 4. 总览页结构调整

总览页改成以下结构：

1. 页头标题从 `hk status` 改为 `Overview`
2. 保留总资产、Agent、审计等总览信息
3. 在 `Projects Overview` 上方新增 `Local Hub Overview`
4. `Local Hub Overview` 只展示统计卡，不展示资产列表
5. `Projects Overview` 只保留统计卡，不展示具体 Project 列表

`Local Hub Overview` 统计卡固定为：

- 总资产数
- Skills 数
- MCP 数
- Plugins 数

`Projects Overview` 仍保留项目统计卡，例如：

- Projects
- Available
- With extensions
- Missing

但删除下面的具体 Project 卡片列表和 `View all` 引导。

## 数据流

### 列表页点击

1. 用户点击 `Agent` 图标
2. 页面先计算该 Agent 对该资产的 `globalInstalled` / `projectInstalled`
3. 页面忽略 Project-only 的“open detail”旧路径
4. 若 `globalInstalled = true`，调用全局删除流程
5. 若 `globalInstalled = false`，调用全局安装流程
6. 成功后刷新或乐观更新全局状态，保证列表页和详情页一致

### 详情页点击

1. 用户点击 `Insert to Agent`
2. 只计算全局作用域实例
3. 成功后更新全局状态
4. 用户点击 Project 区域图标
5. 只计算当前选中 Project 作用域实例
6. 成功后更新 Project 状态，不影响全局区展示

### 总览页统计

1. `Overview` 读取安装资产分组数据
2. 读取 `Local Hub` 资产数据
3. `Local Hub Overview` 只统计 `skill` / `mcp` / `plugin`
4. `Projects Overview` 只输出统计卡，不输出项目列表

## 测试

至少覆盖以下回归：

1. `Extensions` 列表页中：
   - `claude` 有全局安装
   - `codex` 只有 Project 安装
   - 点击 `codex` 图标后触发全局安装，而不是无效点击或打开详情
2. `Local Hub` 列表页中同样覆盖上述场景
3. 某 Agent 同时有全局安装和 Project 安装时，点击列表页点亮图标只删除全局安装
4. 详情页 `Insert to Agent` 安装成功后：
   - 列表页图标点亮
   - 重新打开详情页后图标仍点亮
5. Project 区域 pending 与全局区 pending 不串扰
6. 总览页：
   - 标题显示 `Overview`
   - 不再渲染具体 Project 列表
   - 渲染 `Local Hub Overview` 四张统计卡

## 验收标准

1. 在 `Local Hub` 与 `Extensions` 列表页中，当某资产对某 Agent 只有 Project 安装时，点击该 Agent 图标会直接安装到全局作用域。
2. 点击后成功安装时，列表页图标会亮起。
3. 关闭并重新打开详情页后，`Insert to Agent` 中该 Agent 图标仍保持正确的全局安装态，不再出现置灰错误。
4. 当某 Agent 同时有全局安装和 Project 安装时，点击点亮图标只卸载全局安装。
5. `Overview` 页面标题显示为 `Overview`。
6. `Overview` 页面不再显示具体 Project 列表。
7. `Overview` 页面在 `Projects Overview` 上方显示 `Local Hub Overview`，并只包含统计卡。
