/**
 * Minimal ZIP (STORE) builder + anchor download helper for explorer exports.
 */
const global = globalThis;
var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  }

  function u32(n) {
    return new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);
  }

  function concatBytes(parts) {
    var total = 0;
    for (var i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < parts.length; j++) {
      out.set(parts[j], off);
      off += parts[j].length;
    }
    return out;
  }

  function dosDateTime(date) {
    var d = date || new Date();
    var time =
      ((d.getHours() & 0x1f) << 11) |
      ((d.getMinutes() & 0x3f) << 5) |
      ((Math.floor(d.getSeconds() / 2)) & 0x1f);
    var day =
      (((d.getFullYear() - 1980) & 0x7f) << 9) |
      (((d.getMonth() + 1) & 0xf) << 5) |
      (d.getDate() & 0x1f);
    return { time: time, date: day };
  }

  /**
   * @param {Array<{ path: string, data?: Uint8Array|string, directory?: boolean }>} entries
   * @returns {Blob}
   */
  function buildZip(entries) {
    var enc = new TextEncoder();
    var stamp = dosDateTime(new Date());
    var localParts = [];
    var centralParts = [];
    var offset = 0;
    var count = 0;

    for (var i = 0; i < entries.length; i++) {
      var ent = entries[i];
      if (!ent || !ent.path) continue;
      var isDir = !!ent.directory || /\/$/.test(ent.path);
      var path = String(ent.path).replace(/\\/g, '/');
      if (isDir && path.slice(-1) !== '/') path += '/';
      if (!path || path === '/') continue;

      var nameBytes = enc.encode(path);
      var data = isDir
        ? new Uint8Array(0)
        : (ent.data instanceof Uint8Array ? ent.data : enc.encode(ent.data == null ? '' : String(ent.data)));
      var crc = crc32(data);
      var gpFlag = 0x0800; // UTF-8 names
      var method = 0; // STORE

      var local = concatBytes([
        u32(0x04034b50),
        u16(20),
        u16(gpFlag),
        u16(method),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        nameBytes,
        data,
      ]);

      var central = concatBytes([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(gpFlag),
        u16(method),
        u16(stamp.time),
        u16(stamp.date),
        u32(crc),
        u32(data.length),
        u32(data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(isDir ? 0x10 : 0),
        u32(offset),
        nameBytes,
      ]);

      localParts.push(local);
      centralParts.push(central);
      offset += local.length;
      count += 1;
    }

    var centralDir = concatBytes(centralParts);
    var end = concatBytes([
      u32(0x06054b50),
      u16(0),
      u16(0),
      u16(count),
      u16(count),
      u32(centralDir.length),
      u32(offset),
      u16(0),
    ]);

    return new Blob([concatBytes(localParts.concat([centralDir, end]))], {
      type: 'application/zip',
    });
  }

  function triggerDownload(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadTextFile(text, fileName) {
    triggerDownload(new Blob([text == null ? '' : String(text)], { type: 'text/plain;charset=utf-8' }), fileName);
  }

  function downloadZip(entries, fileName) {
    triggerDownload(buildZip(entries), fileName || 'download.zip');
  }

  global.DownloadZip = {
    buildZip: buildZip,
    triggerDownload: triggerDownload,
    downloadTextFile: downloadTextFile,
    downloadZip: downloadZip,
  };
  global.BelJarDownloadZip = global.DownloadZip;
