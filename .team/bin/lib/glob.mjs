// Marwan SAT — gitignore-like glob matching (zero dependencies).
//
// Rules:
//   - Paths are compared with forward slashes, relative to the repository root.
//   - A pattern without "/" matches the basename at any depth ("*.env" == "**/*.env").
//   - "**" matches any number of directories; "*" and "?" never cross "/".
//   - A trailing "/" or "/**" matches everything below a directory.
//   - Matching is case-insensitive on purpose: for security checks a false
//     positive (asking for the full path) is cheaper than a false negative.

const cache = new Map();

export function toPosix(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

export function globToRegExp(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  let p = toPosix(pattern.trim());
  if (p.endsWith('/')) p += '**';
  if (!p.includes('/')) p = `**/${p}`;
  if (p.startsWith('/')) p = p.slice(1);
  let re = '';
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === '*') {
      if (p[i + 1] === '*') {
        if (p[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if ('\\^$+.()|{}[]'.includes(c)) re += `\\${c}`;
    else re += c;
  }
  const rx = new RegExp(`^${re}$`, 'i');
  cache.set(pattern, rx);
  return rx;
}

export function matchGlob(path, pattern) {
  return globToRegExp(pattern).test(toPosix(path));
}

export function matchAny(path, patterns) {
  return patterns.some((pat) => matchGlob(path, pat));
}

// Reads a sensitive-paths style list: one glob per line, "#" comments,
// and "content: <regex>" lines that match on file content instead of path.
export function parsePathList(text) {
  const globs = [];
  const contentRules = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('content:')) {
      contentRules.push(new RegExp(line.slice('content:'.length).trim(), 'm'));
    } else {
      globs.push(line);
    }
  }
  return { globs, contentRules };
}
