// Atomic, corruption-resistant JSON persistence for the SVIE CMS.
//
// Why this exists: the old helpers did `fs.writeFileSync(file, json)` directly and
// `JSON.parse(readFileSync())` with a silent `catch → default`. A crash, disk-full,
// or kill mid-write could leave a half-written (corrupt) file; the next read would
// then silently return an empty default and the following write would overwrite the
// file with empty-derived data — i.e. silent total data loss.
//
// Fixes:
//   • writeJSON → writes to a temp file, fsyncs it, then atomically renames it over
//     the target. A rename on the same filesystem is atomic, so readers always see
//     either the old complete file or the new complete file — never a partial one.
//   • Before each replace, the last good file is copied to `<file>.bak`.
//   • readJSONSafe → if the main file is missing or unparseable, it transparently
//     falls back to `<file>.bak` (and restores it), so corruption can't lose data.
const fs = require('fs');

function readJSONSafe(file, def) {
  const candidates = [file, file + '.bak'];
  for (const f of candidates) {
    let raw;
    try {
      raw = fs.readFileSync(f, 'utf8');
    } catch (e) {
      continue; // missing — try the backup, then the default
    }
    try {
      const val = JSON.parse(raw);
      if (f !== file) {
        // main file was corrupt/missing but the backup parsed — restore it
        try { fs.copyFileSync(f, file); } catch { /* best effort */ }
        console.warn('[storage] recovered ' + file + ' from backup');
      }
      return val;
    } catch {
      // unparseable — fall through to the next candidate
    }
  }
  return def;
}

function writeJSON(file, data) {
  const json = JSON.stringify(data, null, 2);
  const tmp  = file + '.tmp';

  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, json);
    fs.fsyncSync(fd);      // flush to disk before we trust it
  } finally {
    fs.closeSync(fd);
  }

  // keep the previous good version as a backup before replacing
  try {
    if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
  } catch { /* best effort — never block the write */ }

  fs.renameSync(tmp, file); // atomic replace
}

module.exports = { readJSONSafe, writeJSON };
