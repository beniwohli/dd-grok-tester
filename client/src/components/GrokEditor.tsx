import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/themes/prism.css';

// Ensure we get the actual component if it's wrapped in a default object (common in some build environments)
const CodeEditor = (Editor as unknown as { default: typeof Editor }).default || Editor;

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
    pattern: /%\{[^}]+\}/,
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

// Walk the Prism token tree and tag Datadog built-in matchers/filters with a
// 'dd-builtin' alias so Prism renders them with a distinct CSS class.
interface PrismToken {
  type: string;
  content: string | PrismToken | (string | PrismToken)[];
  alias: string | string[];
}

function tagBuiltins(tokens: (string | PrismToken)[]) {
  for (const token of tokens) {
    if (typeof token === 'string') continue;

    if (token.type === 'grok-pattern' && typeof token.content === 'string') {
      const baseName = token.content.replace(/\(.*$/, '');
      if (DD_MATCHERS.has(baseName)) {
        token.alias = 'dd-builtin';
      }
    } else if (token.type === 'grok-filter' && typeof token.content === 'string') {
      const filterName = token.content.slice(1).replace(/\(.*$/, '');
      if (DD_FILTERS.has(filterName)) {
        token.alias = 'dd-builtin';
      }
    }

    // Recurse into nested content
    if (Array.isArray(token.content)) {
      tagBuiltins(token.content as (string | PrismToken)[]);
    } else if (typeof token.content !== 'string') {
      tagBuiltins([token.content]);
    }
  }
}

// Register the hook once at module load. It fires after Prism tokenises any
// 'grok' code block, before the tokens are stringified to HTML.
Prism.hooks.add('after-tokenize', (env) => {
  if (env.language !== 'grok') return;
  tagBuiltins(env.tokens as (string | PrismToken)[]);
});

const highlightGrok = (code: string): string => {
  return Prism.highlight(code, grokLanguage as Prism.Grammar, 'grok');
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
  { label: 'boolean',            kind: 'matcher',                 desc: 'true / false (case-insensitive)' },
  { label: 'data',               kind: 'matcher',                 desc: 'Any string incl. spaces (.*)' },
  { label: 'date',               kind: 'matcher', suffix: '("',  desc: 'Parse date → Unix timestamp' },
  { label: 'doubleQuotedString', kind: 'matcher',                 desc: 'Double-quoted string' },
  { label: 'hostname',           kind: 'matcher',                 desc: 'Hostname' },
  { label: 'integer',            kind: 'matcher',                 desc: 'Integer → integer' },
  { label: 'integerExt',         kind: 'matcher',                 desc: 'Integer w/ sci-notation → integer' },
  { label: 'integerExtStr',      kind: 'matcher',                 desc: 'Integer w/ sci-notation → string' },
  { label: 'integerStr',         kind: 'matcher',                 desc: 'Integer → string' },
  { label: 'ip',                 kind: 'matcher',                 desc: 'IPv4 or IPv6 address' },
  { label: 'ipOrHost',           kind: 'matcher',                 desc: 'Hostname or IP' },
  { label: 'ipv4',               kind: 'matcher',                 desc: 'IPv4 address' },
  { label: 'ipv6',               kind: 'matcher',                 desc: 'IPv6 address' },
  { label: 'mac',                kind: 'matcher',                 desc: 'MAC address' },
  { label: 'notSpace',           kind: 'matcher',                 desc: 'Any string up to next space' },
  { label: 'number',             kind: 'matcher',                 desc: 'Float → double' },
  { label: 'numberExt',          kind: 'matcher',                 desc: 'Float w/ sci-notation → double' },
  { label: 'numberExtStr',       kind: 'matcher',                 desc: 'Float w/ sci-notation → string' },
  { label: 'numberStr',          kind: 'matcher',                 desc: 'Float → string' },
  { label: 'port',               kind: 'matcher',                 desc: 'Port number' },
  { label: 'quotedString',       kind: 'matcher',                 desc: 'Single- or double-quoted string' },
  { label: 'regex',              kind: 'matcher', suffix: '("',  desc: 'Match a custom regex' },
  { label: 'singleQuotedString', kind: 'matcher',                 desc: 'Single-quoted string' },
  { label: 'uuid',               kind: 'matcher',                 desc: 'UUID' },
  { label: 'word',               kind: 'matcher',                 desc: 'Word boundary token (\\b\\w+\\b)' },
];

const AC_FILTERS: AcItem[] = [
  { label: 'array',              kind: 'filter',  suffix: '(',    desc: 'Parse list into array' },
  { label: 'boolean',            kind: 'filter',                  desc: 'Parse true/false string' },
  { label: 'csv',                kind: 'filter',  suffix: '(',    desc: 'Parse CSV / TSV' },
  { label: 'decodeuricomponent', kind: 'filter',                  desc: 'Decode URI component' },
  { label: 'integer',            kind: 'filter',                  desc: 'Parse as integer' },
  { label: 'json',               kind: 'filter',                  desc: 'Parse JSON' },
  { label: 'keyvalue',           kind: 'filter',  suffix: '(',    desc: 'Parse key=value pairs' },
  { label: 'lowercase',          kind: 'filter',                  desc: 'Lowercase string' },
  { label: 'nullIf',             kind: 'filter',  suffix: '("',   desc: 'Null if equals value' },
  { label: 'number',             kind: 'filter',                  desc: 'Parse as double' },
  { label: 'querystring',        kind: 'filter',                  desc: 'Parse URL query string' },
  { label: 'rubyhash',           kind: 'filter',                  desc: 'Parse Ruby hash' },
  { label: 'scale',              kind: 'filter',  suffix: '(',    desc: 'Multiply by factor' },
  { label: 'uppercase',          kind: 'filter',                  desc: 'Uppercase string' },
  { label: 'url',                kind: 'filter',                  desc: 'Parse URL into components' },
  { label: 'useragent',          kind: 'filter',                  desc: 'Parse user-agent string' },
  { label: 'xml',                kind: 'filter',                  desc: 'Parse XML' },
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

export const GrokEditor = ({ value, onChange, placeholder }: { value: string, onChange: (val: string) => void, placeholder?: string }) => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const dropdownRef   = useRef<HTMLUListElement>(null);
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

  // Ensure active item is visible in dropdown
  useEffect(() => {
    if (acItems.length > 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.querySelector('.ac-item-active') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [acIndex, acItems]);

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
      .forEach(p => { (mirror.style as unknown as Record<string, string>)[p] = (cs as unknown as Record<string, string>)[p]; });
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
        <ul ref={dropdownRef} className="ac-dropdown" style={{ top: dropdownPos.top, left: dropdownPos.left }}>
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
