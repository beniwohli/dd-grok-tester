export const generateId = () => Math.random().toString(36).substr(2, 9);

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
