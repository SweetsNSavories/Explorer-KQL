import { KqlExecutor, KqlExecutionResult } from "./KustoExplorer";

export interface AppEntry { name: string; appId: string; }
export interface SavedQuery { name: string; kql: string; category?: string; pack?: string; app?: string; }
export interface SchemaColumn { name: string; type: string; }
export interface SchemaTable { name: string; columns: SchemaColumn[]; }

/**
 * Custom API client for vip_azuremonitorquery (generic Azure Monitor / App Insights
 * KQL query executor). Operations:
 *   - "query" (default), "apps", "savedqueries", "schema"
 */
export class CustomApiKqlExecutor implements KqlExecutor {
    constructor(
        private readonly webApi: ComponentFramework.WebApi,
        private readonly customApiName: string,
    ) {}

    public async execute(query: string, opts: { appId?: string }): Promise<KqlExecutionResult> {
        const body = await this.invoke({ vip_KustoQuery: query, vip_AppId: opts.appId ?? "", vip_Operation: "query" });
        const parsed = this.parseDataJson(body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const obj = parsed as Record<string, unknown>;
            if (typeof obj.__error === "string") throw new Error(obj.__error);
            return { rows: [], raw: body };
        }
        return { rows: Array.isArray(parsed) ? parsed as Record<string, unknown>[] : [], raw: body };
    }

    public async getApps(): Promise<AppEntry[]> {
        const body = await this.invoke({ vip_Operation: "apps" });
        const v = this.parseDataJson(body);
        return Array.isArray(v) ? v as AppEntry[] : [];
    }

    public async getSavedQueries(): Promise<SavedQuery[]> {
        const body = await this.invoke({ vip_Operation: "savedqueries" });
        const v = this.parseDataJson(body);
        return Array.isArray(v) ? v as SavedQuery[] : [];
    }

    public async getSchema(appId: string): Promise<SchemaTable[]> {
        const body = await this.invoke({ vip_Operation: "schema", vip_AppId: appId });
        const v = this.parseDataJson(body);
        if (v && typeof v === "object" && !Array.isArray(v)) {
            const o = v as Record<string, unknown>;
            if (typeof o.__error === "string") throw new Error(o.__error);
        }
        return Array.isArray(v) ? v as SchemaTable[] : [];
    }

    // ---- internals ----

    private async invoke(inputs: Record<string, string>): Promise<Record<string, unknown>> {
        const merged: Record<string, string> = {
            vip_KustoQuery: "", vip_QueryName: "", vip__startTime: "", vip__endTime: "",
            vip_AppId: "", vip_Operation: "query",
            ...inputs,
        };
        const parameterTypes: Record<string, { typeName: string; structuralProperty: number }> = {};
        for (const k of Object.keys(merged)) parameterTypes[k] = { typeName: "Edm.String", structuralProperty: 1 };
        const request: Record<string, unknown> = { ...merged };
        request.getMetadata = () => ({
            boundParameter: null, operationType: 0, operationName: this.customApiName, parameterTypes,
        });

        const xrm = (window as unknown as {
            Xrm?: { WebApi?: { execute?: (r: unknown) => Promise<Response>; online?: { execute?: (r: unknown) => Promise<Response> } } };
        }).Xrm;

        let exec: ((r: unknown) => Promise<Response>) | undefined;
        if (xrm?.WebApi?.online?.execute) { const o = xrm.WebApi.online; exec = (r) => o.execute!(r); }
        else if (xrm?.WebApi?.execute) { const w = xrm.WebApi; exec = (r) => w.execute!(r); }
        else {
            const cw = this.webApi as unknown as { execute?: (r: unknown) => Promise<Response> };
            if (cw.execute) exec = (r) => cw.execute!(r);
        }
        if (!exec) throw new Error("Xrm.WebApi.execute is not available on this surface.");

        const response = await exec(request);
        if (!response.ok) throw new Error(`Custom API failed (${response.status}): ${await response.text()}`);
        return await response.json() as Record<string, unknown>;
    }

    private parseDataJson(body: Record<string, unknown>): unknown {
        // New generic name first, then back-compat with the old conversationdiagnostics shape.
        const json = (body.vip_ResultJson as string | undefined)
            ?? (body.vip_DiagnosticsDataJson as string | undefined)
            ?? (body.DiagnosticsDataJson as string | undefined) ?? "[]";
        try { return JSON.parse(json); } catch { throw new Error("Custom API returned non-JSON response."); }
    }
}
