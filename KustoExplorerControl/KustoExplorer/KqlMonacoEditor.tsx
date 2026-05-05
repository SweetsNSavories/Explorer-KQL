import * as React from "react";
import * as monaco from "monaco-editor-core";
import { SchemaTable } from "./CustomApiExecutor";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker: function () {
        const noop = () => undefined;
        return {
            postMessage: noop, terminate: noop, onmessage: null, onmessageerror: null,
            addEventListener: noop, removeEventListener: noop, dispatchEvent: () => false, onerror: null,
        } as unknown as Worker;
    },
};

const KQL_LANG_ID = "kusto";

const KQL_KEYWORDS = [
    "where", "project", "project-away", "project-rename", "project-reorder",
    "extend", "summarize", "distinct", "count", "take", "limit", "top", "top-nested",
    "sort", "order", "by", "asc", "desc", "nulls", "first", "last",
    "join", "kind", "inner", "innerunique", "leftouter", "rightouter", "fullouter",
    "leftsemi", "rightsemi", "leftanti", "rightanti",
    "union", "lookup", "evaluate", "render", "mv-expand", "mv-apply", "parse",
    "parse-where", "make-series", "facet", "sample", "sample-distinct",
    "serialize", "reduce", "invoke", "as", "let", "materialize", "toscalar",
    "on", "with", "step", "from", "to",
    "and", "or", "not", "in", "between", "true", "false", "null",
];

const KQL_FUNCTIONS = [
    "ago", "now", "datetime", "timespan", "bin", "bin_auto", "floor", "ceiling",
    "startofday", "startofmonth", "startofweek", "startofyear",
    "endofday", "endofmonth", "endofweek",
    "format_datetime", "format_timespan",
    "strcat", "strcat_array", "strlen", "substring", "split", "replace",
    "tolower", "toupper", "trim", "trim_start", "trim_end",
    "tostring", "toint", "tolong", "todouble", "toreal", "tobool",
    "isempty", "isnotempty", "isnull", "isnotnull", "iif", "case", "coalesce",
    "contains", "contains_cs", "has", "has_cs", "startswith", "endswith", "matches",
    "sum", "avg", "min", "max", "countif", "sumif", "dcount", "dcountif",
    "percentile", "percentiles",
    "make_list", "make_set", "make_bag", "any", "arg_max", "arg_min",
    "variance", "stdev",
    "parse_json", "parse_xml", "extract", "extract_all",
];

const KQL_RENDER_KINDS = [
    "table", "barchart", "columnchart", "linechart",
    "areachart", "stackedareachart", "scatterchart",
    "piechart", "timechart", "anomalychart", "ladderchart", "pivotchart",
];

let registered = false;

function ensureKqlRegistered(): void {
    if (registered) return;
    registered = true;

    monaco.languages.register({ id: KQL_LANG_ID });

    monaco.languages.setMonarchTokensProvider(KQL_LANG_ID, {
        defaultToken: "",
        ignoreCase: true,
        keywords: KQL_KEYWORDS,
        functions: KQL_FUNCTIONS,
        renderKinds: KQL_RENDER_KINDS,
        operators: ["==", "!=", "<>", ">=", "<=", "=", ">", "<", "+", "-", "*", "/", "%", "|"],
        symbols: /[=><!~?:&|+\-*/^%]+/,
        tokenizer: {
            root: [
                [/\/\/.*$/, "comment"],
                [/"([^"\\]|\\.)*"/, "string"],
                [/'([^'\\]|\\.)*'/, "string"],
                [/\b\d+(\.\d+)?\b/, "number"],
                [/@[a-zA-Z_]\w*/, "variable"],
                [/[a-zA-Z_][\w-]*/, {
                    cases: {
                        "@keywords": "keyword",
                        "@functions": "type.identifier",
                        "@renderKinds": "string.escape",
                        "@default": "identifier",
                    },
                }],
                [/[|()[\]{},;.]/, "delimiter"],
                [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
                [/[ \t\r\n]+/, "white"],
            ],
        },
    });

    monaco.languages.setLanguageConfiguration(KQL_LANG_ID, {
        comments: { lineComment: "//" },
        brackets: [["(", ")"], ["[", "]"], ["{", "}"]],
        autoClosingPairs: [
            { open: "(", close: ")" }, { open: "[", close: "]" }, { open: "{", close: "}" },
            { open: "\"", close: "\"" }, { open: "'", close: "'" },
        ],
    });
}

let schemaHolder: SchemaTable[] = [];
let providerRegistered = false;

function ensureCompletionProvider(): void {
    if (providerRegistered) return;
    providerRegistered = true;
    monaco.languages.registerCompletionItemProvider(KQL_LANG_ID, {
        triggerCharacters: [".", "|", " "],
        provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range: monaco.IRange = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
            };
            const suggestions: monaco.languages.CompletionItem[] = [];
            for (const k of KQL_KEYWORDS) {
                suggestions.push({ label: k, kind: monaco.languages.CompletionItemKind.Keyword, insertText: k, range });
            }
            for (const f of KQL_FUNCTIONS) {
                suggestions.push({ label: f, kind: monaco.languages.CompletionItemKind.Function, insertText: f + "()", range });
            }
            for (const r of KQL_RENDER_KINDS) {
                suggestions.push({ label: r, kind: monaco.languages.CompletionItemKind.EnumMember, insertText: r, range });
            }
            for (const t of schemaHolder) {
                suggestions.push({ label: t.name, kind: monaco.languages.CompletionItemKind.Class,
                    insertText: t.name, detail: `table (${t.columns.length} columns)`, range });
                for (const c of t.columns) {
                    suggestions.push({ label: c.name, kind: monaco.languages.CompletionItemKind.Field,
                        insertText: c.name, detail: `${t.name}.${c.name} : ${c.type}`, range });
                }
            }
            return { suggestions };
        },
    });
}

export interface KqlMonacoEditorProps {
    value: string;
    onChange: (v: string) => void;
    onRunRequest?: () => void;
    schema?: SchemaTable[];
}

export interface KqlMonacoEditorHandle {
    insertAtCursor: (text: string) => void;
    focus: () => void;
}

export const KqlMonacoEditor = React.forwardRef<KqlMonacoEditorHandle, KqlMonacoEditorProps>(({ value, onChange, onRunRequest, schema }, ref) => {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const editorRef = React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
    const onChangeRef = React.useRef(onChange);
    onChangeRef.current = onChange;
    const onRunRef = React.useRef(onRunRequest);
    onRunRef.current = onRunRequest;

    React.useEffect(() => {
        ensureKqlRegistered();
        ensureCompletionProvider();
        if (!hostRef.current) return;
        const editor = monaco.editor.create(hostRef.current, {
            value,
            language: KQL_LANG_ID,
            theme: "vs",
            automaticLayout: true,
            minimap: { enabled: false },
            fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
            fontSize: 13,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: "on",
            suggestOnTriggerCharacters: true,
            quickSuggestions: { other: true, comments: false, strings: false },
            renderLineHighlight: "none",
            lineNumbers: "on",
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
        });
        editorRef.current = editor;
        const sub = editor.onDidChangeModelContent(() => {
            onChangeRef.current(editor.getValue());
        });
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current?.());
        editor.addCommand(monaco.KeyMod.Shift     | monaco.KeyCode.Enter, () => onRunRef.current?.());
        return () => { sub.dispose(); editor.dispose(); editorRef.current = null; };
    }, []);

    React.useEffect(() => {
        const ed = editorRef.current; if (!ed) return;
        if (ed.getValue() !== value) ed.setValue(value);
    }, [value]);

    React.useEffect(() => { schemaHolder = schema ?? []; }, [schema]);

    React.useImperativeHandle(ref, () => ({
        insertAtCursor: (text: string) => {
            const ed = editorRef.current; if (!ed) return;
            const sel = ed.getSelection();
            if (!sel) return;
            ed.executeEdits("insert", [{ range: sel, text, forceMoveMarkers: true }]);
            ed.focus();
        },
        focus: () => editorRef.current?.focus(),
    }), []);

    return React.createElement("div", { ref: hostRef, className: "kxp-monaco" });
});
KqlMonacoEditor.displayName = "KqlMonacoEditor";
