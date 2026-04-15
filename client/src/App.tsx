import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Plus, Trash2, AlertCircle, CheckCircle2, Tag, Save, History as HistoryIcon, Play, Eraser, CheckCircle, Download, Upload, Code } from 'lucide-react';
import Editor from 'react-simple-code-editor';
// @ts-ignore
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/themes/prism.css';
import './App.css';

// Ensure we get the actual component if it's wrapped in a default object (common in some build environments)
const CodeEditor = (Editor as any).default || Editor;

// Datadog-native matchers (used in the MATCHER position of %{MATCHER:capture:filter})
const DD_MATCHERS = new Set([
  'date', 'regex', 'notSpace', 'boolean', 'numberStr', 'number', 'numberExtStr',
  'numberExt', 'integerStr', 'integer', 'integerExtStr', 'integerExt', 'word',
  'doubleQuotedString', 'singleQuotedString', 'quotedString', 'uuid', 'mac',
  'ipv4', 'ipv6', 'ip', 'hostname', 'ipOrHost', 'port', 'data',
]);

// Datadog-native filters (used in the FILTER position of %{matcher:capture:FILTER})
const DD_FILTERS = new Set([
  'number', 'integer', 'boolean', 'nullIf', 'json', 'rubyhash', 'useragent',
  'querystring', 'decodeuricomponent', 'lowercase', 'uppercase', 'keyvalue',
  'xml', 'csv', 'scale', 'array', 'url',
]);

// Define a simple Grok language for Prism
const grokLanguage = {
  'comment': /#.*/,
  'grok-rule-name': {
    pattern: /^[a-zA-Z0-9._-]+(?=\s)/m,
    alias: 'function'
  },
  'grok-pattern-block': {
    pattern: /%\{[^\}]+\}/,
    inside: {
      'grok-braces': /%\{|\}/,
      'grok-content': {
        pattern: /.+/,
        inside: {
          'grok-pattern': {
            // Pattern name, optionally followed by arguments in parentheses.
            // We post-process with a hook to distinguish DD matchers from custom ones.
            pattern: /^(?:[a-zA-Z0-9._-]+(?:\("[^"]*"\))?)/,
            alias: 'keyword'
          },
          'grok-capture': {
            pattern: /:[a-zA-Z0-9._-]+/,
            alias: 'variable'
          },
          'grok-filter': {
            pattern: /:[^:]+$/,
            alias: 'important'
          }
        }
      }
    }
  }
};

// Prism hook: after tokenising, walk the token stream and tag any
// grok-pattern / grok-filter token whose base name is a Datadog built-in
// with an extra "dd-builtin" class so we can colour it distinctly.
if (typeof window !== 'undefined') {
  // @ts-ignore
  const Prism = window.Prism ?? (await import('prismjs'));

  // We attach the hook directly on the prismjs singleton that highlight() uses.
  // Using 'after-tokenize' lets us inspect the final flat token array.
  // @ts-ignore
  (highlight as any).__ddHookInstalled ||
    (() => {
      // noop — hook is registered globally below via the imported `highlight` module's Prism reference.
    })();
}

// Colour DD built-ins by post-processing highlighted HTML.
// Simpler than Prism hooks: wrap the highlighter to swap classes after the fact.
const highlightGrok = (code: string): string => {
  // Run standard Prism highlight.
  // @ts-ignore
  let html: string = highlight(code, grokLanguage, 'grok');

  // Replace grok-pattern tokens that are Datadog built-ins.
  // The rendered span looks like: <span class="token grok-pattern">NAME</span>
  // or with args:                 <span class="token grok-pattern">NAME("...")</span>
  html = html.replace(
    /<span class="token grok-pattern keyword">([^<(]+)(<[^>]*>.*?<\/[^>]+>|[^<]*)<\/span>/g,
    (match, baseName, rest) => {
      const name = baseName.trim();
      if (DD_MATCHERS.has(name)) {
        return `<span class="token grok-pattern dd-builtin">${baseName}${rest}</span>`;
      }
      return match;
    }
  );

  // Replace grok-filter tokens that are Datadog built-ins.
  // Rendered as: <span class="token grok-filter">:FILTERNAME</span>
  // or with args: <span class="token grok-filter">:FILTERNAME(...)</span>
  html = html.replace(
    /<span class="token grok-filter">:([a-zA-Z0-9_]+)(.*?)<\/span>/g,
    (match, filterName, rest) => {
      if (DD_FILTERS.has(filterName)) {
        return `<span class="token grok-filter dd-builtin">:${filterName}${rest}</span>`;
      }
      return match;
    }
  );

  return html;
};

interface Sample {
  id: string;
  text: string;
}

interface ParseResult {
  parsed?: any;
  matched_rule?: string;
  error?: string;
  isLoading: boolean;
}

interface HistoryItem {
  id: string;
  name?: string;
  timestamp: number;
  matchRules: string;
  supportRules: string;
  samples: Sample[];
}

interface DDImportCandidate {
  // Stable key used for checkbox tracking — derived from pipeline name + processor
  // index so it doesn't depend on generateId() and stays consistent across re-renders
  // of the same dialog session.
  key: string;
  name: string;
  matchRules: string;
  supportRules: string;
  samples: Sample[];
}

// ---------------------------------------------------------------------------
// ImportDialog — shown after parsing a Datadog integrations JSON file.
// Lets the user search and cherry-pick which grok processors to import.
// ---------------------------------------------------------------------------
interface ImportDialogProps {
  candidates: DDImportCandidate[];
  onConfirm: (selected: DDImportCandidate[]) => void;
  onCancel: () => void;
}

const ImportDialog = ({ candidates, onConfirm, onCancel }: ImportDialogProps) => {
  const [query, setQuery] = useState('');
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(
    () => new Set(candidates.map(c => c.key))
  );
  const searchRef = useRef<HTMLInputElement>(null);

  // Focus the search field as soon as the dialog mounts.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = query.trim()
    ? candidates.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.matchRules.toLowerCase().includes(query.toLowerCase())
      )
    : candidates;

  const allFilteredChecked = filtered.length > 0 && filtered.every(c => checkedKeys.has(c.key));

  const toggleOne = (key: string) => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAllFiltered = () => {
    setCheckedKeys(prev => {
      const next = new Set(prev);
      if (allFilteredChecked) {
        filtered.forEach(c => next.delete(c.key));
      } else {
        filtered.forEach(c => next.add(c.key));
      }
      return next;
    });
  };

  const handleConfirm = () => {
    onConfirm(candidates.filter(c => checkedKeys.has(c.key)));
  };

  const checkedCount = candidates.filter(c => checkedKeys.has(c.key)).length;

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <span className="dialog-title">Import Datadog integrations</span>
          <span className="dialog-subtitle">{candidates.length} grok processors found</span>
        </div>

        <div className="dialog-search">
          <input
            ref={searchRef}
            type="text"
            placeholder="Search by name or rule pattern…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="dialog-list-header">
          <label className="dialog-check-row dialog-check-all">
            <input
              type="checkbox"
              checked={allFilteredChecked}
              onChange={toggleAllFiltered}
            />
            <span>{allFilteredChecked ? 'Deselect all' : 'Select all'}{query ? ' matching' : ''}</span>
            <span className="dialog-count">{filtered.length} shown</span>
          </label>
        </div>

        <div className="dialog-list">
          {filtered.length === 0 ? (
            <div className="dialog-empty">No processors match "{query}"</div>
          ) : (
            filtered.map(c => (
              <label key={c.key} className="dialog-check-row">
                <input
                  type="checkbox"
                  checked={checkedKeys.has(c.key)}
                  onChange={() => toggleOne(c.key)}
                />
                <span className="dialog-item-name">{c.name || <em>Unnamed</em>}</span>
                <span className="dialog-item-meta">
                  {c.matchRules.split('\n').filter(Boolean).length} rule(s)
                  {c.samples.length > 0 && ` · ${c.samples.length} sample(s)`}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-outline" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={checkedCount === 0}
          >
            Import {checkedCount > 0 ? checkedCount : ''} session{checkedCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
};

// Discriminated union describing which destructive action is awaiting confirmation.
// Keeping it typed (rather than a bare string) means the compiler catches any
// site that forgets to handle a variant.
type PendingConfirm =
  | { type: 'clear-session' }
  | { type: 'clear-history' }
  | { type: 'delete-item'; id: string };

const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Splits a single rule line of the form "NAME PATTERN" into its constituent
 * parts. Returns `{ name, pattern }`. If the line has no whitespace (i.e. it
 * is a bare pattern with no name prefix) `name` falls back to `"rule"` and
 * the entire line is used as the pattern — matching the behaviour that was
 * previously inlined in `exportAsTerraform`.
 */
const parseRuleLine = (line: string): { name: string; pattern: string } => {
  const firstSpaceIdx = line.search(/\s/);
  if (firstSpaceIdx === -1) {
    return { name: 'rule', pattern: line };
  }
  return {
    name: line.substring(0, firstSpaceIdx),
    pattern: line.substring(firstSpaceIdx).trim(),
  };
};

const JsonFormatter = ({ data }: { data: any }) => {
  if (typeof data === 'number' && data > 1000000000000 && data < 2000000000000) {
    // Likely a timestamp in ms (between 2001 and 2033)
    const iso = new Date(data).toISOString();
    return <span className="timestamp-val" data-iso={iso}>{data}</span>;
  }

  if (data === null) return <span style={{ color: '#94a3b8' }}>null</span>;
  if (typeof data === 'string') return <span style={{ color: '#4ade80' }}>"{data}"</span>;
  if (typeof data === 'boolean') return <span style={{ color: '#fb923c' }}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={{ color: '#fb923c' }}>{data}</span>;

  if (Array.isArray(data)) {
    return (
      <span>
        [
        <div style={{ paddingLeft: '1.5rem' }}>
          {data.map((item, i) => (
            <div key={i}>
              <JsonFormatter data={item} />
              {i < data.length - 1 ? ',' : ''}
            </div>
          ))}
        </div>
        ]
      </span>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    return (
      <span>
        {'{'}
        <div style={{ paddingLeft: '1.5rem' }}>
          {keys.map((key, i) => (
            <div key={key}>
              <span style={{ color: '#818cf8' }}>"{key}"</span>: <JsonFormatter data={data[key]} />
              {i < keys.length - 1 ? ',' : ''}
            </div>
          ))}
        </div>
        {'}'}
      </span>
    );
  }

  return <span>{String(data)}</span>;
};

// ---------------------------------------------------------------------------
// Autocomplete data
// Each entry: label (inserted text), kind ('matcher' | 'filter'), optional
// suffix appended after the label (e.g. the opening paren for date/regex).
// ---------------------------------------------------------------------------
interface AcItem {
  label: string;
  kind: 'matcher' | 'filter';
  /** Text inserted after the label, e.g. '("' for date */
  suffix?: string;
  /** Short description shown in the dropdown */
  desc: string;
}

const AC_MATCHERS: AcItem[] = [
  { label: 'date',               kind: 'matcher', suffix: '("',  desc: 'Parse date → Unix timestamp' },
  { label: 'regex',              kind: 'matcher', suffix: '("',  desc: 'Match a custom regex' },
  { label: 'notSpace',           kind: 'matcher',                 desc: 'Any string up to next space' },
  { label: 'boolean',            kind: 'matcher',                 desc: 'true / false (case-insensitive)' },
  { label: 'numberStr',          kind: 'matcher',                 desc: 'Float → string' },
  { label: 'number',             kind: 'matcher',                 desc: 'Float → double' },
  { label: 'numberExtStr',       kind: 'matcher',                 desc: 'Float w/ sci-notation → string' },
  { label: 'numberExt',          kind: 'matcher',                 desc: 'Float w/ sci-notation → double' },
  { label: 'integerStr',         kind: 'matcher',                 desc: 'Integer → string' },
  { label: 'integer',            kind: 'matcher',                 desc: 'Integer → integer' },
  { label: 'integerExtStr',      kind: 'matcher',                 desc: 'Integer w/ sci-notation → string' },
  { label: 'integerExt',         kind: 'matcher',                 desc: 'Integer w/ sci-notation → integer' },
  { label: 'word',               kind: 'matcher',                 desc: 'Word boundary token (\\b\\w+\\b)' },
  { label: 'doubleQuotedString', kind: 'matcher',                 desc: 'Double-quoted string' },
  { label: 'singleQuotedString', kind: 'matcher',                 desc: 'Single-quoted string' },
  { label: 'quotedString',       kind: 'matcher',                 desc: 'Single- or double-quoted string' },
  { label: 'uuid',               kind: 'matcher',                 desc: 'UUID' },
  { label: 'mac',                kind: 'matcher',                 desc: 'MAC address' },
  { label: 'ipv4',               kind: 'matcher',                 desc: 'IPv4 address' },
  { label: 'ipv6',               kind: 'matcher',                 desc: 'IPv6 address' },
  { label: 'ip',                 kind: 'matcher',                 desc: 'IPv4 or IPv6 address' },
  { label: 'hostname',           kind: 'matcher',                 desc: 'Hostname' },
  { label: 'ipOrHost',           kind: 'matcher',                 desc: 'Hostname or IP' },
  { label: 'port',               kind: 'matcher',                 desc: 'Port number' },
  { label: 'data',               kind: 'matcher',                 desc: 'Any string incl. spaces (.*)' },
];

const AC_FILTERS: AcItem[] = [
  { label: 'number',             kind: 'filter',                  desc: 'Parse as double' },
  { label: 'integer',            kind: 'filter',                  desc: 'Parse as integer' },
  { label: 'boolean',            kind: 'filter',                  desc: 'Parse true/false string' },
  { label: 'nullIf',             kind: 'filter',  suffix: '("',   desc: 'Null if equals value' },
  { label: 'json',               kind: 'filter',                  desc: 'Parse JSON' },
  { label: 'rubyhash',           kind: 'filter',                  desc: 'Parse Ruby hash' },
  { label: 'useragent',          kind: 'filter',                  desc: 'Parse user-agent string' },
  { label: 'querystring',        kind: 'filter',                  desc: 'Parse URL query string' },
  { label: 'decodeuricomponent', kind: 'filter',                  desc: 'Decode URI component' },
  { label: 'lowercase',          kind: 'filter',                  desc: 'Lowercase string' },
  { label: 'uppercase',          kind: 'filter',                  desc: 'Uppercase string' },
  { label: 'keyvalue',           kind: 'filter',  suffix: '(',    desc: 'Parse key=value pairs' },
  { label: 'xml',                kind: 'filter',                  desc: 'Parse XML' },
  { label: 'csv',                kind: 'filter',  suffix: '(',    desc: 'Parse CSV / TSV' },
  { label: 'scale',              kind: 'filter',  suffix: '(',    desc: 'Multiply by factor' },
  { label: 'array',              kind: 'filter',  suffix: '(',    desc: 'Parse list into array' },
  { label: 'url',                kind: 'filter',                  desc: 'Parse URL into components' },
];

// ---------------------------------------------------------------------------
// Context analyser: given the full text and cursor offset, decides whether
// the cursor is inside a %{…} block at the matcher or filter position.
// Returns null when autocomplete should not show.
// ---------------------------------------------------------------------------
type AcContext =
  | { kind: 'matcher'; partial: string; tokenStart: number }
  | { kind: 'filter';  partial: string; tokenStart: number };

function getAcContext(text: string, cursor: number): AcContext | null {
  // Walk backwards to find the nearest opening %{
  let i = cursor - 1;
  while (i >= 0 && text[i] !== '{' && text[i] !== '}' && text[i] !== '\n') i--;
  if (i < 1 || text[i] !== '{' || text[i - 1] !== '%') return null;

  // inner = everything from after '{' up to the cursor
  const inner = text.slice(i + 1, cursor);

  // Count colons to determine position (matcher | capture | filter)
  const colons = (inner.match(/:/g) || []).length;

  if (colons === 0) {
    // Matcher position
    if (inner.includes('(')) return null; // typing args
    return { kind: 'matcher', partial: inner, tokenStart: i + 1 };
  }

  if (colons >= 2) {
    // Filter position — everything after the 2nd colon
    let count = 0, secondColon = -1;
    for (let j = 0; j < inner.length; j++) {
      if (inner[j] === ':') { count++; if (count === 2) { secondColon = j; break; } }
    }
    if (secondColon === -1) return null;
    const partial = inner.slice(secondColon + 1);
    if (partial.includes('(')) return null; // already in args
    return { kind: 'filter', partial, tokenStart: i + 1 + secondColon + 1 };
  }

  return null; // capture position — no autocomplete
}

// ---------------------------------------------------------------------------
// GrokEditor with autocomplete
// ---------------------------------------------------------------------------
const GrokEditor = ({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder?: string }) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const [acItems, setAcItems]       = useState<AcItem[]>([]);
  const [acIndex, setAcIndex]       = useState(0);
  const [acContext, setAcContext]   = useState<AcContext | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Stable refs so keyboard handlers always see latest values
  const acIndexRef   = useRef(0);
  const acItemsRef   = useRef<AcItem[]>([]);
  const acContextRef = useRef<AcContext | null>(null);
  useEffect(() => { acIndexRef.current   = acIndex; },   [acIndex]);
  useEffect(() => { acItemsRef.current   = acItems; },   [acItems]);
  useEffect(() => { acContextRef.current = acContext; }, [acContext]);

  const closeDropdown = useCallback(() => {
    setAcItems([]); setAcContext(null); setDropdownPos(null);
  }, []);

  // Compute caret pixel coords relative to the container using a mirror div.
  const getCaretCoords = useCallback((textarea: HTMLTextAreaElement) => {
    const mirror = document.createElement('div');
    const cs = window.getComputedStyle(textarea);
    ['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingRight',
     'paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth',
     'borderLeftWidth','boxSizing','whiteSpace','wordWrap','overflowWrap','width']
      .forEach(p => { (mirror.style as any)[p] = (cs as any)[p]; });
    mirror.style.position   = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top        = '-9999px';
    mirror.style.left       = '-9999px';
    mirror.style.height     = 'auto';
    mirror.style.overflow   = 'hidden';
    document.body.appendChild(mirror);

    const before = textarea.value.slice(0, textarea.selectionStart ?? 0);
    mirror.textContent = before;
    const span = document.createElement('span');
    span.textContent = '\u200b';
    mirror.appendChild(span);

    const containerRect = containerRef.current!.getBoundingClientRect();
    const mirrorRect    = mirror.getBoundingClientRect(); // Get mirror's coordinates
    const spanRect      = span.getBoundingClientRect();
    const lineH         = parseFloat(cs.lineHeight) || 18;
    document.body.removeChild(mirror);

    return {
      // Calculate position inside the mirror, which accurately reflects the textarea
      top:  (spanRect.top - mirrorRect.top) + lineH + 2,
      left: Math.min(spanRect.left - mirrorRect.left, containerRect.width - 280),
    };
  }, []);

  const recompute = useCallback((text: string, cursorPos: number) => {
    const ctx = getAcContext(text, cursorPos);
    if (!ctx) { closeDropdown(); return; }

    const pool    = ctx.kind === 'matcher' ? AC_MATCHERS : AC_FILTERS;
    const partial = ctx.partial.toLowerCase();
    const matches = partial.length === 0
      ? pool
      : pool.filter(item => item.label.toLowerCase().startsWith(partial));

    if (matches.length === 0) { closeDropdown(); return; }

    setAcItems(matches);
    setAcContext(ctx);
    setAcIndex(0);

    const textarea = containerRef.current?.querySelector('textarea');
    if (textarea) setDropdownPos(getCaretCoords(textarea));
  }, [closeDropdown, getCaretCoords]);

  const applyItem = useCallback((item: AcItem, ctx: AcContext) => {
    const insert  = item.label + (item.suffix ?? '');
    const before  = value.slice(0, ctx.tokenStart);
    const after   = value.slice(ctx.tokenStart + ctx.partial.length);
    const newVal  = before + insert + after;
    onChange(newVal);
    closeDropdown();

    requestAnimationFrame(() => {
      const textarea = containerRef.current?.querySelector('textarea');
      if (textarea) {
        const pos = ctx.tokenStart + insert.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      }
    });
  }, [value, onChange, closeDropdown]);

  const handleChange = useCallback((newVal: string) => {
    onChange(newVal);
    requestAnimationFrame(() => {
      const textarea = containerRef.current?.querySelector('textarea');
      if (textarea) recompute(newVal, textarea.selectionStart ?? 0);
    });
  }, [onChange, recompute]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = acItemsRef.current;
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setAcIndex(i => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setAcIndex(i => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      const ctx = acContextRef.current;
      if (ctx) { e.preventDefault(); applyItem(items[acIndexRef.current], ctx); }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }, [applyItem, closeDropdown]);

  return (
    <div
      ref={containerRef}
      className="editor-container"
      style={{ position: 'relative' }}
      onKeyDown={handleKeyDown}
    >
      <CodeEditor
        value={value}
        onValueChange={handleChange}
        highlight={(code: string) => highlightGrok(code)}
        padding={12}
        className="grok-editor"
        style={{
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 14,
        }}
        placeholder={placeholder}
        onFocus={() => {
          const textarea = containerRef.current?.querySelector('textarea');
          if (textarea) recompute(value, textarea.selectionStart ?? 0);
        }}
        onBlur={() => {
          // Small delay so mousedown on a dropdown item fires first
          setTimeout(closeDropdown, 160);
        }}
      />
      {acItems.length > 0 && dropdownPos && (
        <ul className="ac-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
          {acItems.map((item, idx) => (
            <li
              key={item.label}
              className={`ac-item${idx === acIndex ? ' ac-item-active' : ''}`}
              onMouseDown={e => { e.preventDefault(); applyItem(item, acContext!); }}
              onMouseEnter={() => setAcIndex(idx)}
            >
              <span className={`ac-kind ac-kind-${item.kind}`}>
                {item.kind === 'matcher' ? 'M' : 'F'}
              </span>
              <span className="ac-label">{item.label}</span>
              <span className="ac-desc">{item.desc}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};


function App() {
  const [currentTab, setCurrentTab] = useState<'test' | 'history'>('test');
  const [toast, setToast] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ddIntegrationInputRef = useRef<HTMLInputElement>(null);

  // Tracks which destructive action (if any) is waiting for a second click to confirm.
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  // Ref so the auto-cancel timeout can be cleared when a new action is initiated
  // or when the component unmounts, without the timeout itself being a dependency
  // of any effect.
  const confirmTimeoutRef = useRef<number | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-id') || generateId();
  });

  const [sessionName, setSessionName] = useState<string>(() => {
    return localStorage.getItem('dd-grok-session-name') || '';
  });

  const [samples, setSamples] = useState<Sample[]>(() => {
    const saved = localStorage.getItem('dd-grok-samples-v2');
    if (saved) return JSON.parse(saved);
    return [{ id: generateId(), text: '' }];
  });
  
  const [matchRules, setMatchRules] = useState(() => {
    return localStorage.getItem('dd-grok-match-rules') || '';
  });
  
  const [supportRules, setSupportRules] = useState(() => {
    return localStorage.getItem('dd-grok-support-rules') || '';
  });

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('dd-grok-history');
    return saved ? JSON.parse(saved) : [];
  });

  const [results, setResults] = useState<Record<string, ParseResult>>({});
  const lastRequestTimer = useRef<number | null>(null);

  // Populated when a Datadog integrations file is parsed; cleared after the
  // user confirms or cancels the import dialog.
  const [ddImportCandidates, setDdImportCandidates] = useState<DDImportCandidate[] | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  // Persist current session state
const persistTimeoutRef = useRef<number | null>(null);

useEffect(() => {
  if (persistTimeoutRef.current) {
    clearTimeout(persistTimeoutRef.current);
  }

  persistTimeoutRef.current = window.setTimeout(() => {
    localStorage.setItem('dd-grok-session-id', currentSessionId);
    localStorage.setItem('dd-grok-session-name', sessionName);
    localStorage.setItem('dd-grok-samples-v2', JSON.stringify(samples));
    localStorage.setItem('dd-grok-match-rules', matchRules);
    localStorage.setItem('dd-grok-support-rules', supportRules);
  }, 300); // tweak delay if needed

  return () => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
  };
}, [currentSessionId, sessionName, samples, matchRules, supportRules]);

  // Persist history
  useEffect(() => {
    localStorage.setItem('dd-grok-history', JSON.stringify(history));
  }, [history]);

  // Cancel the pending confirmation timeout on unmount to avoid state updates
  // on an unmounted component.
  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current !== null) {
        clearTimeout(confirmTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Requests confirmation for a destructive action. On the first call the
   * action is stored as pending and a 3-second auto-cancel timer is started.
   * On the second call (while the same action is still pending) the action is
   * executed immediately. Returns true if the action was executed, false if
   * this was only the first click (i.e. the caller should not proceed yet).
   */
  const requestConfirm = useCallback(
    (action: PendingConfirm, onConfirmed: () => void): void => {
      const isSamePending =
        pendingConfirm !== null &&
        pendingConfirm.type === action.type &&
        (action.type !== 'delete-item' ||
          (pendingConfirm.type === 'delete-item' && pendingConfirm.id === action.id));

      if (isSamePending) {
        // Second click — execute and reset.
        if (confirmTimeoutRef.current !== null) {
          clearTimeout(confirmTimeoutRef.current);
          confirmTimeoutRef.current = null;
        }
        setPendingConfirm(null);
        onConfirmed();
      } else {
        // First click — arm the confirmation and auto-cancel after 3 s.
        if (confirmTimeoutRef.current !== null) {
          clearTimeout(confirmTimeoutRef.current);
        }
        setPendingConfirm(action);
        confirmTimeoutRef.current = window.setTimeout(() => {
          setPendingConfirm(null);
          confirmTimeoutRef.current = null;
        }, 3000);
      }
    },
    [pendingConfirm]
  );

  const parseAllSamples = useCallback(async () => {
    const validSamples = samples.filter(s => s.text.trim());
    if (validSamples.length === 0 || !matchRules.trim()) {
      return;
    }

    setResults(prev => {
      const next = { ...prev };
      samples.forEach(s => {
        if (s.text.trim()) {
          next[s.id] = { ...next[s.id], isLoading: true };
        }
      });
      return next;
    });

    const promises = samples.map(async (sample) => {
      if (!sample.text.trim()) return;
      
      try {
        const response = await axios.post('/api/parse', {
          sample: sample.text,
          match_rules: matchRules,
          support_rules: supportRules || null
        });
        
        setResults(prev => ({
          ...prev,
          [sample.id]: {
            isLoading: false,
            parsed: response.data.parsed,
            matched_rule: response.data.matched_rule,
            error: response.data.error
          }
        }));
      } catch (err: any) {
        setResults(prev => ({
          ...prev,
          [sample.id]: {
            isLoading: false,
            error: err.response?.data?.error || err.message
          }
        }));
      }
    });

    await Promise.all(promises);
  }, [samples, matchRules, supportRules]);

  useEffect(() => {
    if (currentTab !== 'test') return;
    
    if (lastRequestTimer.current) {
      clearTimeout(lastRequestTimer.current);
    }

    lastRequestTimer.current = window.setTimeout(() => {
      parseAllSamples();
    }, 600);

    return () => {
      if (lastRequestTimer.current) clearTimeout(lastRequestTimer.current);
    };
  }, [samples, matchRules, supportRules, parseAllSamples, currentTab]);

  const addSample = () => {
    setSamples([...samples, { id: generateId(), text: '' }]);
  };

  const updateSample = (id: string, value: string) => {
    setSamples(samples.map(s => s.id === id ? { ...s, text: value } : s));
  };

  const removeSample = (id: string) => {
    const next = samples.filter(s => s.id !== id);
    setSamples(next);
    setResults(prev => {
      const nextRes = { ...prev };
      delete nextRes[id];
      return nextRes;
    });
  };

  const clearSession = () => {
    requestConfirm({ type: 'clear-session' }, () => {
      setSessionName('');
      setMatchRules('');
      setSupportRules('');
      setSamples([{ id: generateId(), text: '' }]);
      setResults({});
      setCurrentSessionId(generateId());
      showToast('Session cleared');
    });
  };

  const saveToHistory = () => {
    const existingIndex = history.findIndex(item => item.id === currentSessionId);
    
    const sessionData: HistoryItem = {
      id: currentSessionId,
      name: sessionName || undefined,
      timestamp: Date.now(),
      matchRules,
      supportRules,
      samples: [...samples]
    };

    if (existingIndex >= 0) {
      const newHistory = [...history];
      newHistory[existingIndex] = sessionData;
      setHistory(newHistory);
      showToast('Session updated in history');
    } else {
      setHistory([sessionData, ...history]);
      showToast('Session saved to history');
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setCurrentSessionId(item.id);
    setSessionName(item.name || '');
    setMatchRules(item.matchRules);
    setSupportRules(item.supportRules);
    setSamples(item.samples);
    setResults({});
    setCurrentTab('test');
    showToast('Session loaded');
  };

  const deleteFromHistory = (id: string) => {
    requestConfirm({ type: 'delete-item', id }, () => {
      setHistory(history.filter(item => item.id !== id));
      showToast('Session deleted from history');
    });
  };

  const clearHistory = () => {
    requestConfirm({ type: 'clear-history' }, () => {
      setHistory([]);
      showToast('History cleared');
    });
  };

  const exportHistory = () => {
    const dataStr = JSON.stringify(history, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'datadog-grok-history.json');
    linkElement.click();
    showToast('History exported');
  };

  const importHistory = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        if (Array.isArray(imported)) {
          const isValid = imported.every(item => item.id && item.matchRules && item.samples);
          if (isValid) {
            setHistory([...imported, ...history]);
            showToast(`Imported ${imported.length} sessions`);
          } else {
            showToast('Invalid history file format');
          }
        }
      } catch (err) {
        showToast('Error parsing history file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const importDatadogIntegrations = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const integrations = JSON.parse(e.target?.result as string);
        const candidates: DDImportCandidate[] = [];

        if (Array.isArray(integrations)) {
          integrations.forEach((integration: any) => {
            const pipeline = integration.pipeline;
            if (pipeline && Array.isArray(pipeline.processors)) {
              pipeline.processors.forEach((processor: any, processorIdx: number) => {
                if (processor.type === 'grok-parser' && processor.grok) {
                  candidates.push({
                    key: `${pipeline.name ?? 'unnamed'}-${processorIdx}`,
                    name: pipeline.name || '',
                    matchRules: processor.grok.matchRules || '',
                    supportRules: processor.grok.supportRules || '',
                    samples: (processor.samples || []).map((s: string) => ({
                      id: generateId(),
                      text: s,
                    })),
                  });
                }
              });
            }
          });

          if (candidates.length > 0) {
            setDdImportCandidates(candidates);
          } else {
            showToast('No grok processors found in file');
          }
        }
      } catch (err) {
        showToast('Error parsing integrations file');
      }
    };
    reader.readAsText(file);
    if (event.target) event.target.value = '';
  };

  const confirmDdImport = (selected: DDImportCandidate[]) => {
    const newSessions: HistoryItem[] = selected.map(c => ({
      id: generateId(),
      name: c.name || undefined,
      timestamp: Date.now(),
      matchRules: c.matchRules,
      supportRules: c.supportRules,
      samples: c.samples,
    }));
    setHistory(prev => [...newSessions, ...prev]);
    setDdImportCandidates(null);
    showToast(`Imported ${newSessions.length} session${newSessions.length !== 1 ? 's' : ''}`);
  };

  const escapeHCLString = (str: string) => {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  };

  const exportAsTerraform = () => {
    const toHCLBlock = (line: string) => {
      const { name, pattern } = parseRuleLine(line);
      return `    {
      name    = "${escapeHCLString(name)}"
      pattern = "${escapeHCLString(pattern)}"
    }`;
    };

    const rulesList = matchRules
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(toHCLBlock)
      .join(',\n');

    const supportRulesList = supportRules
      .split('\n')
      .map((l: string) => l.trim())
      .filter((l: string) => l.length > 0)
      .map(toHCLBlock)
      .join(',\n');

    const hcl = `{
  id_prefix   = ""
  log_sources = []
  rules = [
${rulesList}
  ]
  support_rules = [
${supportRulesList}
  ]
}`;

    navigator.clipboard.writeText(hcl).then(() => {
      showToast('Terraform configuration copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy: ', err);
      showToast('Failed to copy to clipboard');
    });
  };

  // Helpers to check pending state at specific render sites, keeping JSX readable.
  const isClearSessionPending = pendingConfirm?.type === 'clear-session';
  const isClearHistoryPending = pendingConfirm?.type === 'clear-history';
  const pendingDeleteId = pendingConfirm?.type === 'delete-item' ? pendingConfirm.id : null;

  return (
    <div className="container">
      <h1>Datadog Grok Tester</h1>

      {toast && (
        <div className="toast">
          <CheckCircle size={16} color="#4ade80" />
          {toast}
        </div>
      )}

      <div className="tabs">
        <div 
          className={`tab ${currentTab === 'test' ? 'active' : ''}`}
          onClick={() => setCurrentTab('test')}
        >
          <Play size={16} style={{ marginBottom: '-3px', marginRight: '4px' }} /> Test
        </div>
        <div 
          className={`tab ${currentTab === 'history' ? 'active' : ''}`}
          onClick={() => setCurrentTab('history')}
        >
          <HistoryIcon size={16} style={{ marginBottom: '-3px', marginRight: '4px' }} /> History
        </div>
      </div>

      {currentTab === 'test' ? (
        <>
          <div className="card">
            <div className="section-title">
              Rules
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className={`btn ${isClearSessionPending ? 'btn-danger' : 'btn-outline'}`}
                  onClick={clearSession}
                  style={isClearSessionPending ? { border: '1px solid var(--error-color)' } : undefined}
                >
                  <Eraser size={16} />
                  {isClearSessionPending ? 'Click again to confirm' : 'Clear'}
                </button>
                <button className="btn btn-primary" onClick={saveToHistory}>
                  <Save size={16} /> Save Session
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <label className="label-text">Session Name (Optional)</label>
                <input 
                  type="text" 
                  value={sessionName} 
                  onChange={(e) => setSessionName(e.target.value)}
                  placeholder="e.g. KyotoTycoon"
                  style={{ marginBottom: '0.5rem' }}
                />
              </div>
              <div>
                <label className="label-text">Match Rules (RULE_NAME PATTERN, one per line)</label>
                <GrokEditor 
                  value={matchRules} 
                  onChange={setMatchRules}
                  placeholder="e.g. common %{IP:client_ip} ..."
                />
              </div>
              <div>
                <label className="label-text">Support Rules (Optional, e.g. RULE_NAME PATTERN)</label>
                <GrokEditor 
                  value={supportRules} 
                  onChange={setSupportRules}
                  placeholder="e.g. MY_RULE %{DIGIT}"
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="section-title">
              Log Samples
              <button className="btn btn-outline" onClick={addSample}>
                <Plus size={16} /> Add Sample
              </button>
            </div>
            
            {samples.map((sample) => (
              <div key={sample.id} className="sample-row">
                <div className="sample-header">
                  <input 
                    type="text" 
                    value={sample.text} 
                    onChange={(e) => updateSample(sample.id, e.target.value)}
                    placeholder="Enter log line..."
                  />
                  {samples.length > 1 && (
                    <button className="btn btn-danger" onClick={() => removeSample(sample.id)}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {results[sample.id] && sample.text.trim() && (
                  <div className="result-container" style={{ opacity: results[sample.id].isLoading ? 0.6 : 1 }}>
                    {results[sample.id].isLoading && (
                      <div className="loading-indicator">Parsing...</div>
                    )}
                    
                    {results[sample.id].error ? (
                      <div className="result-error">
                        <AlertCircle size={14} style={{ marginRight: '4px' }} />
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{results[sample.id].error}</pre>
                      </div>
                    ) : results[sample.id].parsed ? (
                      <div>
                        <div style={{ color: '#4ade80', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={14} /> Parsed Successfully
                          </div>
                          {results[sample.id].matched_rule && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#334155', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', color: '#cbd5e1' }}>
                              <Tag size={10} /> {results[sample.id].matched_rule}
                            </div>
                          )}
                        </div>
                        <pre style={{ margin: 0 }}>
                          <JsonFormatter data={results[sample.id].parsed} />
                        </pre>
                      </div>
                    ) : (
                      <div className="result-error">
                        <AlertCircle size={14} style={{ marginRight: '4px' }} />
                        No match
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <button className="btn btn-outline" onClick={exportAsTerraform} style={{ width: '100%', justifyContent: 'center', padding: '1rem' }}>
              <Code size={18} /> Export as Terraform (.tfvars)
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="section-title">
              Actions
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-outline" onClick={exportHistory}>
                  <Download size={16} /> Export JSON
                </button>
                <button className="btn btn-outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={16} /> Import JSON
                </button>
                <button className="btn btn-outline" onClick={() => ddIntegrationInputRef.current?.click()}>
                  <Upload size={16} /> Import Datadog Integrations
                </button>
                <button
                  className="btn btn-danger"
                  style={{ border: '1px solid var(--error-color)' }}
                  onClick={clearHistory}
                >
                  <Trash2 size={16} />
                  {isClearHistoryPending ? 'Click again to confirm' : 'Clear History'}
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  accept=".json" 
                  onChange={importHistory}
                />
                <input 
                  type="file" 
                  ref={ddIntegrationInputRef} 
                  style={{ display: 'none' }} 
                  accept=".json" 
                  onChange={importDatadogIntegrations}
                />
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {history.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No saved sessions yet.
              </div>
            ) : (
              history.map((item) => (
                <div key={item.id} className="history-item">
                  <div className="history-info">
                    <div className="history-date">
                      {new Date(item.timestamp).toLocaleString()}
                      {item.id === currentSessionId && (
                        <span style={{ marginLeft: '8px', backgroundColor: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>ACTIVE</span>
                      )}
                    </div>
                    <div className="history-summary">
                      {item.name ? (
                        <strong style={{ display: 'block', marginBottom: '4px', fontSize: '14px', color: 'var(--text-color)' }}>
                          {item.name}
                        </strong>
                      ) : null}
                      <div style={{ color: 'var(--text-muted)' }}>
                        {item.matchRules.split('\n')[0] || 'No rules'} 
                        {item.matchRules.split('\n').length > 1 ? ' ...' : ''}
                        <span style={{ margin: '0 8px', color: '#e2e8f0' }}>|</span>
                        {item.samples.length} sample(s)
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-outline" onClick={() => loadFromHistory(item)}>
                      Load
                    </button>
                    <button
                      className="btn btn-danger"
                      style={{ border: pendingDeleteId === item.id ? '1px solid var(--error-color)' : 'none' }}
                      onClick={() => deleteFromHistory(item.id)}
                    >
                      {pendingDeleteId === item.id
                        ? <><Trash2 size={16} /> Confirm?</>
                        : <Trash2 size={16} />
                      }
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {ddImportCandidates && (
        <ImportDialog
          candidates={ddImportCandidates}
          onConfirm={confirmDdImport}
          onCancel={() => setDdImportCandidates(null)}
        />
      )}
    </div>
  );
}

export default App;