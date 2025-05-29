// parser.js

// — 1) DOT parser w/ regex fallback —
export function parseDot(text, logEvent) {
  logEvent('Parsing DOT…');
  const g = graphlibDot.read(text);
  const nodes = g.nodes().map(id =>
    Object.assign({ id }, g.node(id) || {})
  );
  let links = g.edges().map(e =>
    Object.assign({ source: e.v, target: e.w }, g.edge(e) || {})
  );
  logEvent(`  → graphlib-dot found ${links.length} edges`);
  if (!links.length) {
    const re = /([^\s;"\[\]]+)\s*(--|->)\s*([^\s;"\[\]]+)(?:\s*\[([^\]]+)\])?;/g;
    let m, cnt = 0;
    while ((m = re.exec(text))) {
      links.push({
        source: m[1].replace(/^"|"$/g, ''),
        target: m[3].replace(/^"|"$/g, '')
      });
      cnt++;
    }
    logEvent(`  → fallback parsed ${cnt} edges`);
  }
  return { nodes, links };
}

// — 2) Typed parser for GFA optional fields —
export function parseTyped(type, val) {
  switch (type) {
    case 'i': return parseInt(val, 10);
    case 'f': return parseFloat(val);
    case 'Z': case 'H': return val;
    case 'B':
      const sub = val[0];
      return val.slice(2).split(',').map(v => parseTyped(sub, v));
    default: return val;
  }
}

// — 3) Enhanced GFA parser (S, L/E, P records) —
export function parseGfa(text, logEvent) {
  logEvent('Parsing GFA…');
  const nodes = [], links = [], seen = new Set();
  text.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith('#')) return;
    const cols = line.split('\t'), tag = cols[0];
    if (tag === 'S') {
      const [ , id, seq = '' ] = cols;
      nodes.push({ id, seq, length: seq.length });
    }
    else if (tag === 'L' || tag === 'E') {
      const [ , src, , tgt, , overlap ] = cols;
      const key = `${src}→${tgt}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ source: src, target: tgt, overlap });
      }
    }
    else if (tag === 'P') {
      const [ , pathName, segList = '' ] = cols;
      const segs = segList.split(',').map(s => s.replace(/[-+]$/, ''));
      for (let i = 0; i+1 < segs.length; i++) {
        const key = `${segs[i]}→${segs[i+1]}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ source: segs[i], target: segs[i+1], viaPath: pathName });
        }
      }
    }
  });
  logEvent(`  → parsed ${nodes.length} segments, ${links.length} links`);
  return { nodes, links };
}
