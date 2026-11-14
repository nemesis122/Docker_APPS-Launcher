'use strict';
// 1.6.0: own categories, NAS-address links, ordering, container rates and locating an existing list.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const UI = path.join(__dirname, '..', 'src', 'app', 'ui');
const M = require(path.join(UI, 'model.js'));
const T = require(path.join(UI, 'monitor-model.js'));
const { Store } = require(path.join(UI, 'nas-store.js'));
const { FakeDSM } = require('./fake-dsm.js');
const entry = (extra = {}) => ({ id: 'a', name: 'App', url: 'http://192.0.2.5:8080/x?y=1', category: 'Tools', icon: 'container', description: '', ...extra });

test('categories: built-in names stay, own names are kept and cleaned', () => {
  assert.equal(M.clean(entry()).category, 'Tools');
  assert.equal(M.clean(entry({ category: '  Smart \t Home\u0000 ' })).category, 'Smart Home');
  assert.equal(M.clean(entry({ category: 'x'.repeat(60) })).category.length, 40);
  for (const empty of ['', '   ', null, undefined, '\u0001']) assert.equal(M.clean(entry({ category: empty })).category, 'Andere');
  assert.equal(M.escape(M.clean(entry({ category: '<b>"x"</b>' })).category), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
test('categories: list shows built-ins, then own names, "Andere" last', () => {
  assert.deepEqual(M.categoryList([]), ['Downloads', 'Dateien', 'Medien', 'Tools', 'Andere']);
  assert.deepEqual(M.categoryList([entry({ category: 'Zoo' }), entry({ category: 'Büro' }), entry({ category: 'Zoo' }), entry()]), ['Downloads', 'Dateien', 'Medien', 'Tools', 'Büro', 'Zoo', 'Andere']);
});
test('NAS address: flag is stored only when set and the stored URL stays complete', () => {
  assert.equal('nasHost' in M.clean(entry()), false);
  for (const no of [false, 'true', 1, null]) assert.equal('nasHost' in M.clean(entry({ nasHost: no })), false);
  const on = M.clean(entry({ nasHost: true }));
  assert.equal(on.nasHost, true); assert.equal(on.url, 'http://192.0.2.5:8080/x?y=1');
  assert.deepEqual(M.importData(JSON.stringify({ format: 'docker-apps', version: 1, apps: [on] }))[0], on);
});
test('NAS address: only the host name is swapped when opening', () => {
  const on = M.clean(entry({ nasHost: true })), off = M.clean(entry());
  assert.equal(M.resolveURL(on, 'nas.example'), 'http://nas.example:8080/x?y=1');
  assert.equal(M.resolveURL(on, '[2001:db8::1]'), 'http://[2001:db8::1]:8080/x?y=1');
  assert.equal(M.resolveURL(M.clean(entry({ nasHost: true, url: 'https://old.example/' })), '10.0.0.2'), 'https://10.0.0.2/');
  assert.equal(M.resolveURL(off, 'nas.example'), off.url);
  assert.equal(M.resolveURL(on, ''), on.url);
});
test('ordering: sort modes never change the stored list; move clamps', () => {
  const list = [entry({ id: 'c', name: 'charlie', category: 'Zoo' }), entry({ id: 'a', name: 'Alpha', category: 'Andere' }), entry({ id: 'b', name: 'app 10', category: 'Tools' }), entry({ id: 'd', name: 'app 9', category: 'Tools' })];
  const ids = l => l.map(e => e.id).join('');
  assert.equal(ids(M.sort(list, 'custom')), 'cabd'); assert.equal(ids(M.sort(list, 'unknown')), 'cabd');
  assert.equal(ids(M.sort(list, 'name')), 'adbc');
  assert.equal(ids(M.sort(list, 'category')), 'dbca');
  assert.equal(ids(list), 'cabd');
  assert.equal(ids(M.move(list, 'd', 0)), 'dcab'); assert.equal(ids(M.move(list, 'c', 2)), 'abcd'); assert.equal(ids(M.move(list, 'c', 99)), 'abdc');
  assert.equal(ids(M.move(list, 'a', -5)), 'acbd'); assert.equal(ids(M.move(list, 'missing', 0)), 'cabd'); assert.equal(ids(list), 'cabd');
});
test('container rates: difference per second, null instead of guesses', () => {
  const a = new Map([['x', { rx: 1000, tx: 500, read: null, write: 80 }], ['gone', { rx: 1, tx: 1, read: 1, write: 1 }]]);
  const b = new Map([['x', { rx: 3000, tx: 400, read: 10, write: 80 }], ['new', { rx: 1, tx: 1, read: 1, write: 1 }]]);
  const r = T.rates(a, b, 10);
  assert.deepEqual(r.get('x'), { rx: 200, tx: null, read: null, write: 0 });
  assert.equal(r.has('new'), false); assert.equal(r.has('gone'), false);
  for (const bad of [0, 0.5, 301, NaN, -3]) assert.equal(T.rates(a, b, bad).size, 0);
  assert.equal(T.rates(null, b, 10).size, 0); assert.equal(T.rates(a, undefined, 10).size, 0);
});
test('container matching: a NAS-address link matches by port whatever host is stored', () => {
  const containers = [{ name: 'web', image: '', ports: [{ host: 8080 }] }];
  assert.equal(T.matchContainer({ name: 'n', url: 'http://192.0.2.5:8080/', icon: 'container' }, containers, ['nas.local']), null);
  assert.equal(T.matchContainer({ name: 'n', url: 'http://192.0.2.5:8080/', icon: 'container', nasHost: true }, containers, ['nas.local']).name, 'web');
});
function seed(dsm, folder, revision = 1) { dsm.dirs.add(folder); dsm.files.set(folder + '/apps-' + String(revision).padStart(12, '0') + '.json', { content: JSON.stringify({ format: 'docker-apps-shared', version: 1, revision, nonce: 'n', apps: [] }), mtime: 1 }); }
const writes = dsm => dsm.calls.filter(c => /Upload|CreateFolder|Delete/.test(c.api)).length;
test('locate: keeps the default when it already holds a list', async () => {
  const dsm = new FakeDSM(); seed(dsm, '/docker/Docker APPS'); seed(dsm, '/Apps/Docker APPS');
  assert.equal(await new Store({ fetcher: dsm.fetcher(), getToken: () => '' }).locate(), null); assert.equal(writes(dsm), 0);
});
test('locate: finds the single other share that holds a list, read-only', async () => {
  const dsm = new FakeDSM(); seed(dsm, '/Apps/Docker APPS'); dsm.dirs.add('/homes/Docker APPS'); dsm.files.set('/homes/Docker APPS/notes.txt', { content: 'x', mtime: 1 });
  const store = new Store({ fetcher: dsm.fetcher(), getToken: () => '' });
  assert.equal(await store.locate(), 'Apps'); assert.equal(writes(dsm), 0);
  store.setShare('Apps'); assert.equal((await store.open()).revision, 1); assert.equal(dsm.dirs.has('/docker/Docker APPS'), false);
});
test('locate: no guess between several lists, none found, or a missing default share', async () => {
  let dsm = new FakeDSM(); seed(dsm, '/Apps/Docker APPS'); seed(dsm, '/homes/Docker APPS');
  assert.equal(await new Store({ fetcher: dsm.fetcher(), getToken: () => '' }).locate(), null);
  dsm = new FakeDSM();
  assert.equal(await new Store({ fetcher: dsm.fetcher(), getToken: () => '' }).locate(), null);
  dsm = new FakeDSM({ shares: ['homes', 'Apps'] }); seed(dsm, '/homes/Docker APPS');
  assert.equal(await new Store({ fetcher: dsm.fetcher(), getToken: () => '' }).locate(), 'homes'); assert.equal(writes(dsm), 0);
});
