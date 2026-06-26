# stars：一键生成 GitHub Star 可视化站点

**[English](README.en.md)**

Fork 即用：自动拉取你的 Star 列表，用 Vue SPA 生成静态页并部署到 GitHub Pages。支持**列表浏览**与 **Three.js 宇宙星图**两种视图，界面支持**简体中文 / English**（顶栏切换或 URL `?lang=en`）。

---

## 快速开始（Fork 部署）

适合「只想拥有自己的 Star 站点、不改代码」：

1. **Fork** 本仓库到你的账号。
2. 在 Fork 弹窗中建议勾选 **「仅复制默认分支」**（*Copy the DEFAULT branch only*），避免带上上游的 `gh-pages` 部署分支；未勾选也没关系，首次 CI 成功后会覆盖。
3. 打开 Fork 仓库 → **Settings → Actions → General**，允许运行 Actions（若组织有策略需一并放行）。
4. **首次部署（必做）** — Fork 完成**不会**自动跑 CI，需要你自己触发一次：
   - 推荐：打开 **Actions** → 左侧选 **Build and Deploy My Stars** → 右侧 **Run workflow** → 分支选 **`main`** → **Run workflow**，等待出现绿勾（约 1～5 分钟，Star 多会更久）。
   - 备选：向 `main` **push** 任意提交（也会触发，见下方「自动部署」）；或等到 **每天 0:00 UTC** 定时任务（首次仍建议先手动跑一次）。
5. 工作流成功后，在 **Settings → Pages** 确认源为 **`gh-pages` 分支 / 根目录**（`peaceiris/actions-gh-pages` 首次成功运行后会写好）。
6. 访问：`https://<你的用户名>.github.io/<仓库名>/`（Pages 生效可能再需 1～2 分钟）。

CI 会使用 **`github.repository_owner`** 与**当前仓库名**拉取 Star 并构建，一般**无需改脚本**。可选：编辑根目录 `config.json` 修改站点标题、默认排序等。

### 自动部署（GitHub Actions）

| 触发方式 | 说明 |
|----------|------|
| **push 到 `main`** | 仅当 `generate.js`、`config.json`、`package*.json`、`web/**` 或本 workflow 变更时自动构建（**改 README 等文档不会触发**） |
| **每天 0:00 UTC** | 定时同步最新 Star |
| **手动** | Actions → *Build and Deploy My Stars* → *Run workflow* |

流程：`generate`（GitHub API → `stars.json` + 预计算 `galaxy.json`）→ `build:pages`（Vue 构建到 `web/dist`）→ 推送到 **`gh-pages` 分支**（非 `main`）。

### Fork 注意

- **Fork 当下不会自动部署**：必须完成上文第 4 步（手动 Run workflow 或 push），站点才会生成你自己的 Star 数据。
- **`main` 不含构建产物**：`web/dist`、`web/public/stars.json`、`web/public/galaxy.json`、`site.json` 在 `.gitignore` 中，不会 Fork 到过期的 dist。
- **若 Fork 了上游的 `gh-pages`**：在首次自己的 CI 跑通前，Pages 可能短暂显示上游页面；跑通一次 workflow 或删除 Fork 里的 `gh-pages` 后再部署即可。
- **改仓库名**：CI 会更新数据里的 `owner` / `repoName` 与 Pages 路径；`pageConfig.siteName` 需自行在 `config.json` 修改后重新部署。

### 自定义域名（GitHub Pages）

在 **Settings → Pages** 绑定独立域名后，站点通常在**域名根路径**提供（`https://你的域名/`），而不是 `https://<用户>.github.io/<仓库名>/`。

CI 的 `build:pages` 会按 `config.json` 里的 **`deployConfig.pagesBase`** 决定资源前缀（Vite `base`），页面据此加载 `stars.json`、`site.json` 与 JS/CSS。

| `pagesBase` | 适用访问地址 | 说明 |
|-------------|--------------|------|
| `"repo"`（默认） | `https://<用户>.github.io/<仓库名>/` | 前缀为 `/<仓库名>/`，Fork 默认即可 |
| `"root"` | 独立域名根路径 `https://你的域名/` | 前缀为 `/`，绑定自定义域名时使用 |

**对功能的影响**：筛选、多语言、`?lang=en`、星图视图、CI 拉取 Star 等逻辑不变；若 `pagesBase` 与真实访问路径不一致，常见现象是 **静态资源或 JSON 404**（白屏、一直加载）。

**操作步骤（自定义域名）**：

1. 在 **Settings → Pages** 配置域名与 DNS（HTTPS 由 GitHub 处理）。
2. 编辑 `config.json`：`"deployConfig": { "pagesBase": "root", ... }`。
3. Push 到 `main` 或手动跑 workflow，**重新构建部署**（仅改 DNS 不够）。

继续使用默认 `*.github.io/<仓库名>/` 时，保持 `"pagesBase": "repo"` 即可，无需其他修改。

---

## 本地开发

### 环境要求

- Node.js **20+**
- 已安装 Git（用于解析 `origin` 与仓库名）
- **Star 较多时强烈建议**配置 `GITHUB_TOKEN`（未认证约 60 次/小时/IP，易限流；认证后约 5000 次/小时）

创建 [GitHub Personal Access Token](https://github.com/settings/tokens)（公开 Star 只需读公开信息；含私有 Star 需相应权限），在终端导出（任选与你系统匹配的一种）：

```bash
# macOS / Linux
export GITHUB_TOKEN=ghp_你的token
```

```powershell
# Windows PowerShell
$env:GITHUB_TOKEN="ghp_你的token"
```

```cmd
# Windows CMD
set GITHUB_TOKEN=ghp_你的token
```

> **跨平台说明**：`OWNER=xxx npm run ...` 这类写法仅适用于 **macOS / Linux / Git Bash**。在 **PowerShell** 用 `$env:OWNER="xxx"; npm run ...`；在 **CMD** 用 `set OWNER=xxx && npm run ...`。下文凡需临时设置环境变量的命令均给出三种写法。

### 拉取哪个用户的 Star？

| 场景 | 行为 |
|------|------|
| Fork 后 clone **你的** 仓库 | 从 `origin` 识别你的用户名 ✅ |
| 直接 clone **上游工具仓库** | **不会**误拉上游作者的 Star；依次尝试 `OWNER` → `GITHUB_TOKEN` → `gh auth login` |
| CI / Actions | 使用 `github.repository_owner` ✅ |

### 日常开发（热更新）

```bash
npm install
npm run dev
```

浏览器打开 **http://localhost:4173/**。`dev` 会先 `generate` 再启动 Vite。

开发服务已监听局域网（`host: true`）。终端会显示 **Network** 地址（如 `http://192.168.x.x:4173/`），同一 Wi‑Fi 下的手机或其它设备可用该地址访问（本机防火墙需放行 **4173**）。

**只改界面、不重新拉 Star**（避免限流、加快启动）：

```bash
npm run dev:ui
```

需已有 `web/public/stars.json`（先跑一次 `npm run generate`）。

手动指定（可选）：

```bash
# macOS / Linux / Git Bash
OWNER=你的用户名 npm run generate
GITHUB_TOKEN=ghp_xxx npm run generate
```

```powershell
# Windows PowerShell
$env:OWNER="你的用户名"; npm run generate
$env:GITHUB_TOKEN="ghp_xxx"; npm run generate
```

```cmd
# Windows CMD
set OWNER=你的用户名 && npm run generate
set GITHUB_TOKEN=ghp_xxx && npm run generate
```

> 开发端口 **4173**（本机 + 局域网）。结束占用该端口的进程：`npm run dev:stop`（支持 macOS / Linux / Windows）。

### `REPO_NAME` 与 Pages 路径

`REPO_NAME` 指**当前 GitHub 仓库名**（例如 Fork 后仓库叫 `my-stars`，则值为 `my-stars`），不是 GitHub 用户名。

| 场景 | 谁设置 `REPO_NAME` |
|------|-------------------|
| **GitHub Actions** | 自动：`github.event.repository.name` |
| **本地 `build:pages` / `preview:pages`** | 需与线上一致；未设置时默认 `stars` |

当 `deployConfig.pagesBase` 为 `"repo"` 时，构建资源前缀为 `/<REPO_NAME>/`，须与访问地址 `https://<用户>.github.io/<仓库名>/` 中的仓库名一致。Fork 后若**改了仓库名**，本地验证 Pages 构建请显式指定：

```bash
# macOS / Linux / Git Bash
REPO_NAME=你的仓库名 npm run build:pages
REPO_NAME=你的仓库名 npm run preview:pages
```

```powershell
# Windows PowerShell
$env:REPO_NAME="你的仓库名"; npm run build:pages
$env:REPO_NAME="你的仓库名"; npm run preview:pages
```

```cmd
# Windows CMD
set REPO_NAME=你的仓库名 && npm run build:pages
set REPO_NAME=你的仓库名 && npm run preview:pages
```

`npm run preview`（普通 `build`）使用 `base=/`，**不需要** `REPO_NAME`。`pagesBase` 为 `"root"`（自定义域名）时前缀为 `/`，同样不依赖仓库名路径。

### 发布前验证

| 命令 | 用途 |
|------|------|
| `npm run preview` | 本地根路径 `base=/`，验证数据与构建 |
| `npm run preview:pages` | `base=/<REPO_NAME>/`（或 `pagesBase`），**更接近 GitHub Pages 项目站** |

二者均为 `generate` + 对应 `build` + `vite preview`（端口 4173）。仓库名不是 `stars` 时，请配合上一节设置 `REPO_NAME`。

### 命令一览

| 命令 | 说明 |
|------|------|
| `npm run dev` | 拉取 Star + Vite（`:4173`，HMR） |
| `npm run dev:ui` | 仅 Vite，不拉取 Star |
| `npm run dev:stop` | 结束占用 **4173** 的进程（跨平台） |
| `npm run generate` | 生成 `web/public/stars.json`、`galaxy.json`、`site.json` |
| `npm run generate:galaxy` | 仅根据已有 `stars.json` 重新计算 `galaxy.json`（不拉 API） |
| `npm run build` | 本地构建（`base=/`） |
| `npm run build:pages` | GitHub Pages 构建（`base` 见 `pagesBase`） |
| `npm run preview` | generate + build + preview |
| `npm run preview:pages` | generate + build:pages + preview |

---

## 站点功能

类 GitHub Stars 浏览体验，数据来自 `stars.json`，筛选在浏览器内完成：

| 能力 | 说明 |
|------|------|
| **搜索** | 仓库名、描述；支持 `#vue` 按 topic 精确筛选（多标签 AND，如 `#vue #typescript`） |
| **类型** | All / Sources / Forks |
| **编程语言** | 侧栏语言列表与数量 |
| **协议** | 按 SPDX 协议筛选 |
| **标星年份** | 按标星时间年份筛选 |
| **排序** | Recently starred / Recently active / Most stars |
| **虚拟列表** | 数千条 Star 流畅滚动 |
| **统计** | 总数、语言/协议分布等 |
| **视图切换** | 列表 / 宇宙星图（WebGL；不支持时自动禁用星图入口） |

### 宇宙星图

顶栏 **列表 / 星图** 切换进入 3D 视图。星图与列表共用同一份筛选结果（搜索、语言、协议、排序等），并额外支持图例内筛选。

**空间语义**

| 层级 | 含义 |
|------|------|
| **语言团** | 按编程语言聚类，对应宇宙中的「星系」 |
| **Topic 环 / 云团** | 同一语言下，热门 topic 形成环状或云状结构 |
| **虚拟星** | 每个仓库按 topic 展开为一颗或多颗星；无 topic 时占一颗占位星 |
| **星点大小** | 按仓库 Star 数分位映射；亮度含推送时效等视觉权重 |

布局在 `generate` 阶段预计算写入 `galaxy.json`，前端按需加载；若缺失则回退为浏览器内实时计算（与预计算使用同一套 v3 摆位算法）。

**交互**

| 操作 | 说明 |
|------|------|
| **左键拖拽** | 环绕观察（Orbit） |
| **滚轮 / `+` `-`** | 缩放（带缓动） |
| **中键拖拽 / 双指 pinch** | 缩放 |
| **右键拖拽** | 平移 |
| **单击星点** | 飞入并打开详情 |
| **悬停** | 显示仓库名与 Star 数 |
| **方向键** | 微调视角 |
| **`R`** | 还原默认视图 |
| **自转开关** | 工具栏切换相机自动旋转 |
| **图例** | 按语言、Star 分级（50k+ / 10k+ / 1k+ / &lt;1k）高亮筛选 |
| **定位** | 飞入「最早 star 的仓库」或当前详情仓库 |
| **铺满** | 星图区域全屏展开（桌面端） |

**详情面板**：默认紧凑展示；可展开完整信息；**定位**按钮（或快捷键 **`L`**）飞入当前仓库；**`Esc`** 关闭。

**提示**：自转开启时，按下左键会短暂冻结运动以提高点选成功率；移入画布不会暂停自转。

### 界面多语言（站点 UI）

- 顶栏 **中文 / EN** 切换。
- URL：`?lang=en` 为英文；缺省为中文（可由 `config.json` 的 `defaultUiLocale` 配置默认）。
- Star 数据共用一份 `stars.json`，与 UI 语言无关。

### URL 参数（可分享筛选状态）

| 参数 | 说明 |
|------|------|
| `lang` | UI：`en` 英文；缺省中文 |
| `stars-q` | 搜索；`#topic` 为 topic 筛选 |
| `stars-lang` | 编程语言 |
| `stars-license` | 开源协议 |
| `stars-year` | 标星年份 |
| `stars-type` | `sources` / `forks` |
| `stars-sort` | `recently_starred` / `recently_active` / `most_stars` |
| `stars-view` | `galaxy` 打开星图视图 |
| `stars-focus` | 星图中定位的仓库 id（如 `owner/repo`） |
| `stars-galaxy-expand` | `1` 星图区域铺满内容区 |

示例：`?stars-view=galaxy&stars-focus=vuejs/core&lang=en`

---

## 性能说明

| 环节 | 策略 |
|------|------|
| 数据 | 一次加载 `stars.json`（约 1～2MB / 3000 条量级） |
| 星图布局 | `galaxy.json` 构建时预计算；星图组件异步分包加载 |
| 列表 | `@tanstack/vue-virtual`，仅渲染可见区域 |
| 星图 | WebGL + Three.js；可见时持续渲染，页面隐藏时暂停动画循环 |
| 筛选 | 内存 filter + sort；搜索防抖（`searchDebounceMs`） |

条数极大时可在 `config.json` 设置 `pageConfig.maxItems` 限制 generate 写入条数，或调整 `virtualRowHeight`。

---

## 配置（`config.json`）

| 配置项 | 说明 | 默认 |
|--------|------|------|
| `pageConfig.siteName` | 站点标题（不随仓库改名自动变化） | `Stars` |
| `pageConfig.defaultUiLocale` | 默认 UI 语言：`zh-CN` / `en` | `zh-CN` |
| `pageConfig.defaultSort` | 默认排序 | `recently_starred` |
| `pageConfig.maxItems` | 最多写入条数（`0` = 不限） | `0` |
| `pageConfig.showLanguage` | 卡片显示语言 | `true` |
| `pageConfig.showStarsCount` | 卡片显示 Star 数 | `true` |
| `pageConfig.showLicense` | 卡片显示协议 | `true` |
| `pageConfig.virtualRowHeight` | 虚拟列表行高 | `140` |
| `pageConfig.searchDebounceMs` | 搜索防抖（毫秒） | `300` |
| `pageConfig.toolRepoOwner` / `toolRepoName` | 页脚工具仓库链接 | `OXOYO` / `stars` |
| `deployConfig.publishDir` | CI 构建产物目录（runner 上路径） | `web/dist` |
| `deployConfig.forceOrphan` | `gh-pages` 孤儿分支覆盖部署 | `true` |
| `deployConfig.pagesBase` | Pages 资源前缀：`repo` = `/<仓库名>/`；`root` = `/`（自定义域名） | `repo` |

修改配置后：**本地**重新 `generate` / `dev`；**线上** push 到 `main` 或手动跑 workflow。

---

## 项目结构

```
.github/workflows/build.yml   # 构建与部署
web/                          # Vue 3 + Vite SPA
  public/                     # stars.json、galaxy.json、site.json（generate 生成，不提交）
  src/
    components/               # 列表、星图、筛选、统计等 UI
    galaxy/                   # 星图布局、运动、拾取、缩放（Three.js）
    composables/              # 状态、主题、i18n
generate.js                   # 拉取 GitHub Star API 并生成 JSON
scripts/
  compute-galaxy-layout.mjs   # 星图摆位预计算
config.json                   # 页面与部署配置
package.json
```

### 部署与分支说明

- **`main`**：仅源码与配置；**不提交** `web/dist` 与生成 JSON。
- **`gh-pages`**：由 CI 写入静态站点，供 GitHub Pages 发布。
- `deployConfig.publishDir` 表示 CI 在 runner 上打包后的**上传目录**，不是 Git 里 `main` 上的路径。

---

## 许可证

[MIT License](LICENSE)
