// A whole project in one download (js/ui/download-zip.mjs, docs/PERSIST.md
// §5.9): the zip really holds every file and empty folder, under one folder
// named after the project, so unzipping it and choosing Import folder as new
// project gives the same project back.
import '../js/ui/download-zip.mjs';

let n = 0;
function expect(cond, msg) {
  n += 1;
  if (cond) return;
  console.error('FAIL:', msg);
  process.exit(1);
}

const { projectArchive, buildZip, fileSafeName } = globalThis.DownloadZip;

/** Read a STORE zip back: every entry's path and bytes, and whether its CRC holds. */
function readZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const table = new Uint32Array(256).map((_, i) => {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const out = [];
  let at = 0;
  while (at + 4 <= bytes.length && v.getUint32(at, true) === 0x04034b50) {
    const method = v.getUint16(at + 8, true);
    const crc = v.getUint32(at + 14, true);
    const size = v.getUint32(at + 18, true);
    const nameLen = v.getUint16(at + 26, true);
    const extraLen = v.getUint16(at + 28, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen + extraLen, at + 30 + nameLen + extraLen + size);
    out.push({ path: name, text: dec.decode(data), method, crcOk: crc32(data) === crc });
    at += 30 + nameLen + extraLen + size;
  }
  return out;
}

// ── names ────────────────────────────────────────────────────────────────────
expect(fileSafeName('Lambda calculus') === 'Lambda calculus', 'an ordinary name is kept as it is');
expect(fileSafeName('a/b\\c: d*e?f"g<h>i|j') === 'a-b-c- d-e-f-g-h-i-j', 'what Windows or macOS refuse in a name becomes "-"');
expect(fileSafeName('  ..hidden.. ') === 'hidden', 'no leading dots or spaces, no trailing ones');
expect(fileSafeName('CON') === 'CON-project' && fileSafeName('lpt1') === 'lpt1-project', 'a name Windows reserves gets a suffix');
expect(fileSafeName('λ-calculus') === 'λ-calculus', 'Unicode names are fine');
expect(projectArchive('', [{ path: 'a.bel', text: '' }], []).fileName === 'project.zip', 'a project with no usable name still downloads');

// ── contents ─────────────────────────────────────────────────────────────────
const files = [
  { path: 'main.bel', text: 'rec nat : type.\n' },
  { path: 'proofs/λ.bel', text: 'λ proof ∀x.\n' },
  { path: 'proofs/sources.cfg', text: 'λ.bel\n' },
  { path: 'empty.bel', text: '' },
];
const folders = ['proofs', 'drafts', 'drafts/old'];
const archive = projectArchive('My project: λ', files, folders);
expect(archive.fileName === 'My project- λ.zip', 'the zip is named after the project');
const entries = readZip(new Uint8Array(await buildZip(archive.entries).arrayBuffer()));
const root = 'My project- λ/';
expect(entries.every((e) => e.path.startsWith(root)), 'everything sits under one folder named after the project');
expect(entries.every((e) => e.method === 0 && e.crcOk), 'every entry is stored whole, and its checksum holds');
const back = entries.filter((e) => !e.path.endsWith('/')).map((e) => ({ path: e.path.slice(root.length), text: e.text }));
const want = files.slice().sort((a, b) => (a.path < b.path ? -1 : 1));
expect(JSON.stringify(back) === JSON.stringify(want), 'every file comes back with its path and its exact text, Unicode included');
const dirs = entries.filter((e) => e.path.endsWith('/')).map((e) => e.path.slice(root.length));
expect(JSON.stringify(dirs) === JSON.stringify(['drafts/', 'drafts/old/']), 'empty folders come along; a folder with files is not listed twice');

// What Import folder as new project does with the unzipped folder: the folder
// name is the project name, and the root is stripped from every path.
const imported = { name: root.slice(0, -1), files: back.map((f) => f.path).sort() };
expect(imported.name === fileSafeName('My project: λ') && JSON.stringify(imported.files) === JSON.stringify(files.map((f) => f.path).sort()),
  'unzipped and imported, it is the same project under the same (file-safe) name');

console.log(`OK project archive (${n} checks: names, every file and empty folder under one folder, exact texts, checksums, the import round trip)`);
