# Desktop Release Hardening 设计文档

日期：2026-05-12
状态：Approved

## 背景

当前仓库的桌面端发布链路已经接入 GitHub Actions，但还没有达到“可正式分发”的标准，主要有三类问题：

1. macOS workflow 将“构建”和“签名”耦合在一次发布步骤里，缺少 Apple 凭据时会把已成功构建的桌面包整体判成失败。
2. `x86_64-apple-darwin` 日志已经明确显示 `codesign` 因 keychain 中找不到 signing identity 而失败；`aarch64-apple-darwin` 任务则处于被取消状态，不能当作独立源码错误处理。
3. Windows release 虽然产出了 `.exe`，但当前发布语义不清晰，桌面安装器与 CLI 可执行文件容易混淆，导致“构建成功但打不开”的反馈无法从产物层直接判明根因。

用户这轮的目标不是简单把 CI 跑绿，而是把仓库整理到“可正式分发桌面包”的状态；在还没有 Apple/Windows 签名凭据的阶段，需要继续产出 macOS 内部测试包，并确保 Windows 主下载入口是正确的桌面安装器。

## 目标

1. 让 macOS 桌面发布在无 Apple 凭据时仍能稳定产出“未签名、仅内部测试”的安装产物。
2. 让同一条 workflow 在未来补齐 Apple 凭据后，可以平滑切到正式签名/公证发布路径，而不是重写发布流程。
3. 让 Windows release 明确区分桌面安装器与 CLI 二进制，并以桌面安装器作为主下载入口。
4. 把 Windows “exe 打不开”的高概率误用场景从资产命名、上传逻辑和校验护栏上先消除掉。
5. 保持改动聚焦在发布链路、产物命名和验证护栏，不借机重做桌面 UI 或无关构建系统。

## 非目标

1. 本轮不接入真实 Apple Developer 凭据，也不接入真实 Windows 代码签名证书。
2. 不修改应用业务逻辑，不重做桌面端视觉表现。
3. 不承诺本轮完成完整的 Apple notarization 实测或 Windows 签名实测；本轮交付的是“签名就绪”的发布结构。
4. 不扩展新的发布渠道，仅聚焦 GitHub Release。

## 现状判断

### 1. macOS 失败属于签名链路失败，不是编译失败

从 `release.yml` 和现有日志看，`x86_64-apple-darwin` 已经完成了 release build 与 `.app` bundling，失败发生在 `codesign` 阶段，错误为：

- keychain 中找不到指定 signing identity

因此问题不在 Rust/Tauri 编译本身，而在于当前 workflow 没有把“无凭据时的测试包模式”和“有凭据时的正式签名模式”拆开。

### 2. Windows 当前的主要风险是发布语义混淆

仓库里同时存在两类 Windows 可执行产物：

- Tauri 生成的桌面安装器/桌面包
- CLI 二进制 `hk.exe`

如果 Release 页面没有用文件名和说明明确区分两者，用户很容易把 CLI 当桌面程序双击，进而反馈“exe 打不开”。在没有先排除这类错误下载前，不应直接把问题归因到 Tauri 打包失败。

### 3. 当前桌面配置存在跨平台风险点，但不应先入为主判死刑

`crates/hk-desktop/tauri.conf.json` 包含明显偏向 macOS 的窗口配置，例如透明窗口、overlay title bar、sidebar window effects。它们应当被视为 Windows 启动风险点并纳入验证，但在没有更直接证据前，不应作为唯一根因假设。

## 设计原则

1. **构建成功与签名成功分层**：缺少签名凭据应改变发布模式，而不是让整个桌面构建直接失败。
2. **发布资产语义清晰**：每个 Release 资产都必须让下载者一眼看懂用途。
3. **同一 workflow 平滑升级**：未来补 secrets 后应走同一条链路切换到 signed path，而不是新开第二套发布体系。
4. **最小但充分的验证**：先用资产级和启动级护栏拦住最常见错误，再为后续真实签名接入留接口。

## 方案对比

### 方案 A：最小修补

- 仅修改 workflow，让 macOS 在无证书时跳过签名。
- Windows 继续沿用现状，只补 release 说明。

优点：

- 改动最少，最快恢复部分产物上传。

缺点：

- Windows 桌面安装器与 CLI 的混淆问题没有从结构上解决。
- 将来接入正式签名时仍可能继续返工资产命名和校验逻辑。

### 方案 B：发布链路分层（推荐）

- 将桌面发布拆成构建、签名、资产上传、发布说明四层语义。
- macOS 按 secrets 完整度在 signed / unsigned 两条路径之间切换。
- Windows 明确将桌面安装器与 CLI 产物分离，并补资产校验与最小 smoke check。

优点：

- 同时解决当前问题和未来签名接入问题。
- 不需要真实签名凭据也能验证绝大多数发布结构是否正确。
- 改动范围仍集中在 workflow、桌面打包配置和发布文案。

缺点：

- 比最小修补多一点 workflow 结构整理成本。

### 方案 C：全正式发布预演

- 现在就把 Apple notarization、Windows code signing、产物命名、渠道文案全部按正式规格一次搭满。

优点：

- 形式上最完整。

缺点：

- 在没有真实 secrets 的情况下，大量步骤只能停留在结构接入层面，当前验证收益偏低。
- 容易把本轮工作做复杂，不符合最小必要改动原则。

## 推荐方案

采用 **方案 B：发布链路分层**。

原因：

1. 它最符合当前约束：目标是正式分发能力，但暂时没有 Apple/Windows 签名凭据。
2. 它允许 macOS 继续给内部测试用户提供未签名安装包，而不是因 codesign 失败完全断流。
3. 它能把 Windows 当前最可能的误用场景先从资产命名和上传逻辑上消掉，避免“下载错文件”被误判成“应用无法启动”。

## 详细设计

### 1. Release 语义重构

GitHub Release 里的资产分成三类，名称和说明必须显式区分：

1. `desktop-macos-unsigned`
   - 无 Apple 凭据时上传
   - 明确标注“未签名，仅内部测试”
2. `desktop-windows-installer`
   - 面向普通用户
   - 以 `NSIS .exe` 作为默认入口，`MSI` 作为补充入口
3. `cli`
   - 命令行二进制
   - 文件名必须强制带 `cli`

Release 页面不再允许“一个 `.exe` 看不出是 installer 还是 CLI”的情况。

### 2. macOS workflow 分层

保留当前两个 target：

- `aarch64-apple-darwin`
- `x86_64-apple-darwin`

但将执行语义拆成以下阶段：

1. 前端构建
2. Tauri 桌面 build / bundle
3. 判断 Apple 签名 secrets 是否完整
4. 如果完整：
   - 执行 codesign / notarization
   - 上传 signed 正式产物
5. 如果不完整：
   - 显式关闭签名流程
   - 上传 `unsigned` 测试产物
   - 在 release 说明中标记该资产不能作为正式对外分发包

关键约束：

- “无 secrets” 只能影响签名路径，不应把桌面构建本身判成失败。
- 文件名要带出 `unsigned` 或 `test-only` 语义，避免误下载后再追问来源。

### 3. Windows workflow 分层

Windows 发布分成两条独立语义：

1. **桌面端安装产物**
   - `NSIS .exe`：默认下载入口
   - `MSI`：补充入口，面向企业/IT 管理
2. **CLI 产物**
   - 单独命名与上传
   - 不再与桌面安装器共享模糊文件名

关键约束：

- 桌面 job 上传的默认资产必须是 installer，而不是 `hk.exe`。
- CLI 文件名必须包含 `cli`，例如 `hk-cli-windows-x64.exe`。
- 如果桌面 job 没生成 installer 类产物，应直接失败，避免发布半成品。

### 4. 统一命名规范

建议统一为以下风格：

- `HarnessKit-macos-arm64-unsigned.dmg`
- `HarnessKit-macos-x64-unsigned.dmg`
- `HarnessKit-windows-x64-installer.exe`
- `HarnessKit-windows-x64.msi`
- `hk-cli-macos-arm64`
- `hk-cli-macos-x64`
- `hk-cli-windows-x64.exe`
- `hk-cli-linux-x64`

命名原则：

1. 先产品名，再平台与架构，再分发类型。
2. CLI 永远显式带 `cli`。
3. 测试包永远显式带 `unsigned` 或同等语义标记。

### 5. Windows “打不开” 的防误判设计

本轮不直接假设问题一定出在 Tauri bundling，而是先拦住三类最常见错误：

1. 下载错文件
   - 通过命名和上传逻辑防止 CLI 被误当桌面 App。
2. 上传错文件
   - 通过 workflow 里的资产存在性检查，保证 release 绑定的是 installer。
3. 结构不完整
   - 如果只产出裸可执行文件，没有 installer / package 元数据，则桌面发布 job 失败。

如果这些都消除后仍存在“installer 安装后无法启动”，再继续排查平台窗口配置、WebView2 依赖、Tauri runtime 或应用启动时异常。

### 6. 跨平台窗口配置风险处理

`tauri.conf.json` 中的 macOS 特定视觉配置应被视为 Windows 风险点。

本轮设计要求：

1. 审查哪些窗口配置只服务 macOS 外观。
2. 若这些配置会被 Windows bundling 继承且存在兼容性风险，应将其下沉为平台特定配置，而不是对所有平台共用。
3. 这部分改动以“降低启动风险”为目的，不做视觉重设计。

这里不预先承诺一定需要改配置；是否调整，以后续验证结果为准。

## 验证策略

### 1. 资产级验证

每个平台上传前都要验证最终文件集合是否符合预期：

- macOS unsigned 模式：确实产出并上传了未签名桌面包
- Windows desktop 模式：确实存在 `NSIS` 和/或 `MSI`
- CLI 模式：文件名包含 `cli`

任一关键产物缺失时，job 应失败。

### 2. 启动级验证

Windows 至少补一个最小 smoke check，验证：

1. 桌面 job 的主产物确实是 installer
2. 上传到 release 的不是 CLI
3. 产物路径、扩展名和 bundler 输出符合预期

如果 runner 环境允许，再追加短时安装/启动验证；如果当前成本过高，本轮至少先做到“不会传错文件”。

### 3. 发布说明验证

Release 文案必须明确：

1. 哪些是桌面安装包
2. 哪些是 CLI
3. 哪些 macOS 包是 unsigned test-only
4. 补齐签名凭据后哪些资产会自动升级为正式签名包

## 成功标准

以下条件全部满足，才算本轮设计目标达成：

1. macOS 在无 Apple secrets 时不再因为 codesign 直接把桌面构建判红。
2. GitHub Release 中存在可下载的 macOS unsigned 测试包，并且命名/说明清晰。
3. Windows Release 的主下载入口是桌面 installer，而不是 CLI。
4. CLI 与桌面安装器文件名不再混淆。
5. workflow 结构允许未来只通过补 secrets 即切换到 signed path，而不是重写发布流程。

## 实施边界

本设计只覆盖以下文件与层级的改动方向：

- `.github/workflows/release.yml`
- `crates/hk-desktop/tauri.conf.json`
- 如有必要，少量桌面端构建辅助配置或脚本
- Release 资产命名与上传逻辑

不包含：

- 业务功能开发
- 桌面端视觉重构
- 发布站点或下载站改造

## 风险与后续

### 本轮已知风险

1. 没有真实签名凭据时，无法在本轮完成 Apple notarization 的端到端实测。
2. Windows runner 上的最小 smoke check 能过滤大部分资产级错误，但不一定能完全替代真人安装启动验证。

### 后续接签名时的增量工作

1. 补齐 Apple certificate / identity / notarization 相关 secrets。
2. 在现有 signed path 上完成 macOS 正式签名和公证验证。
3. 补齐 Windows code signing 证书后，在 installer 产物上接入签名步骤。
4. 根据正式签名结果，调整 release 文案，移除 unsigned-only 的测试提示。
