# stars: GitHub Star visualization site in one fork

**[中文](README.md)**

Fork and go: fetch your starred repositories, build a Vue SPA, and deploy to GitHub Pages. The UI supports **Simplified Chinese / English** (header toggle or `?lang=en`).

---

## Quick start (fork & deploy)

For users who only want their own Star site without changing code:

1. **Fork** this repository to your account.
2. On the fork dialog, enable **Copy the DEFAULT branch only** so you do not copy the upstream `gh-pages` branch. If you copy all branches, your first successful CI run will overwrite `gh-pages` anyway.
3. In the forked repo: **Settings → Actions → General** — allow Actions to run (org policies may apply).
4. Wait for or manually run workflow **Build and Deploy My Stars** (see **Automatic deployment** below).
5. After the first deploy, check **Settings → Pages**: source should be **`gh-pages` branch / root** (set up by `peaceiris/actions-gh-pages` after the first green run).
6. Open: `https://<your-username>.github.io/<repo-name>/`

CI uses **`github.repository_owner`** and the **current repository name** to fetch stars and build. You usually **do not need to change scripts**. Optionally edit `config.json` at the repo root for site title, default sort, etc.

### Automatic deployment (GitHub Actions)

| Trigger             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| **push to `main`**  | Build and deploy after you push config or code         |
| **Daily 00:00 UTC** | Scheduled sync of latest stars                         |
| **Manual**          | Actions → _Build and Deploy My Stars_ → _Run workflow_ |

Pipeline: `generate` (GitHub API → `stars.json`) → `build:pages` (Vue → `web/dist`) → push to **`gh-pages`** (not `main`).

### Fork notes

- **`main` has no build artifacts**: `web/dist`, `web/public/stars.json`, and `site.json` are gitignored.
- **If you forked upstream `gh-pages`**: Pages may briefly show the upstream site until your workflow succeeds; run CI once or delete `gh-pages` on your fork and redeploy.
- **Renaming the repo**: CI updates `owner` / `repoName` in data and the Pages base path; change `pageConfig.siteName` in `config.json` yourself if you want a new title.

### Custom domain (GitHub Pages)

After you add a custom domain under **Settings → Pages**, the site is usually served at the **domain root** (`https://your-domain/`), not `https://<user>.github.io/<repo-name>/`.

CI `build:pages` reads **`deployConfig.pagesBase`** in `config.json` for the asset prefix (Vite `base`). The app loads `stars.json`, `site.json`, and bundles under that prefix.

| `pagesBase`        | URL you use                               | Notes                                      |
| ------------------ | ----------------------------------------- | ------------------------------------------ |
| `"repo"` (default) | `https://<user>.github.io/<repo-name>/`   | Prefix `/<repo-name>/`; default fork setup |
| `"root"`           | Custom domain root `https://your-domain/` | Prefix `/`; use with a custom domain       |

**Impact on features**: Filtering, UI languages, `?lang=en`, and CI star fetching are unchanged. A mismatched `pagesBase` usually causes **404s for assets or JSON** (blank page or endless loading).

**Custom domain steps**:

1. Configure the domain and DNS under **Settings → Pages** (HTTPS via GitHub).
2. Edit `config.json`: set `"deployConfig": { "pagesBase": "root", ... }`.
3. Push to `main` or run the workflow to **rebuild and deploy** (DNS alone is not enough).

For the default `*.github.io/<repo-name>/` URL, keep `"pagesBase": "repo"` — no other changes.

---

## Local development

### Requirements

- Node.js **20+**
- Git (to resolve `origin` and repo name)
- **`GITHUB_TOKEN` strongly recommended** for large star lists (~60 req/hour/IP unauthenticated vs ~5000/hour authenticated)

Create a [GitHub Personal Access Token](https://github.com/settings/tokens), then export it (use the block for your OS):

```bash
# macOS / Linux
export GITHUB_TOKEN=ghp_your_token
```

```powershell
# Windows PowerShell
$env:GITHUB_TOKEN="ghp_your_token"
```

```cmd
# Windows CMD
set GITHUB_TOKEN=ghp_your_token
```

> **Cross-platform note:** `OWNER=xxx npm run ...` works on **macOS / Linux / Git Bash** only. On **PowerShell** use `$env:OWNER="xxx"; npm run ...`; on **CMD** use `set OWNER=xxx && npm run ...`. All env-var examples below list all three.

### Which user’s stars are fetched?

| Scenario                     | Behavior                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Clone **your fork**          | Username from `origin` ✅                                                                    |
| Clone **upstream tool repo** | Does **not** fetch upstream author’s stars; tries `OWNER` → `GITHUB_TOKEN` → `gh auth login` |
| CI / Actions                 | Uses `github.repository_owner` ✅                                                            |

### Day-to-day dev (HMR)

```bash
npm install
npm run dev
```

Open **http://localhost:4173/**. `dev` runs `generate` then Vite.

The dev server listens on your LAN (`host: true`). The terminal prints a **Network** URL (e.g. `http://192.168.x.x:4173/`) for phones or other devices on the same Wi‑Fi (allow port **4173** in your firewall).

**UI-only work** (skip API fetch):

```bash
npm run dev:ui
```

Requires existing `web/public/stars.json` (run `npm run generate` once first).

Override owner (optional):

```bash
# macOS / Linux / Git Bash
OWNER=your-username npm run generate
GITHUB_TOKEN=ghp_xxx npm run generate
```

```powershell
# Windows PowerShell
$env:OWNER="your-username"; npm run generate
$env:GITHUB_TOKEN="ghp_xxx"; npm run generate
```

```cmd
# Windows CMD
set OWNER=your-username && npm run generate
set GITHUB_TOKEN=ghp_xxx && npm run generate
```

> Dev port **4173** (localhost + LAN). Stop it: `npm run dev:stop` (macOS / Linux / Windows).

### `REPO_NAME` and Pages base path

`REPO_NAME` is your **GitHub repository name** (e.g. after a fork you rename the repo to `my-stars`, use `my-stars`), not your GitHub username.

| Scenario                                  | Who sets `REPO_NAME`                                |
| ----------------------------------------- | --------------------------------------------------- |
| **GitHub Actions**                        | Automatically: `github.event.repository.name`       |
| **Local `build:pages` / `preview:pages`** | Must match production; defaults to `stars` if unset |

With `deployConfig.pagesBase` set to `"repo"`, the build uses `/<REPO_NAME>/` as the asset prefix. That must match the repo segment in `https://<user>.github.io/<repo-name>/`. If you **renamed the repo** after forking, set it explicitly when testing locally:

```bash
# macOS / Linux / Git Bash
REPO_NAME=your-repo-name npm run build:pages
REPO_NAME=your-repo-name npm run preview:pages
```

```powershell
# Windows PowerShell
$env:REPO_NAME="your-repo-name"; npm run build:pages
$env:REPO_NAME="your-repo-name"; npm run preview:pages
```

```cmd
# Windows CMD
set REPO_NAME=your-repo-name && npm run build:pages
set REPO_NAME=your-repo-name && npm run preview:pages
```

`npm run preview` (plain `build`) uses `base=/` and does **not** need `REPO_NAME`. With `pagesBase: "root"` (custom domain), the prefix is `/` and repo name path does not apply.

### Pre-release checks

| Command                 | Purpose                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| `npm run preview`       | `base=/` — local data and build                                    |
| `npm run preview:pages` | `base=/<REPO_NAME>/` (or `pagesBase`) — **closer to GitHub Pages** |

Both: `generate` + matching `build` + `vite preview` (port 4173). If your repo is not named `stars`, set `REPO_NAME` as above.

### Scripts

| Command                 | Description                                  |
| ----------------------- | -------------------------------------------- |
| `npm run dev`           | Fetch stars + Vite (`:4173`, HMR)            |
| `npm run dev:ui`        | Vite only, no fetch                          |
| `npm run dev:stop`      | Free port **4173** (cross-platform)          |
| `npm run generate`      | Write `web/public/stars.json`, `site.json`   |
| `npm run build`         | Local build (`base=/`)                       |
| `npm run build:pages`   | GitHub Pages build (`base` from `pagesBase`) |
| `npm run preview`       | generate + build + preview                   |
| `npm run preview:pages` | generate + build:pages + preview             |

---

## Site features

GitHub Stars–like browsing; one `stars.json`; filtering in the browser:

| Feature          | Description                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **Search**       | Repo name & description; `#vue` for exact topic filter (AND for multiple, e.g. `#vue #typescript`) |
| **Type**         | All / Sources / Forks                                                                              |
| **Language**     | Sidebar list with counts                                                                           |
| **License**      | Filter by SPDX license                                                                             |
| **Starred year** | Filter by year you starred                                                                         |
| **Sort**         | Recently starred / Recently active / Most stars                                                    |
| **Virtual list** | Smooth scrolling for thousands of items                                                            |
| **Stats**        | Totals, language/license breakdown, etc.                                                           |

### UI languages (site chrome)

- Header **中文 / EN** toggle.
- URL: `?lang=en` for English; default Chinese unless `defaultUiLocale` in `config.json` says otherwise.
- Star data is shared; UI locale does not duplicate `stars.json`.

### URL parameters (shareable filter state)

| Param           | Description                                           |
| --------------- | ----------------------------------------------------- |
| `lang`          | UI: `en` = English; omit = Chinese                    |
| `stars-q`       | Search; `#topic` for topic filter                     |
| `stars-lang`    | Programming language                                  |
| `stars-license` | License                                               |
| `stars-year`    | Year starred                                          |
| `stars-type`    | `sources` / `forks`                                   |
| `stars-sort`    | `recently_starred` / `recently_active` / `most_stars` |

---

## Performance

| Stage   | Approach                                                     |
| ------- | ------------------------------------------------------------ |
| Data    | Single `stars.json` fetch (~1–2MB for ~3k stars)             |
| List    | `@tanstack/vue-virtual` — visible rows only                  |
| Filters | In-memory filter/sort; debounced search (`searchDebounceMs`) |

For very large lists, set `pageConfig.maxItems` in `config.json` or tune `virtualRowHeight`.

---

## Configuration (`config.json`)

| Key                                         | Description                                                          | Default            |
| ------------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| `pageConfig.siteName`                       | Site title (not auto-updated on rename)                              | `Stars`            |
| `pageConfig.defaultUiLocale`                | Default UI: `zh-CN` / `en`                                           | `zh-CN`            |
| `pageConfig.defaultSort`                    | Default sort                                                         | `recently_starred` |
| `pageConfig.maxItems`                       | Max stars written (`0` = no limit)                                   | `0`                |
| `pageConfig.showLanguage`                   | Show language on cards                                               | `true`             |
| `pageConfig.showStarsCount`                 | Show star count on cards                                             | `true`             |
| `pageConfig.showLicense`                    | Show license on cards                                                | `true`             |
| `pageConfig.virtualRowHeight`               | Virtual list row height                                              | `140`              |
| `pageConfig.searchDebounceMs`               | Search debounce (ms)                                                 | `300`              |
| `pageConfig.toolRepoOwner` / `toolRepoName` | Footer link to tool repo                                             | `OXOYO` / `stars`  |
| `deployConfig.publishDir`                   | CI artifact dir on runner                                            | `web/dist`         |
| `deployConfig.forceOrphan`                  | Orphan `gh-pages` deploy                                             | `true`             |
| `deployConfig.pagesBase`                    | Asset prefix: `repo` = `/<repo-name>/`; `root` = `/` (custom domain) | `repo`             |

After edits: **local** — `generate` / `dev` again; **online** — push to `main` or run the workflow manually.

---

## Project layout

```
.github/workflows/build.yml   # Build & deploy
web/                          # Vue 3 + Vite SPA
  public/                     # stars.json, site.json (generated, not committed)
  src/                        # Components, state, i18n, styles
generate.js                   # GitHub Star API → JSON
config.json                   # Page & deploy settings
package.json
```

### Branches & deployment

- **`main`**: source and config only; **no** committed `web/dist` or generated JSON.
- **`gh-pages`**: static site written by CI for GitHub Pages.
- `deployConfig.publishDir` is the **upload folder on the CI runner**, not a path committed on `main`.

---

## License

[MIT License](LICENSE)
