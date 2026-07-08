export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts or environments without crypto.randomUUID
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => {
    const n = Number(c);
    return (n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)))).toString(16);
  });
};

/**
 * Splits a single rule line of the form "NAME PATTERN" into its constituent
 * parts. Returns `{ name, pattern }`. If the line has no whitespace (i.e. it
 * is a bare pattern with no name prefix) `name` falls back to `"rule"` and
 * the entire line is used as the pattern — matching the behaviour that was
 * previously inlined in `exportAsTerraform`.
 */
export const parseRuleLine = (line: string): { name: string; pattern: string } => {
  const firstSpaceIdx = line.search(/\s/);
  if (firstSpaceIdx === -1) {
    return { name: 'rule', pattern: line };
  }
  return {
    name: line.substring(0, firstSpaceIdx),
    pattern: line.substring(firstSpaceIdx).trim(),
  };
};

export interface ParsedTerraform {
  idPrefix: string;
  matchRules: string;
  supportRules: string;
}

const unescapeHCLString = (str: string) => {
  return str.replace(/%%/g, '%').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
};

export const escapeHCLString = (str: string) => {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
};

export const parseTerraform = (hcl: string): ParsedTerraform => {
  let idPrefix = '';
  const idPrefixMatch = hcl.match(/id_prefix\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (idPrefixMatch) {
    idPrefix = unescapeHCLString(idPrefixMatch[1]);
  }

  const parseItems = (str: string) => {
    const rules: string[] = [];
    // Match { name = "...", rule = "..." } or { rule = "...", name = "..." }
    const itemRegex = /\{\s*(name|rule)\s*=\s*"((?:[^"\\]|\\.)*)"\s*(name|rule)\s*=\s*"((?:[^"\\]|\\.)*)"\s*\}/g;
    
    let match;
    while ((match = itemRegex.exec(str)) !== null) {
      const key1 = match[1];
      const val1 = unescapeHCLString(match[2]);
      const val2 = unescapeHCLString(match[4]);
      
      const name = key1 === 'name' ? val1 : val2;
      const pattern = key1 === 'rule' ? val1 : val2;
      
      if (name && pattern) {
        rules.push(`${name} ${pattern}`);
      }
    }
    return rules.join('\n');
  };

  const rulesIdx = hcl.indexOf('rules = [');
  const supportIdx = hcl.indexOf('support_rules = [');

  let matchRulesStr = '';
  let supportRulesStr = '';

  if (rulesIdx !== -1 && supportIdx !== -1) {
    if (rulesIdx < supportIdx) {
      matchRulesStr = hcl.substring(rulesIdx, supportIdx);
      supportRulesStr = hcl.substring(supportIdx);
    } else {
      supportRulesStr = hcl.substring(supportIdx, rulesIdx);
      matchRulesStr = hcl.substring(rulesIdx);
    }
  } else if (rulesIdx !== -1) {
    matchRulesStr = hcl.substring(rulesIdx);
  } else if (supportIdx !== -1) {
    supportRulesStr = hcl.substring(supportIdx);
  }

  const matchRules = parseItems(matchRulesStr);
  const supportRules = parseItems(supportRulesStr);

  return { idPrefix, matchRules, supportRules };
};
