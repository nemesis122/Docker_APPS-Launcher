'use strict';
// In-memory simulation of the DSM Web API parts Docker Apps uses.
// Behaviour follows the documented File Station API: JSON-encoded parameters,
// upload without overwrite fails with 1805 (file exists), list_share/list/delete.
class FakeDSM {
  constructor({ shares = ['docker', 'homes', 'Apps'], deleteApi = true, clock = 1700000000 } = {}) {
    this.files = new Map(); // path -> {content, mtime}
    this.dirs = new Set(shares.map(s => '/' + s));
    this.shares = shares;
    this.deleteApi = deleteApi;
    this.clock = clock;
    this.calls = [];
    this.deleted = [];
    this.failNext = null; // {api, code}
  }
  apiInfo() {
    const info = {
      'SYNO.API.Info': { path: 'query.cgi', minVersion: 1, maxVersion: 1 },
      'SYNO.FileStation.List': { path: 'entry.cgi', minVersion: 1, maxVersion: 2 },
      'SYNO.FileStation.CreateFolder': { path: 'entry.cgi', minVersion: 1, maxVersion: 2 },
      'SYNO.FileStation.Download': { path: 'entry.cgi', minVersion: 1, maxVersion: 2 },
      'SYNO.FileStation.Upload': { path: 'entry.cgi', minVersion: 1, maxVersion: 3 },
      'SYNO.Docker.Container': { path: 'entry.cgi', minVersion: 1, maxVersion: 1 },
      'SYNO.Core.System.Utilization': { path: 'entry.cgi', minVersion: 1, maxVersion: 1 },
    };
    if (this.deleteApi) info['SYNO.FileStation.Delete'] = { path: 'entry.cgi', minVersion: 1, maxVersion: 2 };
    return info;
  }
  ok(data) { return new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'content-type': 'application/json' } }); }
  err(code) { return new Response(JSON.stringify({ success: false, error: { code } }), { status: 200, headers: { 'content-type': 'application/json' } }); }
  // Decode a File Station parameter (v2 sends JSON-encoded values).
  static param(value) { if (value === undefined || value === null) return value; try { return JSON.parse(value); } catch { return value; } }
  async fetch(url, opts = {}) {
    if (!String(url).startsWith('/webapi/')) throw new Error('unexpected URL ' + url);
    if (opts.redirect !== 'error' || opts.credentials !== 'same-origin') throw new Error('unsafe fetch options');
    let params;
    if (opts.body instanceof FormData) {
      params = {};
      for (const [k, v] of opts.body.entries()) params[k] = v;
    } else params = Object.fromEntries(new URLSearchParams(String(opts.body)));
    const { api, method } = params;
    this.calls.push({ api, method, params });
    if (this.failNext && this.failNext.api === api) { const code = this.failNext.code; this.failNext = null; return this.err(code); }
    const P = k => FakeDSM.param(params[k]);
    if (api === 'SYNO.API.Info') return this.ok(this.apiInfo());
    if (api === 'SYNO.FileStation.List' && method === 'list_share')
      return this.ok({ shares: this.shares.map(name => ({ name, path: '/' + name, isdir: true })), total: this.shares.length, offset: 0 });
    if (api === 'SYNO.FileStation.List' && method === 'list') {
      const folder = P('folder_path');
      if (!this.dirs.has(folder)) return this.err(408);
      const pattern = P('pattern');
      const regex = pattern ? new RegExp('^' + String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i') : null;
      const additional = P('additional') || [];
      const rows = [];
      for (const d of this.dirs) if (d.startsWith(folder + '/') && !d.slice(folder.length + 1).includes('/')) rows.push({ name: d.slice(folder.length + 1), path: d, isdir: true });
      for (const [path, f] of this.files) if (path.startsWith(folder + '/') && !path.slice(folder.length + 1).includes('/')) rows.push({ name: path.slice(folder.length + 1), path, isdir: false, ...(additional.length ? { additional: { time: { mtime: f.mtime }, size: Buffer.byteLength(f.content) } } : {}) });
      const files = rows.filter(r => !regex || regex.test(r.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      if (P('sort_direction') === 'desc') files.reverse();
      return this.ok({ files, total: files.length, offset: 0 });
    }
    if (api === 'SYNO.FileStation.CreateFolder') {
      const parent = P('folder_path')[0], name = P('name')[0];
      if (!this.dirs.has(parent)) return this.err(408);
      this.dirs.add(parent + '/' + name);
      return this.ok({ folders: [{ name, path: parent + '/' + name, isdir: true }] });
    }
    if (api === 'SYNO.FileStation.Upload') {
      const dir = params.path, file = params.file;
      if (!this.dirs.has(dir)) return this.err(408);
      const path = dir + '/' + file.name;
      if (this.files.has(path) && params.overwrite !== 'true') return this.err(1805);
      this.files.set(path, { content: await file.text(), mtime: ++this.clock });
      return this.ok({});
    }
    if (api === 'SYNO.FileStation.Download') {
      const path = P('path')[0], f = this.files.get(path);
      if (!f) return new Response(JSON.stringify({ success: false, error: { code: 408 } }), { status: 200 });
      return new Response(f.content, { status: 200, headers: { 'content-type': 'application/octet-stream', 'content-length': String(Buffer.byteLength(f.content)) } });
    }
    if (api === 'SYNO.FileStation.Delete') {
      if (!this.deleteApi) return this.err(102);
      const paths = P('path');
      if (!Array.isArray(paths)) return this.err(101);
      for (const p of paths) { this.files.delete(p); this.deleted.push(p); }
      return this.ok({});
    }
    return this.err(102);
  }
  fetcher() { return (url, opts) => this.fetch(url, opts); }
  revisionFiles(folder = '/docker/Docker APPS') {
    return [...this.files.keys()].filter(p => p.startsWith(folder + '/')).map(p => p.slice(folder.length + 1)).sort();
  }
}
module.exports = { FakeDSM };
