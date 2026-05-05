using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace vip.AzureMonitor
{
    /// <summary>
    /// Plugin for the vip_azuremonitorquery Custom API. A generic Azure Monitor /
    /// Application Insights KQL query executor.
    /// Stage 20 (PreOperation) primes a token from the SecureConfig.
    /// Stage 30 (MainOperation) executes the requested operation:
    ///   apps | savedqueries | schema | query (default).
    /// Secret precedence (first non-empty wins):
    ///   1. Stage-20 step SecureConfig JSON: { tenantId, clientId, clientSecret }
    ///   2. Environment variable 'vip_AppInsightsClientSecret' (Secret type, Key Vault
    ///      backed in customer envs that use Vault). Stored encrypted in Dataverse otherwise.
    /// AppId/TenantId/ClientId (non-secret) come from environment variables.
    /// </summary>
    public sealed class AzureMonitorQuerySDKPlugin : PluginBase
    {
        public AzureMonitorQuerySDKPlugin() { }
        public AzureMonitorQuerySDKPlugin(string unsecureConfig, string secureConfig)
            : base(unsecureConfig, secureConfig) { }

        private const string EV_APP_ID        = "vip_AppInsightsAppId";
        private const string EV_TENANT_ID     = "vip_AppInsightsTenantId";
        private const string EV_CLIENT_ID     = "vip_AppInsightsClientId";
        // Secondary source for the secret. Primary is the Stage-20 step SecureConfig.
        private const string EV_CLIENT_SECRET = "vip_AppInsightsClientSecret";

        private const int MaxRows = 5000;

        // One static HttpClient per AppDomain (best practice).
        private static readonly HttpClient Http = new HttpClient(new HttpClientHandler
        {
            AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate
        });

        protected override void ExecutePlugin(LocalPluginContext ctx)
        {
            var pec = ctx.PluginExecutionContext;

            // Stage 20 (PreOperation): just prime the token cache from SecureConfig and exit.
            // Stage 30+ does the real Custom API work.
            if (pec.Stage == 20)
            {
                PrimeTokenFromSecureConfig(ctx);
                return;
            }

            // Pull inputs.
            string explicitQuery = GetInputString(pec, "vip_KustoQuery");
            string queryName     = GetInputString(pec, "vip_QueryName");
            string operation     = GetInputString(pec, "vip_Operation");
            string explicitAppId = GetInputString(pec, "vip_AppId");

            if (string.IsNullOrWhiteSpace(operation)) operation = "query";
            operation = operation.Trim().ToLowerInvariant();
            ctx.Trace("Operation=" + operation);

            try
            {
                if (operation == "apps")
                {
                    var apps = ResolveApps(ctx);
                    var arr = new JArray();
                    foreach (var a in apps) arr.Add(new JObject { ["name"] = a.Name, ["appId"] = a.AppId });
                    SetOutput(pec, arr.ToString(Formatting.None));
                    return;
                }
                if (operation == "savedqueries")
                {
                    var arr = new JArray();
                    foreach (var kv in SavedQueries.Queries)
                        arr.Add(new JObject { ["name"] = kv.Key, ["kql"] = kv.Value, ["category"] = "Built-in" });
                    // Append ARM shared queries (legacy analyticsItems → "Other")
                    try { AppendArmSharedQueries(ctx, arr); }
                    catch (Exception armEx) { ctx.Trace("ARM shared queries fetch failed: " + armEx.Message); }
                    // Append Query Pack queries (categorized: Alerts / Performance / etc.)
                    try { AppendQueryPackQueries(ctx, arr); }
                    catch (Exception qpEx) { ctx.Trace("Query pack queries fetch failed: " + qpEx.Message); }
                    SetOutput(pec, arr.ToString(Formatting.None));
                    return;
                }

                // schema and query both need creds + appId
                var apps2 = ResolveApps(ctx);
                if (apps2.Count == 0) { SetOutput(pec, JsonError("vip_AppInsightsAppId env var is empty.")); return; }
                string appId = !string.IsNullOrWhiteSpace(explicitAppId) ? explicitAppId : apps2[0].AppId;

                var tenantId     = ReadEnvVar(ctx, EV_TENANT_ID);
                var clientId     = ReadEnvVar(ctx, EV_CLIENT_ID);
                if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(clientId))
                { SetOutput(pec, JsonError("Missing tenant/client env vars.")); return; }

                var cacheKey = DeterministicGuid(clientId + "|" + tenantId);
                var token = ctx.TokenService.GetAccessToken(cacheKey);
                if (token == null)
                {
                    // Cache miss => Stage-20 SecureConfig was empty/invalid OR token expired.
                    // Fall back to the secondary source: 'vip_AppInsightsClientSecret' env var
                    // (Secret type, Key Vault backed when configured).
                    ctx.Trace("Stage30: token cache miss - falling back to env-var secret.");
                    var clientSecret = ReadEnvVar(ctx, EV_CLIENT_SECRET);
                    if (string.IsNullOrWhiteSpace(clientSecret))
                    {
                        SetOutput(pec, JsonError(
                            "No secret available. Provide it via either (a) the Stage-20 'TokenPrimer' step "
                            + "SecureConfig JSON {\"tenantId\":\"...\",\"clientId\":\"...\",\"clientSecret\":\"...\"}, "
                            + "or (b) the environment variable 'vip_AppInsightsClientSecret' (Secret type, "
                            + "Key Vault backed in supported environments)."));
                        return;
                    }
                    token = AcquireToken(ctx, tenantId, clientId, clientSecret, out var expiryUtc);
                    ctx.TokenService.SetAccessToken(cacheKey, token, expiryUtc);
                }

                if (operation == "schema")
                {
                    SetOutput(pec, GetSchema(ctx, appId, token));
                    return;
                }

                // Default: query.
                string kql;
                if (!string.IsNullOrWhiteSpace(explicitQuery)) { kql = explicitQuery; }
                else if (!string.IsNullOrWhiteSpace(queryName) && SavedQueries.Queries.TryGetValue(queryName, out kql)) { /* ok */ }
                else { SetOutput(pec, "[]"); return; }

                kql = ApplyRowCap(kql);
                SetOutput(pec, QueryAppInsights(ctx, appId, token, kql));
            }
            catch (Exception ex)
            {
                ctx.Trace("Plugin error: " + ex);
                SetOutput(pec, JsonError(ex.Message));
            }
        }

        private static string JsonError(string msg)
        {
            return new JObject { ["__error"] = msg }.ToString(Formatting.None);
        }

        /// <summary>
        /// Stage-20 entry point. Reads {tenantId,clientId,clientSecret} JSON from
        /// SecureConfig, acquires an AAD token and primes the static TokenService cache
        /// so the Stage-30 step never has to read the secret.
        /// </summary>
        private void PrimeTokenFromSecureConfig(LocalPluginContext ctx)
        {
            if (string.IsNullOrWhiteSpace(SecureConfig))
            {
                ctx.Trace("Stage20: SecureConfig empty; nothing to prime.");
                return;
            }

            string tenantId, clientId, clientSecret;
            try
            {
                var jo = JObject.Parse(SecureConfig);
                tenantId     = (string)jo["tenantId"];
                clientId     = (string)jo["clientId"];
                clientSecret = (string)jo["clientSecret"];
            }
            catch (Exception ex)
            {
                ctx.Trace("Stage20: SecureConfig JSON parse failed: " + ex.Message);
                return;
            }

            if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                ctx.Trace("Stage20: SecureConfig missing tenantId/clientId/clientSecret.");
                return;
            }

            var key = DeterministicGuid(clientId + "|" + tenantId);
            var existing = ctx.TokenService.GetAccessToken(key);
            if (existing != null)
            {
                ctx.Trace("Stage20: cache already warm; skipping AAD call.");
                return;
            }

            var token = AcquireToken(ctx, tenantId, clientId, clientSecret, out var expiryUtc);
            ctx.TokenService.SetAccessToken(key, token, expiryUtc);
            ctx.Trace("Stage20: primed cache key=" + key + " exp=" + expiryUtc.ToString("o"));
        }

        private struct AppEntry { public string Name; public string AppId; public string ArmId; }

        private List<AppEntry> ResolveApps(LocalPluginContext ctx)
        {
            var raw = ReadEnvVar(ctx, EV_APP_ID);
            var list = new List<AppEntry>();
            if (string.IsNullOrWhiteSpace(raw)) return list;
            raw = raw.Trim();
            if (raw.StartsWith("["))
            {
                try
                {
                    var arr = JArray.Parse(raw);
                    foreach (var t in arr)
                    {
                        if (t.Type == JTokenType.Object)
                        {
                            var n = (string)t["name"];
                            var a = (string)t["appId"];
                            var arm = (string)t["armId"];
                            if (!string.IsNullOrWhiteSpace(a)) list.Add(new AppEntry { Name = n ?? a, AppId = a, ArmId = arm });
                        }
                        else if (t.Type == JTokenType.String)
                        {
                            var s = (string)t;
                            list.Add(new AppEntry { Name = s, AppId = s });
                        }
                    }
                    return list;
                }
                catch (Exception ex) { ctx.Trace("AppId env var JSON parse failed: " + ex.Message); }
            }
            // Plain string fallback (single appId)
            list.Add(new AppEntry { Name = raw, AppId = raw });
            return list;
        }

        /// <summary>
        /// Fetches Application Insights shared analytics items (saved queries) from ARM
        /// for each configured app that provides an armId, and appends them to <paramref name="arr"/>.
        /// Items are named as "[appName] queryName" so users can tell them apart.
        /// </summary>
        private void AppendArmSharedQueries(LocalPluginContext ctx, JArray arr)
        {
            var apps = ResolveApps(ctx);
            var appsWithArm = apps.FindAll(a => !string.IsNullOrWhiteSpace(a.ArmId));
            if (appsWithArm.Count == 0) return;

            var tenantId = ReadEnvVar(ctx, EV_TENANT_ID);
            var clientId = ReadEnvVar(ctx, EV_CLIENT_ID);
            var clientSecret = ReadEnvVar(ctx, EV_CLIENT_SECRET);
            if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                ctx.Trace("ARM shared queries: tenant/client/secret env vars missing; skipping.");
                return;
            }

            // Separate cache key for ARM-scoped token.
            var cacheKey = DeterministicGuid(clientId + "|" + tenantId + "|arm");
            var armToken = ctx.TokenService.GetAccessToken(cacheKey);
            if (armToken == null)
            {
                armToken = AcquireTokenForScope(ctx, tenantId, clientId, clientSecret, "https://management.azure.com/.default", out var exp);
                ctx.TokenService.SetAccessToken(cacheKey, armToken, exp);
            }

            foreach (var app in appsWithArm)
            {
                try
                {
                    var armPath = app.ArmId.TrimEnd('/');
                    var url = "https://management.azure.com" + (armPath.StartsWith("/") ? "" : "/") + armPath
                        + "/analyticsItems?api-version=2015-05-01&scope=shared&type=query&includeContent=true";
                    var req = new HttpRequestMessage(HttpMethod.Get, url);
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", armToken);
                    var resp = Http.SendAsync(req).GetAwaiter().GetResult();
                    var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!resp.IsSuccessStatusCode)
                    {
                        ctx.Trace("ARM analyticsItems for " + app.Name + " HTTP " + (int)resp.StatusCode + ": " + body);
                        continue;
                    }
                    // Response is a JSON array of items with PascalCase props:
                    // [{ Name, Content, Scope, Type, Id, ... }, ...]
                    var items = JArray.Parse(body);
                    foreach (var it in items)
                    {
                        var qName = (string)(it["Name"] ?? it["name"]);
                        var qBody = (string)(it["Content"] ?? it["content"]);
                        if (string.IsNullOrWhiteSpace(qName) || string.IsNullOrWhiteSpace(qBody)) continue;
                        arr.Add(new JObject
                        {
                            ["name"] = "[" + app.Name + "] " + qName,
                            ["kql"] = qBody,
                            ["category"] = "Other",
                            ["app"] = app.Name,
                        });
                    }
                }
                catch (Exception ex)
                {
                    ctx.Trace("ARM shared queries for " + app.Name + " failed: " + ex.Message);
                }
            }
        }

        /// <summary>
        /// Fetches Microsoft.Insights/queryPacks queries scoped to each configured app's
        /// resource group (covers default packs + user-created packs like the ones shown in
        /// the App Insights "Queries" pane). Each query carries its category (Alerts /
        /// Browsing data / Performance / Reports failures / etc.) for accordion grouping.
        /// </summary>
        private void AppendQueryPackQueries(LocalPluginContext ctx, JArray arr)
        {
            var apps = ResolveApps(ctx);
            var appsWithArm = apps.FindAll(a => !string.IsNullOrWhiteSpace(a.ArmId));
            if (appsWithArm.Count == 0) return;

            var tenantId = ReadEnvVar(ctx, EV_TENANT_ID);
            var clientId = ReadEnvVar(ctx, EV_CLIENT_ID);
            var clientSecret = ReadEnvVar(ctx, EV_CLIENT_SECRET);
            if (string.IsNullOrWhiteSpace(tenantId) || string.IsNullOrWhiteSpace(clientId) || string.IsNullOrWhiteSpace(clientSecret))
            {
                ctx.Trace("Query packs: tenant/client/secret env vars missing; skipping.");
                return;
            }

            var cacheKey = DeterministicGuid(clientId + "|" + tenantId + "|arm");
            var armToken = ctx.TokenService.GetAccessToken(cacheKey);
            if (armToken == null)
            {
                armToken = AcquireTokenForScope(ctx, tenantId, clientId, clientSecret, "https://management.azure.com/.default", out var exp);
                ctx.TokenService.SetAccessToken(cacheKey, armToken, exp);
            }

            // Track packs we've already enumerated to avoid duplicates when multiple apps share an RG/sub.
            var seenPacks = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var seenRgs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (var app in appsWithArm)
            {
                try
                {
                    // Parse subscriptionId + resourceGroup from the AI armId.
                    // Format: /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Insights/components/{name}
                    var m = Regex.Match(app.ArmId, @"/subscriptions/([^/]+)/resourceGroups/([^/]+)/", RegexOptions.IgnoreCase);
                    if (!m.Success) { ctx.Trace("Query packs: could not parse sub/RG from armId for " + app.Name); continue; }
                    var subId = m.Groups[1].Value;
                    var rg = m.Groups[2].Value;
                    var rgKey = subId + "|" + rg;
                    if (!seenRgs.Add(rgKey)) continue; // RG already enumerated

                    var listUrl = "https://management.azure.com/subscriptions/" + subId
                                  + "/resourceGroups/" + rg
                                  + "/providers/Microsoft.Insights/queryPacks?api-version=2019-09-01-preview";
                    var listReq = new HttpRequestMessage(HttpMethod.Get, listUrl);
                    listReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", armToken);
                    var listResp = Http.SendAsync(listReq).GetAwaiter().GetResult();
                    var listBody = listResp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    if (!listResp.IsSuccessStatusCode)
                    {
                        ctx.Trace("Query pack list for " + app.Name + " RG " + rg + " HTTP " + (int)listResp.StatusCode + ": " + Truncate(listBody, 500));
                        continue;
                    }
                    var packsArr = (JArray)(JObject.Parse(listBody)["value"]) ?? new JArray();
                    foreach (var pack in packsArr)
                    {
                        var packId = (string)pack["id"];
                        var packName = (string)pack["name"];
                        if (string.IsNullOrWhiteSpace(packId) || !seenPacks.Add(packId)) continue;

                        var qUrl = "https://management.azure.com" + packId + "/queries?api-version=2019-09-01-preview&$top=200&includeBody=true";
                        var qReq = new HttpRequestMessage(HttpMethod.Get, qUrl);
                        qReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", armToken);
                        var qResp = Http.SendAsync(qReq).GetAwaiter().GetResult();
                        var qBody = qResp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                        if (!qResp.IsSuccessStatusCode)
                        {
                            ctx.Trace("Pack queries " + packName + " HTTP " + (int)qResp.StatusCode + ": " + Truncate(qBody, 500));
                            continue;
                        }
                        var queriesArr = (JArray)(JObject.Parse(qBody)["value"]) ?? new JArray();
                        foreach (var q in queriesArr)
                        {
                            var props = q["properties"] as JObject;
                            if (props == null) continue;
                            var displayName = (string)props["displayName"];
                            var body = (string)props["body"];
                            if (string.IsNullOrWhiteSpace(displayName) || string.IsNullOrWhiteSpace(body)) continue;

                            // Category: prefer related.categories[0]; fall back to "Other".
                            var category = "Other";
                            var related = props["related"] as JObject;
                            if (related != null)
                            {
                                var cats = related["categories"] as JArray;
                                if (cats != null && cats.Count > 0) category = (string)cats[0] ?? "Other";
                            }
                            // Pretty category names matching the portal pane.
                            category = MapCategoryName(category);

                            arr.Add(new JObject
                            {
                                ["name"] = displayName,
                                ["kql"] = body,
                                ["category"] = category,
                                ["pack"] = packName,
                            });
                        }
                    }
                }
                catch (Exception ex)
                {
                    ctx.Trace("Query packs for " + app.Name + " failed: " + ex.Message);
                }
            }
        }

        private static string MapCategoryName(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "Other";
            switch (raw.ToLowerInvariant())
            {
                case "applications": return "Alerts";
                case "audit": return "Audit";
                case "container": return "Containers";
                case "databases": return "Databases";
                case "desktopanalytics": return "Desktop Analytics";
                case "deployment": return "Deployment";
                case "iot": return "IoT";
                case "monitor": return "Monitor";
                case "network": return "Network";
                case "resources": return "Resources";
                case "security": return "Security";
                case "virtualmachines": return "Virtual Machines";
                case "windowsvirtualdesktop": return "Windows Virtual Desktop";
                case "workloads": return "Workloads";
                default:
                    // Title-case the raw value for unknown categories
                    return char.ToUpper(raw[0]) + raw.Substring(1);
            }
        }

        private string GetSchema(LocalPluginContext ctx, string appId, string token)
        {
            var url = "https://api.applicationinsights.io/v1/apps/" + appId + "/metadata";
            var req = new HttpRequestMessage(HttpMethod.Get, url);
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            var resp = Http.SendAsync(req).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode) throw new InvalidPluginExecutionException("Schema fetch failed (" + (int)resp.StatusCode + "): " + Truncate(body, 1500));
            // Reshape: {tables:[{name, columns:[{name,type}]}]}
            var jo = JObject.Parse(body);
            var outArr = new JArray();
            var tables = jo["tables"] as JArray;
            if (tables != null)
            {
                foreach (var t in tables)
                {
                    var cols = new JArray();
                    var tcols = t["columns"] as JArray;
                    if (tcols != null) foreach (var c in tcols) cols.Add(new JObject { ["name"] = (string)c["name"], ["type"] = (string)c["type"] });
                    outArr.Add(new JObject { ["name"] = (string)t["name"], ["columns"] = cols });
                }
            }
            return outArr.ToString(Formatting.None);
        }

        // ---- helpers ----

        private static string GetInputString(IPluginExecutionContext pec, string name)
        {
            return (pec.InputParameters.Contains(name) && pec.InputParameters[name] is string s) ? s : null;
        }

        private static void SetOutput(IPluginExecutionContext pec, string json)
        {
            pec.OutputParameters["vip_ResultJson"] = json;
        }

        private static string ApplyRowCap(string kql)
        {
            if (kql.ToLowerInvariant().Contains("take "))
            {
                return Regex.Replace(kql, @"take\s+(\d+)", m =>
                {
                    var n = int.Parse(m.Groups[1].Value);
                    return "take " + (n > MaxRows ? MaxRows.ToString() : m.Groups[1].Value);
                }, RegexOptions.IgnoreCase);
            }
            return kql + "\n| take " + MaxRows;
        }

        private static Guid DeterministicGuid(string input)
        {
            using (var md5 = System.Security.Cryptography.MD5.Create())
            {
                var bytes = md5.ComputeHash(Encoding.UTF8.GetBytes(input));
                return new Guid(bytes);
            }
        }

        /// <summary>Look up an environment variable by schema name; prefer the value row, else the default.</summary>
        private string ReadEnvVar(LocalPluginContext ctx, string schemaName)
        {
            var defs = ctx.SystemUserService.RetrieveMultiple(new QueryExpression("environmentvariabledefinition")
            {
                ColumnSet = new ColumnSet("environmentvariabledefinitionid", "defaultvalue", "schemaname"),
                Criteria = new FilterExpression { Conditions = { new ConditionExpression("schemaname", ConditionOperator.Equal, schemaName) } },
                TopCount = 1
            });
            if (defs.Entities.Count == 0)
            {
                ctx.Trace("Env var definition not found: " + schemaName);
                return null;
            }
            var defRow = defs.Entities[0];
            var defId  = defRow.Id;
            var defaultValue = defRow.GetAttributeValue<string>("defaultvalue");

            var vals = ctx.SystemUserService.RetrieveMultiple(new QueryExpression("environmentvariablevalue")
            {
                ColumnSet = new ColumnSet("value"),
                Criteria = new FilterExpression { Conditions = { new ConditionExpression("environmentvariabledefinitionid", ConditionOperator.Equal, defId) } },
                TopCount = 1
            });
            if (vals.Entities.Count > 0)
            {
                var v = vals.Entities[0].GetAttributeValue<string>("value");
                if (!string.IsNullOrWhiteSpace(v)) return v;
            }
            return defaultValue;
        }

        private string AcquireToken(LocalPluginContext ctx, string tenantId, string clientId, string clientSecret, out DateTime expiryUtc)
        {
            return AcquireTokenForScope(ctx, tenantId, clientId, clientSecret, "https://api.applicationinsights.io/.default", out expiryUtc);
        }

        private string AcquireTokenForScope(LocalPluginContext ctx, string tenantId, string clientId, string clientSecret, string scope, out DateTime expiryUtc)
        {
            ctx.Trace("Acquiring new AAD token from tenant " + tenantId + " scope=" + scope + ".");
            var url = "https://login.microsoftonline.com/" + tenantId + "/oauth2/v2.0/token";
            var form = new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string,string>("grant_type",    "client_credentials"),
                new KeyValuePair<string,string>("client_id",     clientId),
                new KeyValuePair<string,string>("client_secret", clientSecret),
                new KeyValuePair<string,string>("scope",         scope),
            });
            var resp = Http.PostAsync(url, form).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            if (!resp.IsSuccessStatusCode)
            {
                throw new InvalidPluginExecutionException("AAD token request failed (" + (int)resp.StatusCode + "): " + body);
            }
            var jo = JObject.Parse(body);
            var token = (string)jo["access_token"];
            var expiresIn = (int?)jo["expires_in"] ?? 3600;
            expiryUtc = DateTime.UtcNow.AddSeconds(expiresIn);
            return token;
        }

        private string QueryAppInsights(LocalPluginContext ctx, string appId, string token, string kql)
        {
            var url = "https://api.applicationinsights.io/v1/apps/" + appId + "/query";
            var payload = new JObject { ["query"] = kql };
            var req = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(payload.ToString(Formatting.None), Encoding.UTF8, "application/json")
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            var resp = Http.SendAsync(req).GetAwaiter().GetResult();
            var body = resp.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            ctx.Trace("App Insights HTTP " + (int)resp.StatusCode + " (body length " + body.Length + ").");
            if (!resp.IsSuccessStatusCode)
            {
                throw new InvalidPluginExecutionException("App Insights query failed (" + (int)resp.StatusCode + "): " + Truncate(body, 1500));
            }

            // Reshape App Insights response into the same row-array JSON the original plugin produced.
            var jo = JObject.Parse(body);
            var tables = jo["tables"] as JArray;
            var outRows = new JArray();
            if (tables != null && tables.Count > 0)
            {
                var table = tables[0];
                var cols = table["columns"] as JArray;
                var rows = table["rows"] as JArray;
                if (cols != null && rows != null)
                {
                    var colNames = new string[cols.Count];
                    for (int i = 0; i < cols.Count; i++) colNames[i] = (string)cols[i]["name"];
                    foreach (var row in rows)
                    {
                        var arr = (JArray)row;
                        var rowObj = new JObject();
                        for (int i = 0; i < colNames.Length && i < arr.Count; i++)
                            rowObj[colNames[i]] = arr[i];
                        outRows.Add(rowObj);
                    }
                }
            }
            return outRows.ToString(Formatting.None);
        }

        private static string Truncate(string s, int n) => s == null ? "" : (s.Length <= n ? s : s.Substring(0, n) + "…");
    }
}
