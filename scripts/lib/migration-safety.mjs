// Finds statements in a migration that can lose data or break the version of the site that is still running (docs/DEPLOYMENT.md,
// "Migration safety"). Files up to FROZEN_THROUGH are history and are not checked again. A newer file may still do one of these
// things on purpose: the line just above the statement must say `-- destructive-ok: <why, and who agreed>`.
export const FROZEN_THROUGH = 49;

export const RULES = [
  { name: 'drops a table', re: /^drop\s+table\b/i },
  { name: 'drops a column', re: /^alter\s+table\b[\s\S]*\bdrop\s+column\b/i },
  { name: 'empties a table', re: /^truncate\b/i },
  { name: 'deletes rows', re: /^(with\b[\s\S]*\b)?delete\s+from\b/i },
  { name: 'drops a schema', re: /^drop\s+schema\b/i },
  { name: 'drops a type', re: /^drop\s+type\b/i },
  { name: 'renames a table or column (the running site still uses the old name)', re: /^alter\s+table\b[\s\S]*\brename\b/i },
  { name: 'changes a column type', re: /^alter\s+table\b[\s\S]*\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b/i },
  { name: 'makes a column required (the running site may still write it empty)', re: /^alter\s+table\b[\s\S]*\balter\s+column\s+\S+\s+set\s+not\s+null\b/i },
  { name: 'adds a required column with no default (the running site does not fill it)', re: /^alter\s+table\b[\s\S]*\badd\s+column\b(?![\s\S]*\bdefault\b)[\s\S]*\bnot\s+null\b/i },
];

const APPROVAL = /--\s*destructive-ok:\s*\S.{9,}/i;

/* Blanks what is not SQL code: quoted text and function bodies ($$ ... $$) become spaces, and inside "--" comments a ";" or a quote
   becomes a space, so neither a word in a string nor a comment is taken for a statement. Line breaks are kept, so line numbers hold. */
function blank(sql) {
  let out = '';
  let i = 0;
  const keepLines = (t) => t.replace(/[^\n]/g, ' ');
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i) < 0 ? sql.length : sql.indexOf('\n', i);
      out += sql.slice(i, end).replace(/[;'$]/g, ' ');
      i = end;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += keepLines(sql.slice(i, j + 1));
      i = j + 1;
    } else if (sql[i] === '$' && /^\$(\w*)\$/.test(sql.slice(i))) {
      const tag = /^\$(\w*)\$/.exec(sql.slice(i))[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end < 0 ? sql.length : end + tag.length;
      out += keepLines(sql.slice(i, stop));
      i = stop;
    } else out += sql[i++];
  }
  return out;
}

/* Splits SQL into statements, each with the comment lines just above it. */
export function statements(sql) {
  const blanked = blank(sql);
  const out = [];
  let start = 0;
  for (let i = 0; i <= blanked.length; i++) {
    if (i < blanked.length && blanked[i] !== ';') continue;
    const chunk = blanked.slice(start, i);
    const lines = chunk.split('\n');
    const line = sql.slice(0, start).split('\n').length;
    const code = lines
      .filter((l) => !/^\s*--/.test(l))
      .map((l) => l.replace(/--.*$/, ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (code) {
      const firstCode = lines.findIndex((l) => l.trim() && !/^\s*--/.test(l));
      const comments = lines.slice(0, firstCode).filter((l) => /^\s*--/.test(l));
      out.push({ code, comments, line: line + firstCode });
    }
    start = i + 1;
  }
  return out;
}

/* Problems in one migration file: [{ line, rule, code }]. Approved statements are left out. */
export function findProblems(sql) {
  const problems = [];
  for (const s of statements(sql)) {
    const hit = RULES.find((r) => r.re.test(s.code));
    if (!hit) continue;
    if (s.comments.length && APPROVAL.test(s.comments[s.comments.length - 1])) continue;
    problems.push({ line: s.line, rule: hit.name, code: s.code.slice(0, 120) });
  }
  return problems;
}

export function fileNumber(name) {
  const m = /^(\d+)_/.exec(name);
  return m ? Number(m[1]) : NaN;
}
