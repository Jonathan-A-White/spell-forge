# Where the app is served

One source, two addresses (mw-79en7t.75, the hosting half of mw-79en7t.22):

| Address | Base | Built by |
|---|---|---|
| `https://jonathan-a-white.github.io/spell-forge/` (GitHub Pages) | `/spell-forge/` | `npm run build`, `.github/workflows/deploy.yml` on every push to `main` |
| `https://kestrel.allmymind.org/` (the VPS, as Lampas is) | `/` | `npm run build:vps` (`SF_BASE=/ npm run build`), `scripts/deploy-vps.sh` |

The base is chosen at build time by `scripts/app-base.mjs` (`SF_BASE`, default `/spell-forge/`, so the Pages build is exactly what it was).
Nothing else holds the path by hand: `index.html` uses `%BASE_URL%`, `src/sw.ts` uses `import.meta.env.BASE_URL`, and the manifest's
`start_url` and `scope` are `./`, which resolve against the manifest's own address (`/spell-forge/` on Pages, `/` on the VPS).
`tests/unit/app-base.test.ts` holds this. Not touched here, and still for mw-79en7t.22: the logo, name, the share link's address
(`src/features/settings/share-panel.tsx`), the old Pages redirect, and retiring the workflows (retiring `deploy.yml` would break the Pages address).

## Deploying to the VPS

`scripts/deploy-vps.sh` builds with `SF_BASE=/`, refuses a `dist/index.html` that still names `/spell-forge/`, and hands `dist/` to
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
- `curl -s https://kestrel.allmymind.org/ | grep '<title>'` shows `SpellForge`, not "Welcome to nginx!" or the placeholder;
- `curl -sI https://kestrel.allmymind.org/spelling` is 200 (the SPA fallback);
- `curl -sI https://kestrel.allmymind.org/sw.js` carries `Cache-Control: no-cache`;
- the Pages address opens unchanged;
- sweep: every `allmymind.org` host on the VPS answers with a valid certificate and none shows the stock nginx page.
