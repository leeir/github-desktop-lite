<div align="center">
  <img src="app/static/common/logo-64x64@2x.png" width="96" height="96" alt="GitHub Desktop Lite logo" />
  <h1>GitHub Desktop Lite</h1>
  <p>A lighter, faster Git client derived from official <a href="https://github.com/desktop/desktop">GitHub Desktop</a> — built for bring-your-own-key AI commits, lower memory usage, and distraction-free code review.</p>
  <p>
    <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
  </p>
</div>

> **Independent Edition**: GitHub Desktop Lite is forked and redesigned from official GitHub Desktop (`3.6.9-beta1`, MIT) as a standalone client with no upstream sync or auto-updates. It uses its own app name, Bundle ID (`com.leeir.GitHubDesktopLite`), data directory, keychain entries, and OAuth protocol, so it can run side-by-side with the official app.

![Review workspace](docs/screenshots/review-changes.png)

## Key Advantages

- **Lighter Footprint & Lower Idle Memory**
  - **Stripped bloat**: Removes the Copilot runtime, usage telemetry, auto-updater, onboarding tutorial, and the ~120 MB built-in .NET Git Credential Manager. The macOS arm64 bundle shrinks from **~1.1 GB** down to **~335 MB**.
  - **Preserved git symlinks**: Keeps dugite's ~145 git subcommand symlinks instead of duplicating binaries on disk.
  - **Runtime optimization**: Lazy-loads heavy dialogs and `@xterm/xterm` via webpack code-splitting, serializes syntax highlighting onto a single warm worker, trims inactive repository caches after 5 minutes of idle time, pauses animations when unfocused, and clears WebFrame caches when the window stays hidden.
- **Bring Your Own Model for Commit Messages (BYOK)**
  - No Copilot subscription required—paste your own API key to draft commit titles and descriptions in one click.
  - Built-in support for **OpenRouter, OpenAI, Anthropic, Google Gemini, DeepSeek, Moonshot (Kimi), Zhipu (GLM), Alibaba Qwen, SiliconFlow, Ollama, LM Studio**, and any OpenAI-compatible endpoint.
  - API keys are stored only in your OS keychain and sent directly from the main process via `net.fetch` (respecting system proxies). Supports repository `.github/commit-instructions.md` rules (with smart per-file diff truncation above 60k characters).
- **Redesigned Review / Files Dual Workspace**
  - **Review Mode**: Streamlined single-row toolbar, unified single-letter file status indicators (`A` / `M` / `D` / `R` / `C` / `!`), lightweight `fs.watch` working-tree auto-refresh, clean zero-changes empty state with hidden commit composer, and an automatic file filter bar when changes exceed 20 files.
  - **Files Mode**: On-demand directory tree (no persistent background indexing), fast filename filtering, bounded read-only syntax-highlighted file preview (up to 256 KiB / 10,000 lines), and in-file find (`⌘F`).
- **Streamlined Local & Multi-Repo Workflows**
  - **Instant Local Repositories**: Add and open local Git folders directly from the folder picker—no GitHub sign-in required.
  - **Batch Fast-Forward Pull**: Safely fast-forward all added repositories' current branches in sequence (cleanly skips repos with local edits, divergence, or no upstream without auto-stashing or rebasing).

## Official vs. Lite

| Feature | Official GitHub Desktop | GitHub Desktop Lite |
| --- | --- | --- |
| AI Commit Messages | Requires Copilot subscription & background runtime | Bring your own API key (cloud providers or local Ollama / LM Studio) |
| Bundle Size (macOS arm64) | ~1.1 GB | **~335 MB** |
| Telemetry / Auto-Update / Onboarding | Included | Completely removed (zero telemetry) |
| UI & Review Workflow | Classic layout | Review / Files dual modes, clean empty state, single-letter status badges |
| Built-in Code Browser | Not included | On-demand tree & syntax-highlighted read-only preview |
| Runtime & Idle Memory | Full persistent state cache | Lazy code-split bundles, single highlighter worker, 5-min idle repo trimming |

## Screenshots

| Clean Working Tree | Files Code Browser |
| --- | --- |
| ![Clean empty state](docs/screenshots/review-clean-empty.png) | ![Files browser](docs/screenshots/files-browser.png) |

### BYOK AI Settings (`Settings → AI`)

![AI settings](docs/screenshots/settings-ai.png)

## Building from Source

Requires macOS, Node `24.22.1` (see [`.nvmrc`](.nvmrc)), and Yarn.

```bash
nvm use
yarn
yarn build:prod
```

The production app bundle is built at `dist/GitHub Desktop Lite-darwin-arm64/GitHub Desktop Lite.app`.

Common development commands:

```bash
# Run in development mode
yarn build:dev && yarn start

# Run unit tests & linters
yarn test
yarn lint
```

> To enable GitHub OAuth sign-in in custom builds, register a GitHub OAuth App with callback URL `x-github-desktop-lite-auth://oauth` and export `DESKTOP_OAUTH_CLIENT_ID` and `DESKTOP_OAUTH_CLIENT_SECRET` before building. Local workflows work without signing in.

## License & Attribution

- Released under the **[MIT License](LICENSE)**, derived from GitHub's official [desktop/desktop](https://github.com/desktop/desktop) (`3.6.9-beta1`).
- UI stroke icons are powered by [Lucide](https://lucide.dev) (`lucide-static`).
- The MIT License does not grant rights to GitHub's trademarks or logos (see [`app/static/logos`](app/static/logos)); follow the [GitHub Logos and Usage Guidelines](https://github.com/logos) when redistributing.
