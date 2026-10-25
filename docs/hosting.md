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

The `[after_landing]` line for `~/.config/mw/config.toml` (the Mayor sets it; the lampas line is the model):

```toml
spell-forge = "npm ci --no-audit --no-fund && scripts/deploy-vps.sh"
```

## What the VPS needs (once)

An nginx site for `kestrel.allmymind.org`, next to Lampas's (`/etc/nginx/sites-enabled/lampas*`), and a certbot certificate:

```nginx
server {
    server_name kestrel.allmymind.org;
    root /var/www/kestrel;
    index index.html;

    location / { try_files $uri $uri/ /index.html; }                       # SPA fallback: /spelling opens the app
    location = /sw.js { add_header Cache-Control "no-cache"; try_files $uri =404; }
    location = /index.html { add_header Cache-Control "no-cache"; }
    location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; try_files $uri =404; }
}
```

then `certbot --nginx -d kestrel.allmymind.org` (which adds the 443 server and the redirect from 80). This block is written from the
brief, not copied from Lampas's file: compare it with `/etc/nginx/sites-enabled/lampas*` before using it, and keep whatever Lampas
does that this does not (headers, gzip, the `.well-known` location).

Check: `curl -sI https://kestrel.allmymind.org/` is 200 with a valid certificate; `curl -s https://kestrel.allmymind.org/ | grep '<title>'`
shows `SpellForge`; `curl -sI https://kestrel.allmymind.org/spelling` is 200; `curl -sI https://kestrel.allmymind.org/sw.js` carries
`Cache-Control: no-cache`; the Pages address still opens.
