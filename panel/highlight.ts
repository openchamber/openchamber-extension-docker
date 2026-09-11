/** Tiny highlighter for container file previews. No npm deps. */

export const escapeHtml = (value: string): string => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
);

export const languageFromPath = (path: string): string => {
  const base = path.split('/').pop()?.toLowerCase() ?? '';
  if (base === 'dockerfile' || base.startsWith('dockerfile.')) return 'dockerfile';
  if (base === 'makefile' || base === 'cmakelists.txt') return 'shell';
  if (base.startsWith('.env') || base.endsWith('.env')) return 'env';
  const dot = base.lastIndexOf('.');
  const ext = dot >= 0 ? base.slice(dot + 1) : '';
  switch (ext) {
    case 'json':
      return 'json';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'ts':
    case 'tsx':
      return 'js';
    case 'sh':
    case 'bash':
    case 'zsh':
      return 'shell';
    case 'py':
      return 'python';
    case 'go':
      return 'go';
    case 'rs':
      return 'rust';
    case 'toml':
      return 'toml';
    case 'xml':
    case 'html':
    case 'svg':
      return 'xml';
    case 'css':
    case 'scss':
      return 'css';
    case 'md':
    case 'markdown':
      return 'md';
    case 'sql':
      return 'sql';
    case 'conf':
    case 'cfg':
    case 'ini':
      return 'ini';
    case 'log':
      return 'log';
    default:
      return 'text';
  }
};

const wrap = (cls: string, text: string): string => (
  `<span class="hl-${cls}">${text}</span>`
);

const highlightLineComment = (line: string, marker: string): string | null => {
  const idx = line.indexOf(marker);
  if (idx < 0) return null;
  return escapeHtml(line.slice(0, idx)) + wrap('cmt', escapeHtml(line.slice(idx)));
};

const highlightStringsAndNumbers = (escaped: string): string => (
  escaped.replace(
    /(&quot;(?:\\.|[^&])*?&quot;|&#39;(?:\\.|[^&])*?&#39;|\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)/gi,
    (match) => {
      if (match.startsWith('&quot;') || match.startsWith('&#39;')) {
        return wrap('str', match);
      }
      return wrap('num', match);
    },
  )
);

const highlightKeywords = (escaped: string, keywords: string[]): string => {
  if (keywords.length === 0) return escaped;
  const pattern = new RegExp(`\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'g');
  return escaped.replace(pattern, (match) => wrap('kw', match));
};

const JS_KEYWORDS = [
  'async', 'await', 'break', 'class', 'const', 'else', 'export', 'from', 'function',
  'if', 'import', 'let', 'new', 'return', 'throw', 'try', 'catch', 'typeof', 'var',
  'void', 'while', 'for', 'of', 'in', 'switch', 'case', 'break', 'true', 'false', 'null',
  'undefined', 'interface', 'type', 'extends', 'implements', 'public', 'private',
];

const PYTHON_KEYWORDS = [
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'False', 'for', 'from', 'if', 'import', 'in', 'is', 'lambda',
  'None', 'not', 'or', 'pass', 'raise', 'return', 'True', 'try', 'while', 'with', 'yield',
];

const SHELL_KEYWORDS = [
  'if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac',
  'in', 'function', 'return', 'export', 'local', 'set', 'unset', 'echo', 'exit',
];

const highlightJson = (code: string): string => {
  const escaped = escapeHtml(code);
  return escaped.replace(
    /(&quot;.*?&quot;)(\s*:)?|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|\b(true|false|null)\b/gi,
    (match, str, colon, num, lit) => {
      if (str) {
        return wrap(colon ? 'key' : 'str', str) + (colon || '');
      }
      if (num) return wrap('num', num);
      if (lit) return wrap('kw', lit);
      return match;
    },
  );
};

const highlightYaml = (code: string): string => (
  code.split('\n').map((line) => {
    const comment = highlightLineComment(line, '#');
    if (comment) return comment;
    const escaped = escapeHtml(line);
    return escaped.replace(
      /^(\s*)([^:#\n]+?)(\s*:)(\s*)(.*)$/,
      (_m, indent, key, colon, space, rest) => (
        indent
        + wrap('key', key)
        + colon
        + space
        + highlightStringsAndNumbers(rest)
      ),
    );
  }).join('\n')
);

const highlightGeneric = (code: string, keywords: string[], commentMarker: string | null): string => (
  code.split('\n').map((line) => {
    if (commentMarker) {
      const idx = line.indexOf(commentMarker);
      if (idx >= 0) {
        const codePart = line.slice(0, idx);
        const cmtPart = line.slice(idx);
        return highlightKeywords(highlightStringsAndNumbers(escapeHtml(codePart)), keywords)
          + wrap('cmt', escapeHtml(cmtPart));
      }
    }
    return highlightKeywords(highlightStringsAndNumbers(escapeHtml(line)), keywords);
  }).join('\n')
);

const highlightEnv = (code: string): string => (
  code.split('\n').map((line) => {
    if (line.trimStart().startsWith('#')) {
      return wrap('cmt', escapeHtml(line));
    }
    const eq = line.indexOf('=');
    if (eq <= 0) return escapeHtml(line);
    return wrap('key', escapeHtml(line.slice(0, eq)))
      + escapeHtml('=')
      + wrap('str', escapeHtml(line.slice(eq + 1)));
  }).join('\n')
);

const highlightDockerfile = (code: string): string => (
  code.split('\n').map((line) => {
    if (line.trimStart().startsWith('#')) {
      return wrap('cmt', escapeHtml(line));
    }
    return escapeHtml(line).replace(
      /^(\s*)(FROM|RUN|CMD|LABEL|EXPOSE|ENV|ADD|COPY|ENTRYPOINT|VOLUME|USER|WORKDIR|ARG|ONBUILD|STOPSIGNAL|HEALTHCHECK|SHELL)\b/i,
      (_m, indent, instr) => indent + wrap('kw', instr),
    );
  }).join('\n')
);

const highlightLog = (code: string): string => (
  code.split('\n').map((line) => {
    const escaped = escapeHtml(line);
    if (/\b(ERROR|FATAL|CRIT|CRITICAL)\b/i.test(line)) return wrap('err', escaped);
    if (/\b(WARN|WARNING)\b/i.test(line)) return wrap('warn', escaped);
    if (/\b(INFO|DEBUG|TRACE)\b/i.test(line)) return wrap('info', escaped);
    return escaped;
  }).join('\n')
);

export const highlightCode = (code: string, language: string): string => {
  switch (language) {
    case 'json':
      return highlightJson(code);
    case 'yaml':
      return highlightYaml(code);
    case 'js':
      return highlightGeneric(code, JS_KEYWORDS, '//');
    case 'python':
      return highlightGeneric(code, PYTHON_KEYWORDS, '#');
    case 'shell':
      return highlightGeneric(code, SHELL_KEYWORDS, '#');
    case 'go':
      return highlightGeneric(code, ['func', 'return', 'package', 'import', 'var', 'const', 'type', 'struct', 'interface', 'if', 'else', 'for', 'range', 'go', 'defer', 'chan', 'map', 'true', 'false', 'nil'], '//');
    case 'rust':
      return highlightGeneric(code, ['fn', 'let', 'mut', 'pub', 'struct', 'enum', 'impl', 'trait', 'use', 'mod', 'return', 'if', 'else', 'match', 'true', 'false'], '//');
    case 'env':
    case 'ini':
      return highlightEnv(code);
    case 'dockerfile':
      return highlightDockerfile(code);
    case 'log':
      return highlightLog(code);
    case 'sql':
      return highlightGeneric(code, ['select', 'from', 'where', 'and', 'or', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'index', 'join', 'left', 'right', 'inner', 'on', 'as', 'null', 'not'], '--');
    default:
      return escapeHtml(code);
  }
};
