# BelJar library

Static sample catalog served from `library/data/`. The Library sidebar reads `library/manifest.json`, which is regenerated from disk metadata.

## Layout

| Path | Role |
|------|------|
| `data/` | `.bel`, `.elf`, and `.cfg` files (the actual samples) |
| `catalog.json` | Section layout, folder blurbs, optional per-file descriptions |
| `manifest.json` | Generated tree for the UI (ids, paths, labels) |
| `refresh-manifest.mjs` | Scans `data/` + `catalog.json` → writes `manifest.json` |
| `sync-cfgs-from-beluga-w.mjs` | Copies `.cfg` files verbatim from `Beluga-W/` |

## Suite configs (`.cfg`)

`.cfg` files appear in the Library sidebar and preview alongside `.bel` and `.elf` samples (listed first within each folder). Inserting a folder still copies every project file in that folder, including all suite configs.

After changing library samples or updating the Beluga-W submodule:

```bash
npm run build                                  # sync cfgs + refresh manifest (among other steps)
npm run library:sync-cfgs                      # or sync cfgs alone
npm run library:refresh
npm test
```

Add folder descriptions in `catalog.json` under `folders` (key: `examples/foo` or `case-studies/bar`).
