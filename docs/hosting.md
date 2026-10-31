# Where the app is served

Kestrel is served at the root of `https://kestrel.allmymind.org/`, from the VPS, as Lampas is (mw-79en7t.75 hosting, mw-79en7t.22 the name).
The old address, `https://jonathan-a-white.github.io/spell-forge/` (GitHub Pages), shows a page that says Kestrel moved:

| Address | Base | Serves | Built by |
|---|---|---|---|
| `https://kestrel.allmymind.org/` (the VPS) | `/` | the app | `npm run build`, `scripts/deploy-vps.sh` |
| `https://jonathan-a-white.github.io/spell-forge/` (GitHub Pages) | `/spell-forge/` | the moved page | `npm run build:moved`, `.github/workflows/deploy.yml` on every push to `main` |

The app's base is chosen at build time by `scripts/app-base.mjs` (`SF_BASE`, default `/`). Nothing else holds the path by hand: `index.html` uses
`%BASE_URL%`, `src/sw.ts` uses `import.meta.env.BASE_URL`, and the manifest's `start_url` and `scope` are `/`. `tests/unit/app-base.test.ts` and
`tests/unit/manifest.test.ts` hold this. The Playwright specs open the app under `/spell-forge/` (`playwright.config.ts` sets `SF_BASE`), so a base
other than `/` stays proved to work; the moved page's own spec is `tests/e2e/moved.spec.ts`.

## The moved page (the old address)

`moved/index.html` and `src/moved/` (built by `vite.moved.config.ts` into `dist-moved/`, with `404.html` a copy so any old deep link lands on it). It
says "Kestrel has moved", offers "Save <name>'s data" for each child on the device (the app's own `exportProfile`, `src/data/import-export.ts`: a
browser keeps IndexedDB per origin, so the data does not follow the move) and "Open Kestrel". The grown-up opens Kestrel and restores the file with
"Import Profile" in Settings. `moved/public/sw.js` is a worker that takes over the old app's worker at once, deletes its caches and reloads open
windows, so an installed copy shows this page instead of the cached app. Retire it (and the workflow) when no one opens the old address any more.

## The name sweep (mw-79en7t.22): every `spell-forge` and `SpellForge` in `src/`, `public/` and `index.html`

Renamed to Kestrel (what a child or grown-up reads or what the phone shows): `index.html` (title, `apple-mobile-web-app-title`, icons),
`public/manifest.json`, the welcome ("Welcome to Kestrel!"), the front door's heading and the shared picture's alt text, the update bar, the error
boundary, Share (the panel's title, text and link, now `https://kestrel.allmymind.org/`; `share-app.ts`), the QR messages, "Share Kestrel", the
Settings hints, the Requests line, the About and What's new lines and the Credits' prose, the Composer's `appName`, the form door's name, and the backup
file (`kestrel-<name>-backup.json`).

Kept, and why:

| Where | What | Why kept |
|---|---|---|
| `src/data/db.ts` | the class `SpellForgeDB` and the database name `'SpellForgeDB'` (also `src/error-boundary.tsx`'s reset) | the children's data lives in that IndexedDB; a new name would hide it |
| `src/share/share-store.ts`, `src/sw.ts` | the parked-share database `'spell-forge-share'` | a stored name, and the worker imports no app code; nothing shows it |
| `src/grist/*.ts`, `src/features/*/*-send.ts`, `src/learn/mnemonic-pictures.ts` | the grind header `app: 'spellforge'` | the mill's identity for this app (grinds, examples, the licence's collection); renaming it is a change to the mill |
| `grinds/*.instructions.md`, `docs/grinds.md` | the tutor's prose still says "SpellForge" | not in `src/`; changing a grind's instructions needs its examples re-run against the mill, so it is its own story |
| `src/bsv/config.ts`, `src/bsv/node/*`, `src/bsv/contracts/toolchain/*` | `spell-forge` paths, package names and the compiler's cache directory | code and tooling names, nothing shown |
| `src/features/composer/*`, `src/features/tutor/speech-bar.tsx`, `*-theme.css`, `src/audio/*`, `src/look/*`, `src/learn/*`, `src/shell/*.ts` | `SpellForge` in comments, and `SPELLFORGE_COMPOSER_SETTINGS` | comments and an identifier: the code name, as the repo keeps it |
| `public/changelog.json` | three old entries say "SpellForge" | the changelog is history, each line as it was written for its version; new entries say Kestrel |
| `src/features/word-lists/qr-codec.ts`, `src/bsv/config.ts`, `src/features/front-door/front-door-flow.ts` | the QR prefix wording in comments, `'spellforge-leaderboard-testnet'`, the talks database `'spell-forge-talks'` | stored or on-chain names, nothing shown |
| the repository, the rig, `package.json`'s name | `spell-forge` | the story keeps the repo and rig name |

## Deploying to the VPS

`scripts/deploy-vps.sh` runs `npm run build` (base `/`), refuses a `dist/index.html` that still names `/spell-forge/` (a build made with `SF_BASE`
set), and hands `dist/` to
millwright's `contrib/site-deploy` (`docs/site-deploy.md` there): the new tree is copied beside the live one and swapped by renames, so
`/var/www/kestrel` is always one complete build and `/var/www/kestrel.prev` the last one. Roll back with
`mv /var/www/kestrel /var/www/kestrel.bad && mv /var/www/kestrel.prev /var/www/kestrel`.

The `[after_landing]` line in `~/.config/mw/config.toml` (set by the Governor's tap on the hands step `after-landing` of mw-79en7t.75; mw runs
it after each landing, and it does nothing while `scripts/deploy-vps.sh` is missing):

```toml
spell-forge = "[ ! -x scripts/deploy-vps.sh ] || { npm ci --no-audit --no-fund && scripts/deploy-vps.sh; }"
```

## The VPS site (set up once, by hands steps)

The server is set up by two hands steps on mw-79en7t.75, run as root on the VPS and never by a Builder (a Builder has no ssh to it):

1. `kestrel-site`: `/etc/nginx/sites-available/kestrel.allmymind.org`, linked into `sites-enabled`, a port-80 server for
   `kestrel.allmymind.org` with `root /var/www/kestrel`, the SPA fallback, `sw.js` and `index.html` with `Cache-Control: no-cache`, and
   `/assets/` cached for a year (immutable). It also put a placeholder `index.html` in `/var/www/kestrel`, which the first deploy replaces.
   (The step also tried `certbot`; this server has none.)
2. `kestrel-cert`: the certificate comes from **acme.sh**, as Lampas's does, not certbot: `acme.sh --issue --server letsencrypt
   -d kestrel.allmymind.org -w /var/www/kestrel --keylength ec-256`, which leaves it in
   `/etc/letsencrypt/kestrel.allmymind.org_ecc/`. The site file then becomes a copy of Lampas's own
   (`sites-enabled/lampas.allmymind.org.conf` with `lampas` changed to `kestrel`), named `kestrel.allmymind.org.conf`, so it has what Lampas
   has (the 443 server, the redirect from 80, the `.well-known` location, headers). If `nginx -t` refuses the copy the step puts the
   port-80 block back.

Way back, as root: remove `sites-enabled/kestrel.allmymind.org.conf` and `sites-available/kestrel.allmymind.org`, `nginx -t && nginx -s reload`, and
`acme.sh --remove -d kestrel.allmymind.org --ecc`.

## Live checks (after landing, the Mayor's)

- `curl -sI https://kestrel.allmymind.org/` is 200 with a valid certificate (no `-k`);
- `curl -s https://kestrel.allmymind.org/ | grep '<title>'` shows `Kestrel`, not "Welcome to nginx!" or the placeholder;
- `curl -sI https://kestrel.allmymind.org/spelling` is 200 (the SPA fallback);
- `curl -sI https://kestrel.allmymind.org/sw.js` carries `Cache-Control: no-cache`;
- the Pages address (`https://jonathan-a-white.github.io/spell-forge/`) shows "Kestrel has moved" with a save button and "Open Kestrel";
- sweep: every `allmymind.org` host on the VPS answers with a valid certificate and none shows the stock nginx page.
