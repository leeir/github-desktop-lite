# GitHub Desktop Lite

[GitHub Desktop](https://github.com/desktop/desktop) 的个人精简分支：去掉 Copilot，用自己的模型写 commit message，压低内存和安装包体积。

> 这是非官方分支，与 GitHub 无关。它从上游 `3.6.9-beta1`（`bf4ec63`）分出，**不再跟随上游更新**，也不会自动升级。

## 和官方版有什么不同

| | 官方版 | Lite |
| --- | --- | --- |
| 生成 commit message | 需要有 Copilot 订阅的账号，后台拉起 Copilot runtime | 填自己的 API key 即可，主进程直接请求模型 |
| Copilot（冲突解决、额度卡片、Copilot App 跳转等） | 有 | 全部移除 |
| 使用统计 | 上报到 GitHub | 不收集、不保存、不上报；程序内部的非致命错误只写本地日志 |
| 自动更新 | 有 | 无：更新检查、更新提示、版本说明弹窗、致谢卡片都已移除 |
| 新手教程 | 有 | 移除 |
| 内置 Git Credential Manager | 有（约 120 MB 的 .NET 程序），可在设置里启用 | 移除，「使用 Git Credential Manager」设置一并去掉 |
| 安装包（macOS arm64） | 约 1.1 GB | 约 337 MB（其中 Electron 本体 287 MB） |
| 和官方版并存 | — | 可以：应用名、Bundle ID（`com.leeir.GitHubDesktopLite`）、用户数据目录、钥匙串条目、OAuth 回调协议都是独立的 |

其余功能（仓库管理、diff、提交、分支、PR、推拉等）与上游一致。

去掉 Git Credential Manager 只影响 GitHub 以外的 HTTPS 远程（如 Azure DevOps）：这类仓库改用 Desktop 自带的账号密码提示。GitHub 账号和 SSH 不受影响；你自己在系统里装的 GCM 也照常给命令行用。

## 用自己的模型写 commit message

打开 **设置 → AI**：

1. 选服务商
2. 粘贴 API key，模型列表会自动拉取
3. 搜索并选择模型，点「测试连接」

之后在提交框旁点 ✨ 就会生成标题和描述并填入。还没配置时点 ✨ 会直接跳到这一页。

内置的服务商：

- OpenRouter、OpenAI、Anthropic、Google Gemini
- DeepSeek、Moonshot (Kimi)、智谱 (GLM)、阿里百炼 (Qwen)、SiliconFlow
- Ollama、LM Studio（本地）
- 自定义（任何 OpenAI 兼容接口）

说明：

- 只有本地服务和「自定义」需要填 Base URL。
- API key 存在系统钥匙串里，不经过界面层。
- 请求由主进程的 `net.fetch` 发出，跟随系统代理。
- diff 超过 6 万字符时按文件截断。
- 如果仓库里有 `.github/copilot-instructions.md`，它会被当作额外的写作要求一起发给模型。
- 你的 diff 会发给你选择的服务商。在意隐私的话，请用 Ollama 或 LM Studio。

代码在 [`app/src/lib/ai/`](app/src/lib/ai)，设置页在 [`app/src/ui/preferences/ai-settings.tsx`](app/src/ui/preferences/ai-settings.tsx)。

## 性能改动

- 不在当前选中的仓库闲置 5 分钟后，丢弃它的提交历史缓存和 diff。
- 语法高亮 worker 从常驻 2 个改为最多 1 个，闲置 30 秒后销毁。
- 打包时保留 dugite 里 git 的符号链接，不再展开成约 145 份 git 副本（省约 500 MB），并把链接改回包内相对路径，`codesign --verify --deep --strict` 可以通过。
- 打包时去掉内置的 Git Credential Manager（约 120 MB），内置 git 从约 160 MB 降到 40 MB。
- 生产构建不再生成 source map（出错时日志里的堆栈是压缩后的位置）。

试过但没采用：关闭硬件加速在 macOS 上反而让内存从 184 MB 升到 209 MB（GPU 进程仍在，改成软件渲染后渲染进程还会变大），所以没有提供这个开关。

内存实测（新启动，读数前强制 GC，单位 MB）：

| 场景 | 改造前 | 现在 |
| --- | --- | --- |
| 无仓库 | 137 | 136 |
| 18 个仓库 | 193 | 179 |
| 再打开一个大改动仓库 | 223 | 195 |

以上是新启动时的读数。长时间使用后的增长可以用 [`lite/bench/longrun.sh`](lite/bench/longrun.sh) 记录：它每小时记一次各进程内存到 CSV，可以同时跑官方版和 Lite 做对比。测量方法和脚本见 [`lite/bench/`](lite/bench/README.md)。

## 构建

需要 macOS，Node `24.22.1`（见 `.nvmrc`）和 Yarn。

```bash
nvm use
```

```bash
yarn
```

```bash
yarn build:prod
```

产物在 `dist/GitHub Desktop Lite-darwin-arm64/`。没有签名，第一次打开时右键选「打开」。

注意：

- `yarn build:prod` 会先清空 `out/`，旧构建的残留文件不会被打进安装包。
- 想用 GitHub 账号登录，需要自己注册一个 [GitHub OAuth App](https://github.com/settings/developers)，Callback URL 填 `x-github-desktop-lite-auth://oauth`，构建前设置环境变量：

  ```bash
  export DESKTOP_OAUTH_CLIENT_ID=<client id> DESKTOP_OAUTH_CLIENT_SECRET=<client secret>
  ```

  不设置时会用上游的开发用 OAuth App，回调协议是 `x-github-desktop-dev-auth`。

开发模式运行：

```bash
yarn build:dev && yarn start
```

测试和检查：

```bash
yarn test
```

```bash
yarn lint
```

更多开发环境细节见上游的 [`docs/contributing/setup.md`](docs/contributing/setup.md)。

## 许可证

**[MIT](LICENSE)**，沿用上游。

MIT 许可不包含 GitHub 的商标，包括 [`app/static/logos`](app/static/logos) 里的 Invertocat 等标志。GitHub® 及其标志是 GitHub 的商标或注册商标，使用时请遵守 [GitHub 标志使用规范](https://github.com/logos)。
