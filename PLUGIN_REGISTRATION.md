# Plugin Registration via Web API (no PRT, no solution import)

This project registers/updates the Custom API plugin (`vip.AzureMonitor.AzureMonitorQuerySDKPlugin`,
assembly `vip.AzureMonitorQuery`) by direct Dataverse Web API calls. PRT (Plugin Registration Tool)
is **not** used during dev. Customer ships via the managed solution.

Authoritative script: [deploy/register-azuremonitor.mjs](deploy/register-azuremonitor.mjs)
Cleanup script:      [deploy/delete-old-plugin.mjs](deploy/delete-old-plugin.mjs)
SDK message lookup:  [deploy/find-sdkmsg.mjs](deploy/find-sdkmsg.mjs)

## Known IDs (org `https://orgd90897e4.crm.dynamics.com`)

| Thing | Id |
|---|---|
| Tenant | `1557f771-4c8e-4dbd-8b80-dd00a88e833e` |
| Solution `KustoExplorerSolution` | `60d1fecb-6c27-4757-9bed-70dcda4c5e94` |
| Custom API `vip_conversationdiagnostics` (customapiid) | `508876c2-7747-f111-bec7-7c1e521ab35c` |
| sdkmessageid for `vip_conversationdiagnostics` | `16ff39be-0d64-4f70-82a9-e07f4c1b5405` |
| Current assembly `vip.AzureMonitorQuery` | `847086ea-3248-f111-bec6-7c1e5267f8c3` |
| Current plugintype `vip.AzureMonitor.AzureMonitorQuerySDKPlugin` | `4c1943eb-3248-f111-bec6-6045bdd91664` |
| Current stage-20 step | `4bed540a-3348-f111-bec6-7ced8d1dc79f` |
| SecureConfig row (shared/reused) | `870efece-7747-f111-bec7-7c1e521ab35c` |

The CustomAPI id `153cad4e-6585-f011-b4cb-7c1e5217c8fa` that appears in some older docs is **wrong** —
it's from a different env. Always re-derive ids from `customapis?$filter=uniquename eq 'vip_conversationdiagnostics'`.

## Auth

`@azure/msal-node` interactive cache, file `.token-cache.json` in `deploy/`. ClientId
`51f81489-12ee-4a9e-aaae-a2591f45987d` (PowerApps CLI public client). Scope `${ORG}/.default`.

## Step-by-step the script does

1. **Upload assembly** — `PATCH pluginassemblies(<id>)` with base64 `content` of the built DLL.
   - DLL: `PreOpPlugin/bin/Release/net462/vip.AzureMonitorQuery.dll`
   - Build: `cd PreOpPlugin; Remove-Item -Recurse -Force bin,obj; dotnet build -c Release -nologo`
   - Assembly is signed with `vip.snk`, sandbox isolation `mode=2`.
   - Equivalent to PRT "Update Assembly".

2. **Plugin type** — `POST plugintypes`:
   ```json
   { "typename": "vip.AzureMonitor.AzureMonitorQuerySDKPlugin",
     "name": "vip.AzureMonitor.AzureMonitorQuerySDKPlugin",
     "friendlyname": "Azure Monitor Query SDK Plugin",
     "assemblyname": "vip.AzureMonitorQuery",
     "pluginassemblyid@odata.bind": "/pluginassemblies(<id>)" }
   ```
   Idempotent: GET first by `typename` filter and reuse.

3. **Stage-20 step** — `POST sdkmessageprocessingsteps`:
   ```json
   { "name": "vip.AzureMonitorQuery Token Primer (Stage 20)",
     "mode": 0, "rank": 1, "stage": 20,
     "supporteddeployment": 0, "invocationsource": 0,
     "sdkmessageid@odata.bind": "/sdkmessages(16ff39be-0d64-4f70-82a9-e07f4c1b5405)",
     "plugintypeid@odata.bind": "/plugintypes(<new>)" }
   ```
   - **Valid `stage` values for new SDK steps: 10, 20, 40, 50.** Stage 30 (MainOperation)
     is reserved for Custom API impl and **rejected** with error
     `0x80044184 "Invalid plug-in registration stage"`.
   - SecureConfig is shared by `PATCH sdkmessageprocessingstepsecureconfigs(870efece-…)`
     with `sdkmessageprocessingstepid@odata.bind` pointing at the new step. Same row,
     no re-typing of the `{tenantId,clientId,clientSecret}` JSON.

4. **Stage-30 binding (Custom API impl)** — **Not** an `sdkmessageprocessingstep`!
   Custom APIs hold the impl on the `customapi` entity itself:
   ```http
   PATCH /api/data/v9.2/customapis(508876c2-7747-f111-bec7-7c1e521ab35c)
   { "PluginTypeId@odata.bind": "/plugintypes(<new>)" }
   ```
   The lookup name on the wire is **`PluginTypeId`** (capital P, T) — case-sensitive.
   This is what the maker portal "Plugin Type" dropdown does. Forgetting this and POSTing
   a stage-30 sdkmessageprocessingstep is the most common mistake; it returns 400.

5. **Solution add** — `POST AddSolutionComponent` for:
   - `ComponentType 91` PluginAssembly
   - `ComponentType 90` PluginType (often returns 404 when auto-included as child of an
     already-included assembly — harmless, ignore)
   - `ComponentType 92` SdkMessageProcessingStep (stage-20 only)
   - `customapi` itself + role were already in the solution, no action needed.

6. **Publish** — `POST PublishXml` (or `PublishAllXml`).

## Cleanup of old plugin

Order: delete steps → plugin type → assembly. **Don't** call `RemoveSolutionComponent`
first — Dataverse cascades the solution-component removal during the entity DELETE.
Calls to `RemoveSolutionComponent` may 400 with code `0x80048d19`; that's harmless and
not an actual failure.

## Why not solution import / PRT?

- Round-trip too slow during dev (export, edit XML, import).
- PRT desktop tool needs Windows OAuth popup and doesn't survive headless.
- REST script is idempotent, scriptable, replayable.
- Customer side **does** ship as managed solution — they import a `.zip`, the same
  `pluginassembly`/`plugintype`/`sdkmessageprocessingstep`/`customapi` rows materialise
  via solution import. They do **not** run any script.

## Common mistakes I have made (don't repeat)

1. POSTing a `stage:30` sdkmessageprocessingstep for a Custom API → 400. Use
   `PATCH customapis(<id>) { "PluginTypeId@odata.bind": ... }`.
2. Lower-casing `plugintypeid@odata.bind` on customapi → 400 "undeclared property".
   Use `PluginTypeId@odata.bind`.
3. Hardcoding sdkmessageid from another tenant. Always look it up:
   `sdkmessages?$filter=name eq 'vip_conversationdiagnostics'`.
4. Hardcoding customapi id from another tenant. Always look it up:
   `customapis?$filter=uniquename eq 'vip_conversationdiagnostics'`.
5. Inline `node -e "..."` in PowerShell — `$select`/`$filter` get eaten by PS variable
   expansion. Always write a `.mjs` file in `deploy/` and `node ./deploy/foo.mjs`.
6. Trying to PATCH `customcontrols.version` to bust PCF cache — that field is
   read-only via Web API. Use HTTP cache clear (Ctrl+Shift+R / CDP
   `Network.clearBrowserCache`) or wait for natural TTL.
7. Forgetting `ComponentType` numbers: 91=assembly, 90=plugintype, 92=step,
   20=role, 300=customapi.
