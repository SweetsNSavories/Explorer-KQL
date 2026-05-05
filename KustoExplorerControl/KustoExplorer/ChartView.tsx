import * as React from "react";
import * as RechartsLib from "recharts";
import { RenderDirective, RenderKind } from "./KustoExplorer";

// Recharts 2.x has overly strict component typings (string vs literal-union
// defaultProps). Cast the surface to `any` so React.createElement accepts them.
// Runtime behaviour is unchanged.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
const Recharts: any = RechartsLib;
const ResponsiveContainer: any = Recharts.ResponsiveContainer;
const BarChart: any = Recharts.BarChart;
const Bar: any = Recharts.Bar;
const LineChart: any = Recharts.LineChart;
const Line: any = Recharts.Line;
const AreaChart: any = Recharts.AreaChart;
const Area: any = Recharts.Area;
const PieChart: any = Recharts.PieChart;
const Pie: any = Recharts.Pie;
const Cell: any = Recharts.Cell;
const ScatterChart: any = Recharts.ScatterChart;
const Scatter: any = Recharts.Scatter;
const XAxis: any = Recharts.XAxis;
const YAxis: any = Recharts.YAxis;
const CartesianGrid: any = Recharts.CartesianGrid;
const Tooltip: any = Recharts.Tooltip;
const Legend: any = Recharts.Legend;
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

const PALETTE = [
    "#0078d4", "#107c10", "#d83b01", "#5c2d91",
    "#008272", "#b4009e", "#ffb900", "#e3008c",
    "#00b294", "#bad80a", "#ff8c00", "#a80000",
];

interface ChartProps {
    rows: Record<string, unknown>[];
    columns: string[];
    render?: RenderDirective;
}

/* ------------------------------------------------------------------ */
/*  Column inference                                                   */
/* ------------------------------------------------------------------ */

interface ChartShape {
    /** X / category axis column. */
    x: string;
    /** Series columns to plot on Y. */
    series: string[];
    /** True if x values are dates. */
    timeAxis: boolean;
    /** Pivot column (3-column mode: x, series, value). */
    seriesCol?: string;
    /** Value column when in pivot mode. */
    valueCol?: string;
}

function isNumeric(v: unknown): boolean {
    // Strict: only true JSON numbers count as numeric for shape inference.
    // Strings like "200" (HTTP status code) are categorical.
    return typeof v === "number" && Number.isFinite(v);
}

function isDateLike(v: unknown): boolean {
    if (v instanceof Date) return true;
    if (typeof v === "string") {
        // Common Kusto datetime / ISO8601 patterns.
        return /^\d{4}-\d{2}-\d{2}[T ]/.test(v);
    }
    return false;
}

function inferShape(
    rows: Record<string, unknown>[],
    columns: string[],
    render: RenderDirective | undefined,
): ChartShape | undefined {
    if (!rows.length || !columns.length) return undefined;
    const sample = rows[0];

    // Honor `with (xcolumn=..., ycolumns=..., series=...)` from render.
    const xOverride = render?.properties.xcolumn;
    const yOverride = render?.properties.ycolumns;
    const sOverride = render?.properties.series;

    const numericCols = columns.filter(c => isNumeric(sample[c]));
    const nonNumericCols = columns.filter(c => !isNumeric(sample[c]));
    const timeCol = columns.find(c => isDateLike(sample[c]));

    const x =
        xOverride ??
        timeCol ??
        nonNumericCols[0] ??
        columns[0];

    const seriesCol = sOverride ?? (
        // 3-column convention: x, series-name, value.
        columns.length === 3 && numericCols.length === 1
            ? columns.find(c => c !== x && !isNumeric(sample[c]))
            : undefined
    );
    const valueCol = seriesCol
        ? numericCols.find(c => c !== x) ?? numericCols[0]
        : undefined;

    let series: string[];
    if (yOverride) {
        series = yOverride.split(/[,;\s]+/).filter(Boolean);
    } else if (seriesCol && valueCol) {
        series = []; // Determined dynamically when pivoting.
    } else {
        series = numericCols.filter(c => c !== x);
    }

    return {
        x,
        series,
        timeAxis: x === timeCol,
        seriesCol,
        valueCol,
    };
}

/* ------------------------------------------------------------------ */
/*  Data shaping                                                       */
/* ------------------------------------------------------------------ */

function pivotData(
    rows: Record<string, unknown>[],
    shape: ChartShape,
): { data: Record<string, unknown>[]; series: string[] } {
    if (!shape.seriesCol || !shape.valueCol) {
        // Already wide: coerce numerics.
        const data = rows.map(r => {
            const o: Record<string, unknown> = { [shape.x]: r[shape.x] };
            for (const s of shape.series) o[s] = toNumber(r[s]);
            return o;
        });
        return { data, series: shape.series };
    }
    const seriesSet = new Set<string>();
    const byX = new Map<string, Record<string, unknown>>();
    for (const r of rows) {
        const xv = stringify(r[shape.x]);
        const sv = stringify(r[shape.seriesCol]);
        const vv = toNumber(r[shape.valueCol]);
        seriesSet.add(sv);
        let bucket = byX.get(xv);
        if (!bucket) {
            bucket = { [shape.x]: r[shape.x] };
            byX.set(xv, bucket);
        }
        bucket[sv] = vv;
    }
    return { data: Array.from(byX.values()), series: Array.from(seriesSet) };
}

function toNumber(v: unknown): number | undefined {
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function stringify(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
}

function formatXTick(v: unknown): string {
    if (v == null) return "";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}[T ]/.test(v)) {
        return v.replace("T", " ").replace(/\..*$/, "");
    }
    return stringify(v);
}

/* ------------------------------------------------------------------ */
/*  Chart kind dispatch                                                */
/* ------------------------------------------------------------------ */

function effectiveKind(render: RenderDirective | undefined): RenderKind {
    if (!render) return "table";
    const k = render.properties.kind?.toLowerCase();
    if (k === "stacked" || k === "stackedarea" || k === "stacked100")
        return "stackedareachart";
    return render.kind;
}

export const ChartView: React.FC<ChartProps> = ({ rows, columns, render }) => {
    const shape = React.useMemo(
        () => inferShape(rows, columns, render),
        [rows, columns, render]);
    const pivoted = React.useMemo(
        () => shape ? pivotData(rows, shape) : { data: [], series: [] as string[] },
        [rows, shape]);
    // Legend-driven series visibility (click a legend entry to hide/show).
    const [hidden, setHidden] = React.useState<Record<string, boolean>>({});
    React.useEffect(() => { setHidden({}); }, [columns.join("|"), render?.kind]);
    const toggleSeries = (name: string) => setHidden(h => ({ ...h, [name]: !h[name] }));
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const legendProps: any = {
        onClick: (e: { value?: string; dataKey?: string }) => {
            const k = e && (e.value ?? e.dataKey);
            if (k) toggleSeries(k);
        },
        formatter: (value: string) => {
            const isHidden = !!hidden[value];
            return React.createElement("span", {
                onClick: (ev: React.MouseEvent) => { ev.stopPropagation(); toggleSeries(value); },
                style: {
                    color: isHidden ? "#999" : "inherit",
                    textDecoration: isHidden ? "line-through" : "none",
                    cursor: "pointer",
                    userSelect: "none",
                    padding: "0 4px",
                },
            }, value);
        },
        wrapperStyle: { cursor: "pointer" },
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    if (!rows.length || !shape) {
        return React.createElement(
            "div", { className: "kxp-empty" },
            "No data to chart. Run a query (optionally with `| render <kind>`).");
    }
    const { data, series } = pivoted;

    const stack = render?.properties.kind?.toLowerCase().startsWith("stacked");
    const kind = effectiveKind(render);

    // Pie chart: requires single category + single value.
    if (kind === "piechart") {
        const valueKey = series[0];
        if (!valueKey) {
            return React.createElement(
                "div", { className: "kxp-empty" },
                "Pie chart needs one category column and one numeric column.");
        }
        // Pie: legend toggles slices by category (the x value).
        const visibleData = data.filter(d => !hidden[stringify(d[shape.x])]);
        return React.createElement(
            ResponsiveContainer, { width: "100%", height: 360 },
            React.createElement(
                PieChart, null,
                React.createElement(Tooltip, null),
                React.createElement(Legend, legendProps),
                React.createElement(
                    Pie, {
                        data: visibleData, dataKey: valueKey, nameKey: shape.x,
                        cx: "50%", cy: "50%", outerRadius: 120, label: true,
                    },
                    ...visibleData.map((_, i) =>
                        React.createElement(Cell, {
                            key: i, fill: PALETTE[i % PALETTE.length],
                        })),
                ),
            ),
        );
    }

    // Scatter chart.
    if (kind === "scatterchart") {
        const yKey = series[0];
        if (!yKey) {
            return React.createElement(
                "div", { className: "kxp-empty" },
                "Scatter chart needs at least one numeric column for Y.");
        }
        return React.createElement(
            ResponsiveContainer, { width: "100%", height: 360 },
            React.createElement(
                ScatterChart, null,
                React.createElement(CartesianGrid, null),
                React.createElement(XAxis, {
                    dataKey: shape.x, tickFormatter: formatXTick, type: "category",
                }),
                React.createElement(YAxis, null),
                React.createElement(Tooltip, null),
                React.createElement(Legend, legendProps),
                React.createElement(Scatter, {
                    data, dataKey: yKey, fill: PALETTE[0], name: yKey,
                    hide: !!hidden[yKey],
                }),
            ),
        );
    }

    // Bar / column chart.
    if (kind === "barchart" || kind === "columnchart") {
        const layout = kind === "barchart" ? "vertical" : "horizontal";
        return React.createElement(
            ResponsiveContainer, { width: "100%", height: 360 },
            React.createElement(
                BarChart, { data, layout },
                React.createElement(CartesianGrid, { strokeDasharray: "3 3" }),
                layout === "horizontal"
                    ? React.createElement(XAxis, {
                        dataKey: shape.x, tickFormatter: formatXTick,
                    })
                    : React.createElement(XAxis, { type: "number" }),
                layout === "horizontal"
                    ? React.createElement(YAxis, null)
                    : React.createElement(YAxis, {
                        type: "category", dataKey: shape.x, tickFormatter: formatXTick,
                    }),
                React.createElement(Tooltip, null),
                React.createElement(Legend, legendProps),
                ...series.map((s, i) =>
                    React.createElement(Bar, {
                        key: s, dataKey: s, name: s,
                        fill: PALETTE[i % PALETTE.length],
                        stackId: stack ? "a" : undefined,
                        hide: !!hidden[s],
                    }))),
        );
    }

    // Area / stacked area chart.
    if (kind === "areachart" || kind === "stackedareachart") {
        const stacked = kind === "stackedareachart" || stack;
        return React.createElement(
            ResponsiveContainer, { width: "100%", height: 360 },
            React.createElement(
                AreaChart, { data },
                React.createElement(CartesianGrid, { strokeDasharray: "3 3" }),
                React.createElement(XAxis, {
                    dataKey: shape.x, tickFormatter: formatXTick,
                }),
                React.createElement(YAxis, null),
                React.createElement(Tooltip, null),
                React.createElement(Legend, legendProps),
                ...series.map((s, i) =>
                    React.createElement(Area, {
                        key: s, dataKey: s, name: s, type: "monotone",
                        stroke: PALETTE[i % PALETTE.length],
                        fill: PALETTE[i % PALETTE.length],
                        fillOpacity: 0.35,
                        stackId: stacked ? "a" : undefined,
                        hide: !!hidden[s],
                    }))),
        );
    }

    // Default: line / time chart / anomaly chart fall back to LineChart.
    return React.createElement(
        ResponsiveContainer, { width: "100%", height: 360 },
        React.createElement(
            LineChart, { data },
            React.createElement(CartesianGrid, { strokeDasharray: "3 3" }),
            React.createElement(XAxis, {
                dataKey: shape.x, tickFormatter: formatXTick,
            }),
            React.createElement(YAxis, null),
            React.createElement(Tooltip, null),
            React.createElement(Legend, legendProps),
            ...series.map((s, i) =>
                React.createElement(Line, {
                    key: s, dataKey: s, name: s, type: "monotone",
                    stroke: PALETTE[i % PALETTE.length],
                    dot: false, isAnimationActive: false,
                    hide: !!hidden[s],
                }))),
    );
};
