# Security policy

## Reporting a vulnerability

This is a personal open-source project (see [README](README.md) disclaimer). If you find a security issue:

- **Do not** open a public GitHub issue.
- Email the maintainer at `praveen@local` (replace with the address listed on the GitHub profile) with details and a proposed fix if you have one.
- Expect a best-effort response on a personal-time basis.

## Secret handling in this repo

The runtime trust boundary of Explorer-KQL is the Dataverse plugin: it holds an Azure AD service-principal client secret and proxies calls to Application Insights on behalf of the caller. A few rules the codebase follows so that secret never ends up where it shouldn't:

- **Never hardcode secrets.** Deploy scripts that need the SP secret read it from `$env:AAD_CLIENT_SECRET` and throw if it isn't set. See [`deploy/set-envvars.mjs`](deploy/set-envvars.mjs), [`deploy/set-secure-config.mjs`](deploy/set-secure-config.mjs), [`deploy/bind-scc.mjs`](deploy/bind-scc.mjs), [`deploy/register-stage20.mjs`](deploy/register-stage20.mjs), [`deploy/register-tokenprimer.mjs`](deploy/register-tokenprimer.mjs), [`deploy/rebuild-customapi.mjs`](deploy/rebuild-customapi.mjs).
- **Never ship environment-variable values.** [`deploy/export-solution.mjs`](deploy/export-solution.mjs) post-processes the exported `.zip` to delete every `environmentvariablevalues.json`. The shipped solution carries definitions only; the customer supplies values during the maker-portal import wizard.
- **Never commit token caches or signing keys.** `.gitignore` excludes `*.token-cache.json`, `*-token-cache.json`, `*.snk`, and any unverified zips under `dist/`.
- **In Dataverse, the secret is stored as a Secret-type environment variable.** Either inline (encrypted at rest by Dataverse) or as an Azure Key Vault reference. The plugin reads it with `RetrieveEnvironmentVariableSecretValue` either way.

If you fork this repo to your own tenant: rotate the SP secret immediately if it was ever pasted into a script literal, and verify any zip you publish externally with:

```powershell
Expand-Archive your.zip -DestinationPath tmp
Get-ChildItem tmp -Recurse -Filter environmentvariablevalues.json
```

If that command returns nothing, the zip is clean.
