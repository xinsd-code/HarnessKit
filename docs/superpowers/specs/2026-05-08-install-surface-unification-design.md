# 安装面统一设计文档

日期：2026-05-08

## 背景

HarnessKit 当前在两个页面中暴露安装状态与安装动作：

- `Extensions`
- `Local Hub`

两个页面都会展示：

- 列表中的 Agent 列
- 详情页中的 `Install to Agent`
- 详情页中的 `Install to Project`

这三处交互已经发生漂移：同一个资产可能在一个页面显示已安装，在另一个页面显示未安装；默认项目选择逻辑随页面和资产类型变化；安装与删除的作用域语义也不一致。用户要求是在修正 `Extensions` 中 MCP 项目选择问题的同时，让 `Local Hub` 与 `Extensions` 完全一致，并通过共享状态与共享 UI 防止同类问题反复出现。

## 目标

1. 让 `Local Hub` 与 `Extensions` 共享一套安装状态模型。
2. 让 `Local Hub` 的列表与详情行为对齐修正后的 `Extensions`。
3. 修复 MCP 的 `Install to Project` 默认项目选择，并让它与其他支持项目安装的资产类型保持一致。
4. 保持作用域语义明确：
   - 列表 Agent 列只处理全局安装
   - `Install to Agent` 只处理全局安装
   - `Install to Project` 只处理当前选中项目
5. 提取可复用 UI 与可复用方法，确保后续修改一次生效全局。
6. 增加回归覆盖，防止之前出现过的 bug 再次复发。

## 非目标

1. 不重做页面视觉设计。
2. 不改 Local Hub 的存储格式与同步格式。
3. 不引入新的作用域类型，仍只支持 `global` 和 `project`。
4. 不扩展当前 Agent 能力边界之外的安装能力。

## 统一行为规则

### 1. Agent 列

列表中的 Agent 列只回答一个问题：

- 当前资产在当前可见语义下，是否已经存在于这个 agent 中

规则如下：

- 在 `Extensions` 中，可见性由当前页面 scope 决定。
- 在 `Local Hub` 中，行本身是 Hub 资产，不是安装实例，因此 Agent 列要做聚合展示：
  - 只要该 agent 在任意 scope 下有安装，就高亮
  - 如果只有项目安装，没有全局安装，tooltip 必须明确提示“已安装到项目，点击查看详情”
  - 如果存在全局安装，点击列表图标只移除全局安装
  - 如果完全未安装，点击列表图标只安装到全局

### 2. Install to Agent

`Install to Agent` 永远只代表全局安装。

规则如下：

- 有全局安装时高亮
- 点击高亮图标只移除全局安装
- 点击未高亮图标只安装到全局
- 项目安装状态不能影响这里的高亮结果

### 3. Install to Project

`Install to Project` 永远只代表当前选中项目。

规则如下：

- 当前选中项目 + 当前 agent 下存在安装时高亮
- 点击高亮图标只从当前选中项目移除
- 点击未高亮图标只安装到当前选中项目
- 全局安装状态不能影响这里的高亮结果

### 4. 默认项目选择

项目选择统一遵循一套规则：

1. 如果当前页面上下文已经带有 project scope，优先使用当前 scope
2. 否则，如果当前资产已经安装到一个或多个项目中，默认选中第一个已安装项目
3. 否则保持空选

这个规则统一适用于所有支持项目安装的类型：

- `skill`
- `mcp`
- `cli`

### 5. 支持矩阵

- `skill`：支持全局安装面与项目安装面
- `mcp`：支持全局安装面与项目安装面
- `cli`：支持全局安装面与项目安装面，但底层可能仍通过子资产完成安装
- `plugin`：只支持全局安装面
- `hook`：只支持全局安装面

## 架构设计

### 共享状态层

新增一层共享安装状态辅助层，放在前端公共逻辑区域，统一处理项目选择、安装状态推导和安装来源选择。

核心 helper 包括：

1. `resolveProjectSelection(...)`
   - 输入：
     - 当前页面 scope
     - 当前资产实例
     - 项目列表
     - CLI 子资产实例（如有）
   - 输出：
     - 当前选中的项目 scope 或 `null`
     - 可选项目列表
     - 选择来源：`context | installed | empty`

2. `buildInstallState(...)`
   - 输入：
     - grouped extension 或 hub 资产身份信息
     - 全量已安装扩展
     - 目标 agent
     - 当前选中的项目 scope
     - 页面模式：`extensions | local-hub`
   - 输出：
     - `hasGlobalInstall`
     - `hasProjectInstall`
     - `hasAnyInstall`
     - `canInstallGlobal`
     - `canInstallProject`
     - `listAction`
     - `globalAction`
     - `projectAction`
     - tooltip 文案

3. `getInstallSourceInstance(...)`
   - 输入：
     - 资产组
     - 目标 scope
     - 资产类型
   - 输出：
     - 本次安装应使用的 source instance
     - 如果没有合法 source，返回明确失败原因

约束：

- 安装状态推导以后只能在这层做
- 页面组件不得再手写本地安装状态判断

### 共享 UI 层

引入两类共享 UI：

1. `AgentInstallIconRow`
   - 负责根据预计算状态渲染 Agent 图标行
   - 支持模式：
     - `list`
     - `global-detail`
     - `project-detail`
   - 只消费外部传入的 view model 与回调，不自己做业务判断

2. `ProjectInstallPanel`
   - 负责渲染：
     - 标题
     - 项目选择器
     - 当前项目下的 Agent 图标组
     - 空态与不支持态
   - 在 `Extensions` 和 `Local Hub` 中复用

3. `useInstallActionController`
   - 负责统一封装：
     - 全局安装
     - 全局删除
     - 项目安装
     - 项目删除
     - optimistic pending 状态
     - rescan / fetch
     - 冲突处理
     - toast 文案

虽然两个页面的数据来源不同：

- `Extensions` 操作安装实例
- `Local Hub` 操作 Hub 资产与 Hub 安装接口

但 view model 和 UI 必须保持一致。

## 页面集成方案

### Extensions

`Extensions` 将作为修正后的基线页面。

需要完成：

1. 用 `resolveProjectSelection(...)` 替换页面本地的项目默认选择逻辑
2. 用 `buildInstallState(...)` 替换页面本地的图标状态逻辑
3. 通过共享 action/controller 接管列表与详情中的安装/删除动作
4. 让 MCP 与 skill、CLI 走同一套项目选择与项目动作流程

### Local Hub

`Local Hub` 复用相同的展示与交互模型，但保留 Hub 自己的安装接口。

需要完成：

1. 页面进入时必须拉取已安装扩展，保证 Hub 行可以计算聚合状态
2. 用 `buildInstallState(...)` 替换页面本地安装状态逻辑
3. 用 `resolveProjectSelection(...)` 统一详情页项目默认选择
4. 复用共享 Agent 图标行与共享项目安装面板

## 资产类型说明

### Skill

必须在以下四处都保持状态一致：

- `Extensions` 列表
- `Extensions` 详情
- `Local Hub` 列表
- `Local Hub` 详情

### MCP

必须修复：

- 默认项目选择错误
- 当前项目下高亮错误
- 项目安装 / 删除没有严格限定在当前项目下

这是本轮重点回归对象，因为 `Extensions` 当前已经出现该问题。

### CLI

CLI 仍然是父级交互面，底层通过子资产编排安装状态与安装动作。

要求：

- 项目默认选择仍遵循共享规则
- 安装 / 删除仍保持当前 CLI 子资产编排逻辑
- CLI 父级与子资产状态不能再出现视觉漂移

### Plugin 与 Hook

两者都保持为仅支持全局安装的资产类型。

要求：

- 不出现项目安装区
- 全局图标区仍复用共享 Agent 图标行
- capability 限制规则保持不变

## 测试策略

### 单元测试

为共享状态 helper 增加测试，至少覆盖：

1. 默认项目选择
   - 上下文 scope 优先
   - 已安装项目回退
   - 空选回退

2. 安装状态推导
   - 只有全局安装
   - 只有项目安装
   - 同时存在全局与项目安装
   - 不支持的动作场景

3. 列表动作语义
   - 完全未安装时安装到全局
   - 存在全局安装时移除全局
   - Local Hub 只有项目安装时打开详情而不是删除

### 组件测试

增加聚焦测试：

1. `AgentInstallIconRow`
2. `ProjectInstallPanel`

至少验证：

- 高亮状态正确
- disabled 状态正确
- 回调动作正确

### 浏览器回归

必须覆盖两个页面：

1. `Extensions`
2. `Local Hub`

并对以下类型逐类验证：

- `skill`
- `mcp`
- `cli`
- `plugin`
- `hook`

至少验证：

- 列表中的 Agent 状态
- 详情中的 `Install to Agent`
- 支持时的 `Install to Project`
- 支持时的默认项目选择

## 实施顺序

1. 先抽共享状态 helper
2. 再抽共享 Agent 图标行与项目安装面板
3. 先切 `Extensions`，并在这里修复 MCP 项目选择
4. 再切 `Local Hub`
5. 最后补测试与浏览器回归

## 风险

1. CLI 子资产编排在重构后可能出现聚合状态与动作脱节
2. `Local Hub` 与 `Extensions` 中已有的 optimistic 状态处理如果不统一，可能继续发生亮灰不一致
3. 默认项目选择如果优先级不明确，页面上看起来会“自动跳项目”

## 缓解方式

1. 保持 CLI 逻辑收敛在共享 action/controller 中，不把例外散落回页面
2. 共享状态 helper 保持纯函数，并直接测试
3. 明确保持作用域语义：
   - 列表只处理全局
   - `Install to Agent` 只处理全局
   - `Install to Project` 只处理当前项目

## 验收标准

满足以下条件即视为完成：

1. `Extensions` 与 `Local Hub` 对同一资产 / agent / scope 的状态展示一致
2. MCP 使用与 skill、CLI 相同的项目选择规则
3. Local Hub 中“只有项目安装”的资产不再显示为完全未安装
4. 页面层不再自行手写安装状态推导逻辑
5. 可复用安装 UI 已被提取并复用
6. 测试覆盖了之前反复回归的安装面规则
