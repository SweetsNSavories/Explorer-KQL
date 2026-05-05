import * as React from "react";
import { ChartView } from "./ChartView";
import { SchemaTable } from "./CustomApiExecutor";
import { KqlMonacoEditor, KqlMonacoEditorHandle } from "./KqlMonacoEditor";

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export interface KqlExecutor {
    execute(query: string, opts: { appId?: string }): Promise<KqlExecutionResult>;
}

export interface KqlExecutionResult {
    rows: Record<string, unknown>[];
    raw?: unknown;
}

/* ------------------------------------------------------------------ */
/*  Render directive parsing                                           */
/* ------------------------------------------------------------------ */

export type RenderKind =
    | "table" | "barchart" | "columnchart" | "linechart"
    | "areachart" | "stackedareachart" | "scatterchart"
    | "piechart" | "timechart" | "anomalychart"
    | "ladderchart" | "pivotchart" | "3Dchart";

export interface RenderDirective { kind: RenderKind; properties: Record<string, string>; }

const RENDER_REGEX = /\|\s*render\s+([A-Za-z0-9_]+)(?:\s+with\s*\(([^)]*)\))?/i;

export function parseRender(query: string): RenderDirective | undefined {
    const m = RENDER_REGEX.exec(query);
    if (!m) return undefined;
    const kind = m[1].toLowerCase() as RenderKind;
    const props: Record<string, string> = {};
    if (m[2]) {
        for (const part of m[2].split(",")) {
            const eq = part.indexOf("=");
            if (eq > 0) {
                const k = part.slice(0, eq).trim().toLowerCase();
                let v = part.slice(eq + 1).trim();
                if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
                props[k] = v;
            }
        }
    }
    return { kind, properties: props };
}

export function stripRender(query: string): string { return query.replace(RENDER_REGEX, "").trimEnd(); }

/* ------------------------------------------------------------------ */
/*  KQL completion vocabulary                                          */
/* ------------------------------------------------------------------ */

const KQL_KEYWORDS = [
    "where", "project", "project-away", "project-rename", "project-reorder",
    "extend", "summarize", "distinct", "count", "take", "limit", "top", "top-nested",
    "sort", "order", "by", "asc", "desc", "nulls", "first", "last",
    "join", "kind", "inner", "innerunique", "leftouter", "rightouter", "fullouter", "leftsemi", "rightsemi", "leftanti", "rightanti",
    "union", "lookup", "evaluate", "render", "mv-expand", "mv-apply", "parse", "parse-where", "make-series",
    "facet", "sample", "sample-distinct", "serialize", "reduce", "invoke", "as", "let", "materialize", "toscalar",
    "on", "with", "step", "from", "to",
    "ago", "now", "datetime", "timespan", "bin", "bin_auto", "floor", "ceiling",
    "startofday", "startofmonth", "startofweek", "startofyear", "endofday", "endofmonth", "endofweek",
    "format_datetime", "format_timespan", "strcat", "strlen", "substring", "split", "replace",
    "tolower", "toupper", "trim", "trim_start", "trim_end", "tostring", "toint", "tolong", "todouble", "toreal", "tobool",
    "isempty", "isnotempty", "isnull", "isnotnull", "iif", "case", "coalesce",
    "contains", "contains_cs", "has", "has_cs", "startswith", "endswith", "matches", "regex",
    "sum", "avg", "min", "max", "countif", "sumif", "dcount", "dcountif", "percentile", "percentiles",
    "make_list", "make_set", "make_bag", "any", "arg_max", "arg_min", "variance", "stdev",
    "timechart", "barchart", "columnchart", "linechart", "areachart", "piechart", "scatterchart", "stackedareachart", "anomalychart", "table",
    "true", "false", "null", "and", "or", "not", "between", "in", "!in",
];

function wordAtCaret(text: string, caret: number): { word: string; start: number } {
    let s = caret;
    while (s > 0 && /[A-Za-z0-9_-]/.test(text[s - 1])) s--;
    return { word: text.slice(s, caret), start: s };
}

function buildVocab(schema?: SchemaTable[]): string[] {
    const set = new Set<string>(KQL_KEYWORDS);
    if (schema) {
        for (const t of schema) {
            set.add(t.name);
            for (const c of t.columns) set.add(c.name);
        }
    }
    return Array.from(set).sort();
}

/* ------------------------------------------------------------------ */
/*  Single-tab Kusto Explorer body                                     */
/* ------------------------------------------------------------------ */

type ResultTab = "grid" | "chart" | "raw";

export interface IKustoExplorerProps {
    initialQuery: string;
    appId?: string;
    schema?: SchemaTable[];
    executor: KqlExecutor;
    onQueryChange: (q: string) => void;
    onInsertRequest?: (handler: (text: string) => void) => void; // expose insert callback
}

export interface KustoExplorerHandle {
    insertAtCursor: (text: string) => void;
    setQuery: (q: string) => void;
}

export const KustoExplorer = React.forwardRef<KustoExplorerHandle, IKustoExplorerProps>((props, ref) => {
    const [query, setQuery] = React.useState(props.initialQuery ?? "");
    const [running, setRunning] = React.useState(false);
    const [error, setError] = React.useState<string | undefined>(undefined);
    const [rows, setRows] = React.useState<Record<string, unknown>[]>([]);
    const [tab, setTab] = React.useState<ResultTab>("grid");
    const [elapsedMs, setElapsedMs] = React.useState<number | undefined>(undefined);
    // Default range: last 24 hours -> now (formatted for <input type="datetime-local">: YYYY-MM-DDTHH:mm).
    const fmtLocal = (d: Date) => {
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const [startTime, setStartTime] = React.useState<string>(() => fmtLocal(new Date(Date.now() - 24*60*60*1000)));
    const [endTime, setEndTime] = React.useState<string>(() => fmtLocal(new Date()));
    const editorRef = React.useRef<KqlMonacoEditorHandle>(null);

    const render = React.useMemo(() => parseRender(query), [query]);

    const handleQueryChange = React.useCallback((v: string) => {
        setQuery(v); props.onQueryChange(v);
    }, [props.onQueryChange]);

    React.useImperativeHandle(ref, () => ({
        insertAtCursor: (text: string) => {
            const ed = editorRef.current;
            if (!ed) { handleQueryChange(query + text); return; }
            ed.insertAtCursor(text);
        },
        setQuery: (q: string) => handleQueryChange(q),
    }), [query, handleQueryChange]);

    const run = React.useCallback(async () => {
        if (running) return;
        setRunning(true); setError(undefined);
        const started = performance.now();
        try {
            let toSend = stripRender(query).trim();
            if (!toSend) throw new Error("Query is empty.");
            // Substitute _startTime / _endTime tokens with KQL datetime() literals.
            if (startTime) {
                const iso = new Date(startTime).toISOString();
                toSend = toSend.replace(/\b_startTime\b/g, `datetime(${iso})`);
            }
            if (endTime) {
                const iso = new Date(endTime).toISOString();
                toSend = toSend.replace(/\b_endTime\b/g, `datetime(${iso})`);
            }
            const result = await props.executor.execute(toSend, { appId: props.appId });
            setRows(result.rows);
            setElapsedMs(performance.now() - started);
            if (render && render.kind !== "table") setTab("chart"); else setTab("grid");
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setRows([]); setElapsedMs(performance.now() - started);
        } finally { setRunning(false); }
    }, [query, running, props.executor, props.appId, startTime, endTime, render]);

    const columns = React.useMemo<string[]>(() => {
        if (!rows.length) return [];
        const set = new Set<string>();
        rows.forEach(r => Object.keys(r).forEach(k => set.add(k)));
        return Array.from(set);
    }, [rows]);

    return React.createElement(
        "div", { className: "kxp-pane" },
        React.createElement("div", { className: "kxp-toolbar" },
            React.createElement("button", { className: "kxp-btn", disabled: running, onClick: () => { void run(); } },
                running ? "Running..." : "▶ Run (Ctrl+Enter)"),
            React.createElement("label", { className: "kxp-toplabel", title: "Replaces the literal token _startTime in your KQL" }, "_startTime:"),
            React.createElement("input", {
                className: "kxp-time-input", type: "datetime-local",
                value: startTime,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setStartTime(e.target.value),
            }),
            React.createElement("label", { className: "kxp-toplabel", title: "Replaces the literal token _endTime in your KQL" }, "_endTime:"),
            React.createElement("input", {
                className: "kxp-time-input", type: "datetime-local",
                value: endTime,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEndTime(e.target.value),
            }),
            (startTime || endTime) ? React.createElement("button", {
                className: "kxp-time-clear", title: "Clear time range",
                onClick: () => { setStartTime(""); setEndTime(""); },
            }, "clear") : null,
            React.createElement("span", { style: { flex: 1 } }),
            React.createElement("button", {
                className: "kxp-btn kxp-btn-sm",
                disabled: !rows.length,
                onClick: () => {
                    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
                    downloadCsv(`kusto-results-${stamp}.csv`, columns, rows);
                },
                title: "Download all rows as CSV (opens in Excel)",
            }, "⬇ Export to Excel"),
        ),
        React.createElement("div", { className: "kxp-editor-wrap" },
            React.createElement(KqlMonacoEditor, {
                ref: editorRef,
                value: query,
                onChange: handleQueryChange,
                onRunRequest: () => { void run(); },
                schema: props.schema,
            }),
        ),
        React.createElement(StatusBar, { error, running, elapsedMs, rowCount: rows.length, render }),
        React.createElement(Tabs, { tab, setTab, hasRender: !!render && render.kind !== "table" }),
        React.createElement(
            "div", { className: "kxp-results" },
            tab === "grid" && React.createElement(Grid, { rows, columns }),
            tab === "chart" && React.createElement(ChartView, { rows, columns, render }),
            tab === "raw" && React.createElement("pre", { style: { margin: 0 } }, JSON.stringify(rows, null, 2))
        )
    );
});
KustoExplorer.displayName = "KustoExplorer";

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

const StatusBar: React.FC<{
    error?: string; running: boolean; elapsedMs?: number;
    rowCount: number; render?: RenderDirective;
}> = ({ error, running, elapsedMs, rowCount, render }) => {
    const cls = "kxp-status" + (error ? " error" : "");
    let msg: string;
    if (error) msg = "Error: " + error;
    else if (running) msg = "Running...";
    else msg = `${rowCount} row${rowCount === 1 ? "" : "s"}` + (typeof elapsedMs === "number" ? ` · ${elapsedMs.toFixed(0)} ms` : "");
    return React.createElement("div", { className: cls },
        React.createElement("span", null, msg),
        render ? React.createElement("span", null, `render: ${render.kind}`) : null,
    );
};

const Tabs: React.FC<{ tab: ResultTab; setTab: (t: ResultTab) => void; hasRender: boolean; }> = ({ tab, setTab, hasRender }) => {
    const mk = (id: ResultTab, label: string) =>
        React.createElement("button", { className: "kxp-tab" + (tab === id ? " active" : ""), onClick: () => setTab(id) }, label);
    return React.createElement("div", { className: "kxp-tabs" },
        mk("grid", "Grid"), mk("chart", hasRender ? "Chart ●" : "Chart"), mk("raw", "JSON"));
};

function downloadCsv(filename: string, columns: string[], rows: Record<string, unknown>[]): void {
    const esc = (v: unknown): string => {
        const s = formatCell(v);
        // Quote if contains delimiter/quote/newline; double inner quotes.
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines: string[] = [];
    lines.push(columns.map(esc).join(","));
    for (const r of rows) lines.push(columns.map(c => esc(r[c])).join(","));
    // UTF-8 BOM so Excel reads non-ASCII correctly.
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const Grid: React.FC<{ rows: Record<string, unknown>[]; columns: string[]; }> = ({ rows, columns }) => {
    const [filters, setFilters] = React.useState<Record<string, string>>({});
    const [sortCol, setSortCol] = React.useState<string | null>(null);
    const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

    // Reset filters/sort when columns change (new query result)
    React.useEffect(() => { setFilters({}); setSortCol(null); }, [columns.join("|")]);

    const filteredRows = React.useMemo(() => {
        const active = Object.entries(filters).filter(([, v]) => v && v.trim() !== "");
        let out = rows;
        if (active.length) {
            const lc = active.map(([k, v]) => [k, v.toLowerCase()] as const);
            out = rows.filter(r => lc.every(([k, v]) => formatCell(r[k]).toLowerCase().includes(v)));
        }
        if (sortCol) {
            const col = sortCol;
            const dir = sortDir === "asc" ? 1 : -1;
            out = [...out].sort((a, b) => {
                const av = a[col], bv = b[col];
                if (av == null && bv == null) return 0;
                if (av == null) return -1 * dir;
                if (bv == null) return 1 * dir;
                if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
                return formatCell(av).localeCompare(formatCell(bv)) * dir;
            });
        }
        return out;
    }, [rows, filters, sortCol, sortDir]);

    if (!rows.length) return React.createElement("div", { className: "kxp-empty" }, "No rows. Run a query to see results.");

    const onHeaderClick = (c: string) => {
        if (sortCol === c) setSortDir(d => d === "asc" ? "desc" : "asc");
        else { setSortCol(c); setSortDir("asc"); }
    };

    return React.createElement("div", { className: "kxp-grid-wrap" },
        React.createElement("div", { className: "kxp-grid-actions" },
            React.createElement("span", { className: "kxp-grid-count" },
                filteredRows.length === rows.length
                    ? `${rows.length} rows`
                    : `${filteredRows.length} of ${rows.length} rows`),
        ),
        React.createElement("table", { className: "kxp-table" },
        React.createElement("thead", null,
            React.createElement("tr", { className: "kxp-th-row" },
                ...columns.map(c => React.createElement("th", {
                    key: c,
                    className: "kxp-th-label" + (sortCol === c ? " sorted" : ""),
                    onClick: () => onHeaderClick(c),
                    title: "Click to sort",
                },
                    React.createElement("span", { className: "kxp-th-text" }, c),
                    sortCol === c ? React.createElement("span", { className: "kxp-th-sort" }, sortDir === "asc" ? " ▲" : " ▼") : null,
                ))
            ),
            React.createElement("tr", { className: "kxp-th-filter-row" },
                ...columns.map(c => React.createElement("th", { key: c, className: "kxp-th-filter" },
                    React.createElement("input", {
                        type: "text",
                        className: "kxp-col-filter",
                        placeholder: "filter...",
                        value: filters[c] ?? "",
                        onClick: (e: React.MouseEvent) => e.stopPropagation(),
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                            const v = e.target.value;
                            setFilters(f => ({ ...f, [c]: v }));
                        },
                    })
                ))
            ),
        ),
        React.createElement("tbody", null,
            ...filteredRows.slice(0, 5000).map((r, i) =>
                React.createElement("tr", { key: i },
                    ...columns.map(c => React.createElement("td", { key: c, title: formatCell(r[c]) }, formatCell(r[c])))))))
    );
};

function formatCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return typeof v === "string" ? v : JSON.stringify(v);
}
