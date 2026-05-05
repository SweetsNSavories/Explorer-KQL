# Changelog

## v1.0.3 — 2026-05-05

- **Security:** Exported solution zips no longer contain environment-variable values. `deploy/export-solution.mjs` now strips every `environmentvariablevalues.json` from the resulting zip. Customers must provide values via the import wizard or the plugin will fail at runtime when reading the secret (intentional fail-fast).
- **Security:** All deploy scripts now read the SP secret from `$env:AAD_CLIENT_SECRET` instead of hardcoded literals.
- **Docs:** README + LICENSE (MIT) + SECURITY.md added. Personal-project / non-Microsoft disclaimer included in README and blog header.
- Custom security role (PPAC Kusto Reader) and custom systemuser form (Kusto Explorer) sections added to the blog.
- Architecture and "Inside the plugin" sections added to the blog (NuGet refs, AAD token POST, REST endpoint table with public Microsoft Learn references, sandbox notes).
- AI-instance dropdown styled to match date inputs (`.kxp-app-select`).

## v1.0.2 — 2026-05-05

- Sidebar restructured to dual-root tree (Tables + Queries) with a categorized accordion under Queries.
- Plugin extended with `AppendQueryPackQueries` to surface Log Analytics Query Pack queries (Alerts, Performance, Browsing data, Reports failures, …) alongside per-app `analyticsItems`.
- Org max upload file size raised from 16 MB to 125 MB to allow plugin push.
- Bundle URL pathing fix; `pac pcf push --publisher-prefix vip` adopted as the deploy path (also handles publisher renames).

## v1.0.1 — initial private export

- PCF control + plugin + Custom API + 4 environment-variable definitions + custom systemuser form + custom security role.
