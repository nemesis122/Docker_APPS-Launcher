'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FakeDSM } = require('./fake-dsm.js');
const NAS = require('../src/app/ui/nas-store.js');

const app = (n, extra = {}) => ({ id: 'app-' + n, name: 'App ' + n, url: 'http://nas.local:' + (8000 + n), category: 'Tools', icon: 'container', description: '', ...extra });
const store = (dsm, opts = {}) => new NAS.Store({ fetcher: dsm.fetcher(), getToken: () => 'tok', ...opts });
const FOLDER = '/docker/Docker APPS';

test('erster Start legt Ordner und Revision 1 an', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  const state = await s.open();
  assert.equal(state.revision, 1);
  assert.deepEqual(state.apps, []);
  assert.ok(dsm.dirs.has(FOLDER));
  assert.deepEqual(dsm.revisionFiles(), ['apps-000000000001.json']);
});

test('Speichern erhöht Revision, veraltete Revision ergibt Konflikt', async () => {
  const dsm = new FakeDSM(), a = store(dsm), b = store(dsm);
  await a.open();
  const s2 = await a.save([app(1)], 1);
  assert.equal(s2.revision, 2);
  assert.equal(s2.apps[0].name, 'App 1');
  await assert.rejects(b.save([app(2)], 1), err => err.code === 'conflict' && !/\(conflict\)/.test(err.message));
  assert.equal((await b.load()).apps.length, 1);
});

test('zwei gleichzeitige Schreiber: genau einer gewinnt', async () => {
  const dsm = new FakeDSM(), a = store(dsm), b = store(dsm);
  await a.open(); await b.load();
  const results = await Promise.allSettled([a.save([app(1)], 1), b.save([app(2)], 1)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.code === 'conflict').length, 1);
  assert.equal((await a.load()).revision, 2);
});

test('revisions(): neueste zuerst, mit Zeitstempel, fremde Dateien ignoriert', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open();
  for (let i = 1; i <= 4; i++) await s.save([app(i)], i);
  dsm.files.set(FOLDER + '/notes.txt', { content: 'x', mtime: 1 });
  dsm.files.set(FOLDER + '/apps-abc.json', { content: '{}', mtime: 1 });
  dsm.files.set(FOLDER + '/apps-000000000000.json', { content: '{}', mtime: 1 });
  const list = await s.revisions();
  assert.deepEqual(list.map(r => r.revision), [5, 4, 3, 2, 1]);
  assert.ok(list.every(r => Number.isFinite(r.mtime) && r.size > 0));
  assert.ok(list[0].mtime > list[4].mtime);
});

test('prune(): behält die neuesten 30, löscht nur alte Revisionsdateien', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open();
  for (let i = 1; i < 45; i++) await s.save([app(i)], i);
  dsm.files.set(FOLDER + '/notes.txt', { content: 'bleibt', mtime: 1 });
  dsm.files.set('/docker/apps-000000000001.json', { content: 'außerhalb', mtime: 1 });
  const result = await s.prune();
  assert.equal(result.deleted, 15);
  const left = (await s.revisions()).map(r => r.revision);
  assert.equal(left.length, 30);
  assert.equal(left[0], 45);
  assert.equal(left.at(-1), 16);
  assert.ok(dsm.files.has(FOLDER + '/notes.txt'));
  assert.ok(dsm.files.has('/docker/apps-000000000001.json'));
  assert.ok(dsm.deleted.every(p => /^\/docker\/Docker APPS\/apps-\d{12}\.json$/.test(p)));
  assert.equal((await s.load()).revision, 45, 'aktuelle Liste unverändert');
  assert.deepEqual(await s.prune(), { deleted: 0 }, 'zweiter Lauf löscht nichts');
});

test('prune(): große Altbestände werden in Paketen zu 100 gelöscht', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open();
  const latest = await s.load();
  // 250 alte Dateien direkt anlegen (simuliert Bestand aus 1.4.x)
  const content = n => JSON.stringify({ format: 'docker-apps-shared', version: 1, revision: n, nonce: 'n' + n, apps: [] });
  dsm.files.clear();
  for (let n = 1; n <= 250; n++) dsm.files.set(FOLDER + '/' + NAS.filename(n), { content: content(n), mtime: n });
  assert.equal(latest.revision, 1);
  const result = await s.prune();
  assert.equal(result.deleted, 220);
  const deleteCalls = dsm.calls.filter(c => c.api === 'SYNO.FileStation.Delete');
  assert.equal(deleteCalls.length, 3);
  assert.ok(deleteCalls.every(c => JSON.parse(c.params.path).length <= 100));
  assert.equal((await s.load()).revision, 250);
});

test('prune(): ohne Delete-API kein Fehler, nichts gelöscht', async () => {
  const dsm = new FakeDSM({ deleteApi: false }), s = store(dsm);
  await s.open();
  for (let i = 1; i < 35; i++) await s.save([app(i)], i);
  const result = await s.prune();
  assert.equal(result.deleted, 0);
  assert.match(result.error, /deleted|gelöscht/);
  assert.equal((await s.revisions()).length, 35);
});

test('prune(): DSM-Fehler wird abgefangen', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open();
  for (let i = 1; i < 35; i++) await s.save([app(i)], i);
  dsm.failNext = { api: 'SYNO.FileStation.Delete', code: 407 };
  const result = await s.prune();
  assert.equal(result.deleted, 0);
  assert.ok(result.error);
});

test('prune(): mit keep<2 passiert nichts', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open(); await s.save([app(1)], 1);
  assert.deepEqual(await s.prune(1), { deleted: 0 });
  assert.deepEqual(await s.prune('x'), { deleted: 0 });
  assert.equal((await s.revisions()).length, 2);
});

test('readRevision(): ältere Version lesen und validieren', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open();
  await s.save([app(1)], 1);
  await s.save([app(1), app(2)], 2);
  const old = await s.readRevision(2);
  assert.deepEqual(old.apps.map(a => a.id), ['app-1']);
  await assert.rejects(s.readRevision(0));
  await assert.rejects(s.readRevision(1.5));
  await assert.rejects(s.readRevision(99));
  dsm.files.set(FOLDER + '/' + NAS.filename(2), { content: '{kaputt', mtime: 1 });
  await assert.rejects(s.readRevision(2), /damaged|beschädigt/);
  dsm.files.set(FOLDER + '/' + NAS.filename(2), { content: JSON.stringify({ format: 'docker-apps-shared', version: 1, revision: 7, nonce: 'x', apps: [] }), mtime: 1 });
  await assert.rejects(s.readRevision(2), /Invalid|Ungültig/);
});

test('Wiederherstellen = neue Revision mit altem Inhalt', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open();
  await s.save([app(1), app(2)], 1);
  await s.save([app(1)], 2);
  const old = await s.readRevision(2);
  const restored = await s.save(old.apps, 3);
  assert.equal(restored.revision, 4);
  assert.deepEqual(restored.apps.map(a => a.id), ['app-1', 'app-2']);
  assert.equal((await s.revisions()).length, 4, 'nichts überschrieben');
});

test('fehlende Freigabe docker: Fehlercode no-share', async () => {
  const dsm = new FakeDSM({ shares: ['homes', 'Container'] }), s = store(dsm);
  await assert.rejects(s.open(), err => err.code === 'no-share' && err.share === 'docker' && /docker/.test(err.message));
  assert.deepEqual(await s.listShares(), ['Container', 'homes']);
});

test('anderer Speicherort: setShare und Konstruktor-Option', async () => {
  const dsm = new FakeDSM({ shares: ['homes', 'Container'] });
  const s = store(dsm);
  s.setShare('Container');
  const state = await s.open();
  assert.equal(state.revision, 1);
  assert.equal(s.folder, '/Container/Docker APPS');
  assert.ok(dsm.dirs.has('/Container/Docker APPS'));
  const t = store(dsm, { share: 'Container' });
  assert.equal((await t.load()).revision, 1);
  const u = store(dsm, { share: '../etc' });
  assert.equal(u.shareName, 'docker', 'ungültige Option wird ignoriert');
});

test('setShare(): ungültige Namen werden abgelehnt, null setzt Standard', () => {
  const s = store(new FakeDSM());
  for (const bad of ['', '..', 'a/b', 'a\\b', 'x'.repeat(65), 'a:b', 'a\nb', 5])
    assert.throws(() => s.setShare(bad), undefined, String(bad));
  s.setShare('Apps'); assert.equal(s.shareName, 'Apps');
  s.setShare(null); assert.equal(s.shareName, 'docker');
});

test('Wechsel des Speicherorts setzt Ordner zurück', async () => {
  const dsm = new FakeDSM(), s = store(dsm);
  await s.open(); await s.save([app(1)], 1);
  s.setShare('Apps');
  assert.equal(s.folder, null);
  assert.equal((await s.load()).revision, 0);
  const copied = await s.save([app(1)], 0);
  assert.equal(copied.revision, 1);
  assert.equal(s.folder, '/Apps/Docker APPS');
  s.setShare(null);
  assert.equal((await s.load()).revision, 2, 'alte Liste unter docker unverändert');
});

test('Freigabename ohne Rücksicht auf Groß-/Kleinschreibung (wie 1.4.5)', async () => {
  const dsm = new FakeDSM({ shares: ['Docker'] }), s = store(dsm);
  assert.equal((await s.open()).revision, 1);
  assert.equal(s.folder, '/Docker/Docker APPS');
});

test('alle Anfragen gehen nur an /webapi/ mit Token', async () => {
  const dsm = new FakeDSM(), seen = [];
  const s = new NAS.Store({ fetcher: (url, o) => { seen.push({ url, token: o.headers['X-SYNO-TOKEN'] }); return dsm.fetch(url, o); }, getToken: () => 'tok' });
  await s.open(); await s.save([app(1)], 1); await s.prune(); await s.revisions(); await s.listShares();
  assert.ok(seen.length > 5);
  assert.ok(seen.every(x => /^\/webapi\/[a-z]+\.cgi$/.test(x.url) && x.token === 'tok'));
});
