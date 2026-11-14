'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const UI = path.join(__dirname, '..', 'src', 'app', 'ui');
const I = require(path.join(UI, 'i18n.js'));
const M = require(path.join(UI, 'model.js'));
const sources = ['layout.js','app.js', 'monitor.js', 'views.js', 'model.js', 'monitor-model.js', 'dsm-readonly.js', 'nas-store.js']
  .map(f => fs.readFileSync(path.join(UI, f), 'utf8')).join('\n');
const dictionary = (() => { const src = fs.readFileSync(path.join(UI, 'i18n.js'), 'utf8'); return JSON.parse(src.match(/const english=(\{.*?\});/s)[1]); })();

function strings(re) { const out = new Set(); for (const m of sources.matchAll(re)) out.add(m[1]); return [...out]; }

test('Node-Tests laufen auf Englisch', () => assert.equal(I.language, 'en'));

test('jeder I.t()-/fmt()-/group()-Text hat eine englische Übersetzung', () => {
  const keys = [
    ...strings(/I\.t\('([^']+)'\)/g),
    ...strings(/fmt\((?:[^'()]*\?)?'([^']+)'/g),
    ...strings(/fmt\([^'()]*\?'[^']+':'([^']+)'/g),
    ...strings(/group\('([^']+)'/g),
    ...strings(/I\.t\([a-zA-Z.]+\?'([^']+)':'[^']+'\)/g),
    ...strings(/I\.t\([a-zA-Z.]+\?'[^']+':'([^']+)'\)/g),
  ];
  const missing = keys.filter(k => !Object.hasOwn(dictionary, k));
  assert.deepEqual(missing, []);
  assert.ok(keys.length > 40);
});

test('Platzhalter {n}/{count}/{name} bleiben in der Übersetzung erhalten', () => {
  for (const [de, en] of Object.entries(dictionary)) {
    const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
    assert.equal(ph(en), ph(de), de);
  }
});

test('neue Wörter verändern keine bestehenden literal()-Texte (Regression gegen 1.4.5)', () => {
  const original = path.join(__dirname, 'fixtures', 'i18n-1.4.5.js');
  const sandbox = { module: { exports: {} }, globalThis: {} };
  vm.runInNewContext(fs.readFileSync(original, 'utf8'), sandbox);
  const Old = sandbox.module.exports;
  const literals = strings(/I\.literal\('([^']+)'\)/g);
  assert.ok(literals.length > 50, 'genug Texte gefunden: ' + literals.length);
  for (const text of literals) assert.equal(I.literal(text), Old.literal(text), text);
});

test('statische HTML-Texte der neuen Dialoge sind übersetzbar', () => {
  const html = fs.readFileSync(path.join(UI, 'index.html'), 'utf8');
  const block = html.slice(html.indexOf('<dialog id="history-dialog"'), html.indexOf('<input id="import-file"'));
  const texts = [...block.matchAll(/>([^<>]+)</g)].map(m => m[1].trim()).filter(t => t && t !== '×');
  const attrs = [...html.matchAll(/(?:title|aria-label)="([^"]+)"/g)].map(m => m[1]).filter(t => /Verlauf|Speicherort|Versionen|Ordner/.test(t));
  const missing = [...texts, ...attrs].filter(t => !Object.hasOwn(dictionary, t));
  assert.deepEqual(missing, []);
});

test('Modell: nur http/https, keine Zugangsdaten in URLs', () => {
  assert.equal(M.normalizeURL('nas.local:8080'), 'http://nas.local:8080/');
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'http://user:pw@nas', 'ftp://x', ' ', 'http://a b'])
    assert.throws(() => M.normalizeURL(bad), undefined, bad);
});

test('Modell: höchstens 250 Einträge, doppelte IDs werden eindeutig', () => {
  assert.throws(() => M.validate(Array.from({ length: 251 }, (_, i) => ({ name: 'a' + i, url: 'http://x' }))));
  const v = M.validate([{ id: 'x', name: 'A', url: 'http://a' }, { id: 'x', name: 'B', url: 'http://b' }]);
  assert.notEqual(v[0].id, v[1].id);
});

test('Modell: escape() verhindert HTML-Einschleusung', () => {
  assert.equal(M.escape('<img src=x onerror="a">\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;');
});
