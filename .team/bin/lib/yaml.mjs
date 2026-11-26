// Marwan SAT — minimal YAML subset parser (zero dependencies).
//
// Supported: block maps, block lists (scalars or maps), inline lists [a, b],
// inline empty map {}, comments, quoted/unquoted scalars, null/bool/numbers.
// Not supported (raises an explicit error): block scalars (| >), anchors,
// aliases, tags, multi-document streams, tabs used for indentation.
//
// SAT keeps its own config files inside this subset on purpose: no runtime
// dependencies means no supply-chain surface in the tools that guard the team.

export class YamlError extends Error {
  constructor(message, line) {
    super(line ? `YAML line ${line}: ${message}` : `YAML: ${message}`);
    this.line = line;
  }
}

function stripComment(raw) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle && raw[i - 1] !== '\\') inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

function splitInline(body, lineNo) {
  const items = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    if (c === '"' && !inSingle && body[i - 1] !== '\\') inDouble = !inDouble;
    if (c === ',' && !inSingle && !inDouble) {
      items.push(cur);
      cur = '';
    } else cur += c;
  }
  if (inSingle || inDouble) throw new YamlError('unterminated quote in inline list', lineNo);
  if (cur.trim() !== '') items.push(cur);
  return items.map((s) => parseScalar(s.trim(), lineNo));
}

export function parseScalar(text, lineNo) {
  const t = text.trim();
  if (t === '' || t === '~' || t === 'null' || t === 'Null' || t === 'NULL') return null;
  if (t === 'true' || t === 'True' || t === 'TRUE') return true;
  if (t === 'false' || t === 'False' || t === 'FALSE') return false;
  if (t === '{}') return {};
  if (t === '[]') return [];
  if (t.startsWith('[')) {
    if (!t.endsWith(']')) throw new YamlError('unterminated inline list', lineNo);
    return splitInline(t.slice(1, -1), lineNo);
  }
  if (t.startsWith('{')) throw new YamlError('inline maps are not supported (use block maps)', lineNo);
  if (t.startsWith('|') || t.startsWith('>')) throw new YamlError('block scalars (| >) are not supported', lineNo);
  if (t.startsWith('&') || t.startsWith('*') || t.startsWith('!')) throw new YamlError('anchors, aliases and tags are not supported', lineNo);
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new YamlError('unterminated double-quoted string', lineNo);
    return t
      .slice(1, -1)
      .replace(/\\(["\\nt])/g, (_, c) => ({ '"': '"', '\\': '\\', n: '\n', t: '\t' })[c]);
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new YamlError('unterminated single-quoted string', lineNo);
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[-+]?\d+$/.test(t)) return Number.parseInt(t, 10);
  if (/^[-+]?\d*\.\d+$/.test(t)) return Number.parseFloat(t);
  return t;
}

function tokenize(text) {
  if (text.includes('\t')) {
    const idx = text.split(/\r?\n/).findIndex((l) => /^\s*\t/.test(l));
    if (idx >= 0) throw new YamlError('tabs are not allowed for indentation', idx + 1);
  }
  const out = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (raw.trim() === '---' && out.length === 0) return;
    const noComment = stripComment(raw);
    if (noComment.trim() === '') return;
    const indent = noComment.length - noComment.trimStart().length;
    out.push({ indent, text: noComment.trim(), line: i + 1 });
  });
  return out;
}

function splitKey(text, lineNo) {
  // key: value — the key may be quoted.
  let key;
  let rest;
  if (text.startsWith('"') || text.startsWith("'")) {
    const q = text[0];
    const end = text.indexOf(q, 1);
    if (end < 0) throw new YamlError('unterminated quoted key', lineNo);
    key = text.slice(1, end);
    rest = text.slice(end + 1);
    if (!rest.startsWith(':')) return null;
    rest = rest.slice(1);
  } else {
    const m = /^([^:]+?):(\s|$)(.*)$/.exec(text);
    if (!m) return null;
    key = m[1].trim();
    rest = m[3];
  }
  return { key, rest: rest.trim() };
}

function parseBlock(tokens, start, indent) {
  const first = tokens[start];
  if (first.text.startsWith('- ') || first.text === '-') return parseList(tokens, start, indent);
  return parseMap(tokens, start, indent);
}

function parseMap(tokens, start, indent) {
  const obj = {};
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) throw new YamlError('unexpected indentation', tok.line);
    if (tok.text.startsWith('- ')) throw new YamlError('list item where a map key was expected', tok.line);
    const kv = splitKey(tok.text, tok.line);
    if (!kv) throw new YamlError(`expected "key: value", got "${tok.text}"`, tok.line);
    if (Object.prototype.hasOwnProperty.call(obj, kv.key)) throw new YamlError(`duplicate key "${kv.key}"`, tok.line);
    if (kv.rest === '') {
      const next = tokens[i + 1];
      if (next && next.indent > indent) {
        const [val, ni] = parseBlock(tokens, i + 1, next.indent);
        obj[kv.key] = val;
        i = ni;
        continue;
      }
      if (next && next.indent === indent && (next.text.startsWith('- ') || next.text === '-')) {
        const [val, ni] = parseList(tokens, i + 1, indent);
        obj[kv.key] = val;
        i = ni;
        continue;
      }
      obj[kv.key] = null;
      i += 1;
    } else {
      obj[kv.key] = parseScalar(kv.rest, tok.line);
      i += 1;
    }
  }
  return [obj, i];
}

function parseList(tokens, start, indent) {
  const arr = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) throw new YamlError('unexpected indentation in list', tok.line);
    if (!(tok.text.startsWith('- ') || tok.text === '-')) break;
    const itemText = tok.text === '-' ? '' : tok.text.slice(2).trim();
    if (itemText === '') {
      const next = tokens[i + 1];
      if (next && next.indent > indent) {
        const [val, ni] = parseBlock(tokens, i + 1, next.indent);
        arr.push(val);
        i = ni;
      } else {
        arr.push(null);
        i += 1;
      }
      continue;
    }
    const kv = splitKey(itemText, tok.line);
    if (kv && !itemText.startsWith('[')) {
      // list of maps: "- key: value" followed by keys indented to the item text column.
      const itemIndent = indent + 2;
      const synthetic = [{ indent: itemIndent, text: itemText, line: tok.line }];
      let j = i + 1;
      while (j < tokens.length && tokens[j].indent >= itemIndent) {
        synthetic.push(tokens[j]);
        j += 1;
      }
      const [val] = parseMap(synthetic, 0, itemIndent);
      arr.push(val);
      i = j;
    } else {
      arr.push(parseScalar(itemText, tok.line));
      i += 1;
    }
  }
  return [arr, i];
}

export function parseYaml(text) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return {};
  const [val, end] = parseBlock(tokens, 0, tokens[0].indent);
  if (end < tokens.length) throw new YamlError('unexpected content after document', tokens[end].line);
  return val;
}

// Front matter: a markdown file that starts with "---" ... "---".
export function parseFrontmatter(markdown) {
  const text = markdown.replace(/^\uFEFF/, '');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: null, body: text };
  return { data: parseYaml(m[1]), body: m[2] };
}
