'use strict';
// End-to-end test of the built UI in headless Chrome against the simulated DSM.
// Usage: ./build.sh && node tests/ui.e2e.js   (needs Playwright + Chrome)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { FakeDSM } = require('./fake-dsm.js');
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(process.env.PLAYWRIGHT_DIR || '/opt/npm-tools/node_modules', 'playwright')); }

const VERSION = fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
const APP = path.join(__dirname, '..', 'build', 'stage', 'app');
const BASE = '/webman/3rdparty/docker-apps/';
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, '..', 'build', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8' };

function serve(dsm) {
  return new Promise(resolve => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/webapi/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const request = new Request('http://localhost' + req.url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) });
        const body = String(req.headers['content-type']).startsWith('multipart/') ? await request.formData() : await request.text();
        const answer = await dsm.fetch(url.pathname, { method: 'POST', body, credentials: 'same-origin', redirect: 'error' });
        res.writeHead(answer.status, Object.fromEntries(answer.headers));
        res.end(Buffer.from(await answer.arrayBuffer()));
        return;
      }
      if (!url.pathname.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
      const file = path.join(APP, decodeURIComponent(url.pathname.slice(BASE.length)));
      if (!file.startsWith(APP) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const app = (n) => ({ id: 'app-' + n, name: 'App ' + n, url: 'http://nas.local:' + (8000 + n) + '/', category: 'Tools', icon: 'container', description: '' });
function seed(dsm, folder, count, appsFor = n => [app(n)]) {
  dsm.dirs.add(folder);
  for (let n = 1; n <= count; n++)
    dsm.files.set(folder + '/apps-' + String(n).padStart(12, '0') + '.json', { content: JSON.stringify({ format: 'docker-apps-shared', version: 1, revision: n, nonce: 'seed' + n, apps: appsFor(n) }), mtime: 1700000000 + n * 3600 });
}

async function run() {
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true }).catch(() => playwright.chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true }));
  const results = [];
  async function scenario(name, fn, { dsm = new FakeDSM(), locale = 'de-DE', scheme = 'light' } = {}) {
    const server = await serve(dsm);
    const context = await browser.newContext({ locale, colorScheme: scheme, viewport: { width: 1100, height: 760 } });
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
    page.on('requestfailed', r => problems.push('requestfailed: ' + r.url()));
    page.on('response', r => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) problems.push('http ' + r.status() + ': ' + r.url()); });
    const origin = 'http://127.0.0.1:' + server.address().port;
    const url = origin + BASE + 'ui/v' + VERSION + '/index.html';
    try {
      await fn({ page, dsm, url, context });
      assert.deepEqual(problems, [], 'keine JS-Fehler');
      results.push(['ok', name]);
    } catch (error) {
      results.push(['FEHLER', name, error.message]);
      await page.screenshot({ path: path.join(SHOTS, 'fail-' + name.replace(/\W+/g, '-') + '.png') }).catch(() => {});
    } finally { await context.close(); server.close(); }
  }
  const status = page => page.locator('#storage-status').textContent();
  const waitStatus = (page, re) => page.waitForFunction(r => new RegExp(r).test(document.getElementById('storage-status').textContent), re.source, { timeout: 10000 });

  await scenario('Erststart, App anlegen, Revision auf NAS', async ({ page, dsm, url }) => {
    await page.goto(url);
    await waitStatus(page, /Gemeinsame Liste auf NAS gespeichert: \/docker\/Docker APPS/);
    assert.match(await page.locator('#storage-path-label').textContent(), /docker\/Docker APPS/);
    await page.click('#add');
    await page.fill('#name', 'Jellyfin');
    await page.fill('#url', 'nas.local:8096');
    await page.click('#app-form button[type=submit]');
    await page.locator('.app-card').first().waitFor();
    assert.equal(await page.locator('.app-card').count(), 1);
    assert.deepEqual(dsm.revisionFiles(), ['apps-000000000001.json', 'apps-000000000002.json']);
  });

  await scenario('Altbestand wird beim Öffnen auf 30 Versionen gekürzt', async ({ page, dsm, url }) => {
    seed(dsm, '/docker/Docker APPS', 120, n => Array.from({ length: n % 5 + 1 }, (_, i) => app(i + 1)));
    await page.goto(url);
    await waitStatus(page, /gespeichert/);
    await page.waitForFunction(() => true);
    for (let i = 0; i < 50 && dsm.revisionFiles().length !== 30; i++) await page.waitForTimeout(100);
    const files = dsm.revisionFiles();
    assert.equal(files.length, 30);
    assert.equal(files.at(-1), 'apps-000000000120.json');
    assert.equal(files[0], 'apps-000000000091.json');
    assert.equal(await page.locator('.app-card').count(), 120 % 5 + 1);
  });

  await scenario('Verlauf anzeigen, Unterschiede, Version wiederherstellen', async ({ page, dsm, url }) => {
    seed(dsm, '/docker/Docker APPS', 3, n => n === 1 ? [] : n === 2 ? [app(1), app(2), app(3)] : [app(1), { ...app(2), name: 'App 2 neu' }]);
    await page.goto(url);
    await waitStatus(page, /gespeichert/);
    assert.equal(await page.locator('.app-card').count(), 2);
    await page.locator('#manage-list > summary').click();await page.click('#show-history');
    await page.locator('#history-list button').nth(2).waitFor();
    const rows = await page.locator('#history-list button').allTextContents();
    assert.equal(rows.length, 3);
    assert.match(rows[0], /Version 3 · aktuell/);
    assert.ok(await page.locator('#history-list button').first().isDisabled(), 'aktuelle Version nicht wählbar');
    assert.ok(await page.locator('#confirm-restore').isDisabled(), 'ohne Auswahl gesperrt');
    assert.match(await page.locator('#history-note').textContent(), /letzten 30 Versionen/);
    await page.locator('#history-list button[data-revision="2"]').click();
    await page.locator('#history-preview h3').first().waitFor();
    const preview = await page.locator('#history-preview').textContent();
    assert.match(preview, /Version 2 enthält 3 Anwendungen\./);
    assert.match(preview, /Kommt zurück \(1\)/);
    assert.match(preview, /Wird geändert \(1\)/);
    assert.doesNotMatch(preview, /Wird entfernt/);
    await page.screenshot({ path: path.join(SHOTS, 'verlauf-hell.png') });
    await page.click('#confirm-restore');
    await page.locator('#history-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.app-card').count(), 3);
    assert.match(await page.locator('#toast-text').textContent(), /Version 2 wurde wiederhergestellt\./);
    assert.equal(dsm.revisionFiles().length, 4, 'neue Revision, nichts überschrieben');
    assert.deepEqual(JSON.parse(dsm.files.get('/docker/Docker APPS/apps-000000000004.json').content).apps.map(a => a.name), ['App 1', 'App 2', 'App 3']);
    // Rückgängig nach Wiederherstellen funktioniert wie bei jeder Änderung
    await page.click('#undo');
    await page.waitForFunction(() => document.querySelectorAll('.app-card').length === 2);
  });

  await scenario('Speicherort wechseln mit Kopie, bleibt nach Neuladen', async ({ page, dsm, url }) => {
    seed(dsm, '/docker/Docker APPS', 1, () => [app(1), app(2)]);
    await page.goto(url);
    await waitStatus(page, /gespeichert/);
    await page.locator('#manage-list > summary').click();await page.click('#storage-location');
    await page.waitForFunction(() => document.querySelectorAll('#location-share option').length === 3);
    assert.deepEqual(await page.locator('#location-share option').allTextContents(), ['Apps', 'docker (Standard)', 'homes']);
    assert.equal(await page.locator('#location-share').inputValue(), 'docker');
    assert.ok(await page.locator('#location-copy-row').isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'speicherort.png') });
    await page.selectOption('#location-share', 'Apps');
    await page.click('#confirm-location');
    await page.locator('#location-dialog').waitFor({ state: 'hidden' });
    await waitStatus(page, /\/Apps\/Docker APPS/);
    assert.match(await page.locator('#storage-path-label').textContent(), /Apps\/Docker APPS/);
    assert.equal(JSON.parse(dsm.files.get('/Apps/Docker APPS/apps-000000000001.json').content).apps.length, 2);
    assert.equal(dsm.revisionFiles().length, 1, 'alter Ort unverändert');
    await page.reload();
    await waitStatus(page, /\/Apps\/Docker APPS/);
    assert.equal(await page.locator('.app-card').count(), 2);
    // zurück auf Standard: vorhandene Liste wird geladen, nicht überschrieben
    await page.locator('#manage-list > summary').click();await page.click('#storage-location');
    await page.waitForFunction(() => document.querySelectorAll('#location-share option').length === 3);
    await page.selectOption('#location-share', 'docker');
    await page.click('#confirm-location');
    await waitStatus(page, /\/docker\/Docker APPS/);
    assert.match(await page.locator('#toast-text').textContent(), /Vorhandene Liste/);
    assert.equal(await page.evaluate(() => localStorage.getItem('docker-apps.share:browser')), null);
  });

  await scenario('Freigabe docker fehlt: Dialog öffnet sich, andere Freigabe wählen', async ({ page, dsm, url }) => {
    await page.goto(url);
    await page.locator('#location-dialog').waitFor({ state: 'visible', timeout: 10000 });
    assert.match(await status(page), /freigegebene Ordner docker fehlt/);
    assert.ok(await page.locator('#show-history').isDisabled());
    assert.ok(await page.locator('#add').isDisabled());
    assert.ok(await page.locator('#location-copy-row').isHidden(), 'keine Kopie ohne Liste');
    await page.waitForFunction(() => document.querySelectorAll('#location-share option').length >= 2);
    await page.selectOption('#location-share', 'Container');
    await page.click('#confirm-location');
    await waitStatus(page, /\/Container\/Docker APPS/);
    assert.ok(!(await page.locator('#add').isDisabled()));
    assert.ok(dsm.files.has('/Container/Docker APPS/apps-000000000001.json'));
  }, { dsm: new FakeDSM({ shares: ['homes', 'Container'] }) });

  await scenario('Englische Oberfläche, dunkles Design', async ({ page, dsm, url }) => {
    seed(dsm, '/docker/Docker APPS', 2, n => n === 1 ? [app(1)] : [app(1), app(2)]);
    await page.goto(url);
    await waitStatus(page, /Shared list saved on NAS/);
    assert.equal(await page.locator('#show-history').textContent(), 'History');
    assert.equal(await page.locator('#storage-location').textContent(), 'Storage location');
    assert.match(await page.locator('#storage-path-label').textContent(), /^Shared application list: docker\/Docker APPS\.$/);
    await page.locator('#manage-list > summary').click();await page.click('#show-history');
    await page.locator('#history-list button[data-revision="1"]').click();
    await page.locator('#history-preview h3').first().waitFor();
    assert.match(await page.locator('#history-preview').textContent(), /Version 1 contains 1 application\..*Will be removed \(1\)/s);
    assert.equal(await page.locator('#confirm-restore').textContent(), 'Restore this version');
    assert.match(await page.locator('#history-note').textContent(), /The last 30 versions are kept/);
    await page.screenshot({ path: path.join(SHOTS, 'history-dark-en.png') });
    await page.click('#close-history');
    await page.locator('#manage-list > summary').click();await page.click('#storage-location');
    assert.match(await page.locator('#location-dialog').textContent(), /Shared folder.*Copy the current list there/s);
  }, { locale: 'en-GB', scheme: 'dark' });

  await scenario('Ohne Delete-API: App funktioniert weiter', async ({ page, dsm, url }) => {
    seed(dsm, '/docker/Docker APPS', 40);
    await page.goto(url);
    await waitStatus(page, /gespeichert/);
    await page.waitForTimeout(500);
    assert.equal(dsm.revisionFiles().length, 40);
    await page.click('#add'); await page.fill('#name', 'X'); await page.fill('#url', 'http://x:1');
    await page.click('#app-form button[type=submit]');
    await page.waitForFunction(() => document.querySelectorAll('.app-card').length === 2);
  }, { dsm: new FakeDSM({ deleteApi: false }) });

  await scenario('Schmales Fenster (DSM-Minimum 620px)', async ({ page, dsm, url }) => {
    seed(dsm, '/docker/Docker APPS', 3, n => [app(1), app(n + 1)]);
    await page.setViewportSize({ width: 620, height: 430 });
    await page.goto(url);
    await waitStatus(page, /gespeichert/);
    await page.locator('#manage-list > summary').click();await page.click('#show-history');
    await page.locator('#history-list button[data-revision="2"]').click();
    await page.locator('#history-preview h3').first().waitFor();
    const box = await page.locator('#history-dialog').boundingBox();
    assert.ok(box.width <= 620 && box.x >= 0, 'Dialog passt ins Fenster');
    assert.ok(await page.locator('#confirm-restore').isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'verlauf-620px.png') });
  });

  await scenario('History Delete: cancel, denied permission, confirm and reload',async({page,dsm,url})=>{
    seed(dsm,'/docker/Docker APPS',3,n=>[app(n)]);
    await page.goto(url);await waitStatus(page,/saved/);await page.locator('#manage-list > summary').click();await page.click('#show-history');
    assert.ok(await page.locator('#delete-history').isDisabled());
    await page.click('#history-list button[data-revision="1"]');await page.locator('#confirm-restore:enabled').waitFor();
    assert.equal(await page.locator('#delete-history').textContent(),'Delete');
    page.once('dialog',dialog=>dialog.dismiss());await page.click('#delete-history');assert.equal(dsm.deleted.length,0);
    dsm.failNext={api:'SYNO.FileStation.Delete',code:119};page.once('dialog',dialog=>dialog.accept());await page.click('#delete-history');
    await page.waitForFunction(()=>document.querySelector('#history-error').textContent.includes('119'));
    assert.equal(dsm.deleted.length,0);assert.equal(dsm.files.size,3);
    page.once('dialog',dialog=>{assert.match(dialog.message(),/version 1.*cannot be undone/s);return dialog.accept();});await page.click('#delete-history');
    await page.locator('#history-list button[data-revision="1"]').waitFor({state:'detached'});
    assert.deepEqual(dsm.deleted,['/docker/Docker APPS/apps-000000000001.json']);
    assert.ok(await page.locator('#history-list button[data-revision="3"]').isDisabled());assert.ok(await page.locator('#delete-history').isDisabled());
    await page.click('#history-list button[data-revision="2"]');await page.locator('#confirm-restore:enabled').waitFor();
    await page.screenshot({path:path.join(SHOTS,'history-delete-en.png')});
    await page.setViewportSize({width:620,height:430});
    for(const id of ['delete-history','confirm-restore']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=620&&box.y+box.height<=430,'Action inside narrow viewport');}
    await page.screenshot({path:path.join(SHOTS,'history-delete-620px.png')});
    await page.reload();await waitStatus(page,/saved/);await page.locator('#manage-list > summary').click();await page.click('#show-history');await page.locator('#history-list button[data-revision="2"]').waitFor();assert.equal(await page.locator('#history-list button').count(),2);
  },{locale:'en-GB'});
  await scenario('History Delete disabled when API unavailable',async({page,dsm,url})=>{
    seed(dsm,'/docker/Docker APPS',2);await page.goto(url);await waitStatus(page,/saved/);await page.locator('#manage-list > summary').click();await page.click('#show-history');await page.click('#history-list button[data-revision="1"]');await page.locator('#confirm-restore:enabled').waitFor();assert.ok(await page.locator('#delete-history').isDisabled());assert.match(await page.locator('#delete-history').getAttribute('title'),/cannot be deleted/);assert.equal(dsm.deleted.length,0);
  },{dsm:new FakeDSM({deleteApi:false}),locale:'en-GB'});
  await scenario('Redesign menus, keyboard, view buttons and edit action',async({page,dsm,url})=>{
    seed(dsm,'/docker/Docker APPS',3,n=>[app(n)]);await page.goto(url);await waitStatus(page,/saved/);
    assert.equal(await page.locator('#manage-list > summary').textContent(),'Manage list');
    assert.equal(await page.locator('#show-history').isVisible(),false);
    await page.locator('#manage-list > summary').click();assert.ok(await page.locator('#show-history').isVisible());
    for(const id of ['storage-location','export','import','scan-containers'])assert.ok(await page.locator('#'+id).isVisible());
    await page.locator('#app-settings > summary').click();assert.equal(await page.locator('#manage-list').getAttribute('open'),null);
    for(const id of ['theme','browse-icons','live-toggle','refresh-monitor'])assert.ok(await page.locator('#'+id).isVisible());
    await page.keyboard.press('Escape');assert.equal(await page.locator('#app-settings').getAttribute('open'),null);assert.ok(await page.locator('#app-settings > summary').evaluate(el=>el===document.activeElement));
    await page.locator('#app-settings > summary').click();await page.selectOption('#theme','dark');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.locator('h1').click();assert.equal(await page.locator('#app-settings').getAttribute('open'),null);
    await page.locator('[data-view-choice="list"]').click();assert.equal(await page.locator('html').getAttribute('data-view'),'list');assert.equal(await page.locator('#tile-size').isVisible(),false);
    await page.locator('[data-view-choice="icons"]').click();assert.equal(await page.locator('[data-view-choice="icons"]').getAttribute('aria-pressed'),'true');await page.reload();await waitStatus(page,/saved/);assert.equal(await page.locator('html').getAttribute('data-view'),'icons');
    await page.locator('[data-view-choice="tiles"]').click();assert.ok(await page.locator('#tile-size').isVisible());await page.locator('.edit').first().click();await page.locator('#editor').waitFor();assert.equal(await page.locator('#name').inputValue(),'App 3');await page.click('#cancel');
    await page.setViewportSize({width:620,height:430});await page.locator('#manage-list > summary').click();const box=await page.locator('#manage-list .menu-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=620&&box.y>=0&&box.y+box.height<=430);await page.keyboard.press('Escape');
    dsm.failNext={api:'SYNO.FileStation.Download',code:119};await page.locator('#app-settings > summary').click();await page.click('#refresh-monitor');await page.waitForFunction(()=>document.querySelector('html').dataset.storageState==='error');assert.match(await page.locator('#connection-label').textContent(),/119/);assert.ok(await page.locator('#connection-label').isVisible());
  },{locale:'en-GB'});
  for(const scheme of ['light','dark'])await scenario('Polished menu controls and license disclosure '+scheme,async({page,dsm,url})=>{
    seed(dsm,'/docker/Docker APPS',2);await page.goto(url);await waitStatus(page,/saved/);
    const simpleIcon=await page.locator('.app-icon.icon-container').first().evaluate(el=>({bg:getComputedStyle(el).backgroundColor,stroke:getComputedStyle(el.querySelector('svg')).stroke}));assert.notEqual(simpleIcon.bg,'rgba(0, 0, 0, 0)','Simple white glyph needs its colored background');
    await page.locator('#manage-list > summary').click();assert.equal(await page.locator('#manage-list .menu-section:visible').count(),2);for(const id of ['scan-containers','show-history','storage-location','export','import'])assert.equal(await page.locator('#'+id+' svg').count(),1);
    await page.screenshot({path:path.join(SHOTS,'menu-manage-'+scheme+'.png')});
    await page.locator('#app-settings > summary').click();
    for(const choice of ['dark','light','auto']){await page.locator('[data-theme-choice="'+choice+'"]').click();assert.equal(await page.locator('#theme').inputValue(),choice);assert.equal(await page.locator('[data-theme-choice="'+choice+'"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#app-settings').getAttribute('open'),'');}
    await page.locator('#live-toggle').check();assert.equal(await page.locator('#live-toggle').getAttribute('role'),'switch');await page.locator('#live-toggle').uncheck();
    assert.equal(await page.locator('#menu-storage-path').textContent(),'/docker/Docker APPS');assert.equal(await page.locator('#storage-status').isVisible(),true);assert.equal(await page.locator('.icon-credit').isVisible(),false);
    await page.locator('#app-licenses > summary').click();assert.ok(await page.locator('.icon-credit').isVisible());await page.locator('#app-licenses > summary').click();
    await page.screenshot({path:path.join(SHOTS,'menu-settings-'+scheme+'.png')});
    await page.setViewportSize({width:620,height:430});const box=await page.locator('#app-settings .menu-panel').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=620&&box.y>=0&&box.y+box.height<=430);await page.locator('#app-licenses > summary').scrollIntoViewIfNeeded();await page.locator('#app-licenses > summary').click();await page.locator('.icon-credit').scrollIntoViewIfNeeded();const credit=await page.locator('.icon-credit').boundingBox();assert.ok(credit.y>=box.y&&credit.y+credit.height<=box.y+box.height,'License link reachable inside scroll panel');await page.screenshot({path:path.join(SHOTS,'menu-settings-'+scheme+'-620px.png')});
    await page.reload();await waitStatus(page,/saved/);assert.equal(await page.locator('#theme').inputValue(),'auto');assert.equal(await page.locator('#live-toggle').isChecked(),false);
  },{locale:'en-GB',scheme});
  await scenario('Backup export and file-picker import preserve entries and reject malformed data',async({page,dsm,url})=>{
    seed(dsm,'/docker/Docker APPS',2,()=>[app(1)]);await page.goto(url);await waitStatus(page,/saved/);await page.locator('#manage-list > summary').click();const [download]=await Promise.all([page.waitForEvent('download'),page.click('#export')]);const data=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(data.format,'docker-apps');assert.equal(data.apps[0].name,'App 1');
    async function importFile(content){await page.locator('#manage-list > summary').click();const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.click('#import')]);await chooser.setFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(content)});}
    const backup=JSON.stringify({format:'docker-apps',version:1,apps:[app(2)]});await importFile(backup);await page.waitForFunction(()=>document.querySelectorAll('.app-card').length===2);await waitStatus(page,/saved/);assert.equal(dsm.revisionFiles().length,3);
    await importFile(backup);await page.waitForFunction(()=>document.querySelector('#toast-text').textContent.includes('backup'));for(let i=0;i<30&&dsm.revisionFiles().length<4;i++)await page.waitForTimeout(50);assert.equal(await page.locator('.app-card').count(),2);assert.equal(dsm.revisionFiles().length,4);
    const before=JSON.stringify([...dsm.files]);await importFile('{bad json');await page.locator('#toast-text').filter({hasText:/valid JSON/}).waitFor();assert.equal(JSON.stringify([...dsm.files]),before);
  },{locale:'en-GB'});
  class ImportDSM extends FakeDSM{
    apiInfo(){return {...super.apiInfo(),'SYNO.Core.Network.Interface':{path:'entry.cgi',minVersion:1,maxVersion:1}};}
    async fetch(url,opts){const p=Object.fromEntries(new URLSearchParams(String(opts.body)));if(p.api==='SYNO.Core.Network.Interface')return this.ok({interfaces:[{name:'eth0',ip:'192.0.2.10'}]});if(p.api==='SYNO.Docker.Container')return this.ok({containers:[{name:'RunningApp',status:'running',image:'demo/app',port_bindings:[{host_port:8080,container_port:80}],environment:{TOKEN:'SIMULATED_SECRET'}},{name:'StoppedApp',status:'stopped',image:'demo/app2',port_bindings:[{host_port:9090,container_port:80}]}]});return super.fetch(url,opts);}
  }
  await scenario('Container import running and stopped preview, cancel, save and duplicate matching',async({page,dsm,url})=>{
    await page.goto(url);await waitStatus(page,/saved/);
    async function scan(){await page.locator('#manage-list > summary').click();await page.click('#scan-containers');await page.locator('#container-results [data-check]').first().waitFor();}
    await scan();assert.equal(await page.locator('#container-results [data-check]').count(),1);assert.equal(await page.locator('#container-results [data-url]').inputValue(),'http://192.0.2.10:8080/');await page.click('#cancel-container-import');assert.equal(dsm.revisionFiles().length,1);
    await scan();await page.locator('#include-stopped').check();await page.waitForFunction(()=>document.querySelectorAll('#container-results [data-check]').length===2);await page.click('#confirm-container-import');await page.locator('#container-import').waitFor({state:'hidden'});assert.equal(await page.locator('.app-card').count(),2);assert.equal(dsm.revisionFiles().length,2);const saved=dsm.files.get('/docker/Docker APPS/apps-000000000002.json').content;assert.doesNotMatch(saved,/SIMULATED_SECRET|environment|TOKEN/);
    await scan();await page.click('#confirm-container-import');await page.locator('#container-import').waitFor({state:'hidden'});assert.equal(await page.locator('.app-card').count(),2);assert.equal(dsm.revisionFiles().length,3);
  },{locale:'en-GB',dsm:new ImportDSM()});
  // ---- 1.6.0 ----
  await scenario('1.6: own category, NAS address, position, sorting and drag and drop', async ({ page, dsm, url }) => {
    await page.goto(url); await waitStatus(page, /Gemeinsame Liste auf NAS gespeichert/);
    async function add(name, address, extra = async () => {}) {
      const before = await page.locator('.app-card').count();
      await page.click('#add'); await page.fill('#name', name); await page.fill('#url', address); await extra();
      await page.click('#app-form button[type=submit]'); await page.locator('#editor').waitFor({ state: 'hidden' });
      await page.waitForFunction(n => document.querySelectorAll('.app-card').length === n + 1, before);
    }
    const names = () => page.locator('.app-card').evaluateAll(cards => cards.map(c => c.dataset.appName));
    await add('Zeta', 'http://192.0.2.50:8123/app', async () => {
      assert.equal(await page.locator('#new-category').isHidden(), true);
      await page.selectOption('#edit-category', { label: 'Neue Kategorie …' });
      assert.equal(await page.locator('#new-category').isVisible(), true);
      await page.fill('#new-category', '  Smart   Home ');
      await page.check('#nas-host');
    });
    const card = page.locator('.app-card').first();
    assert.equal(await card.locator('.card-main').getAttribute('href'), 'http://127.0.0.1:8123/app');
    assert.equal(await card.locator('.open').getAttribute('href'), 'http://127.0.0.1:8123/app');
    assert.equal(await card.locator('.app-category').textContent(), 'Smart Home');
    const latest = () => JSON.parse(dsm.files.get('/docker/Docker APPS/' + dsm.revisionFiles().at(-1)).content).apps;
    assert.equal(latest()[0].url, 'http://192.0.2.50:8123/app'); assert.equal(latest()[0].nasHost, true); assert.equal(latest()[0].category, 'Smart Home');
    assert.deepEqual(await page.locator('#category option').allTextContents(), ['Alle Kategorien', 'Downloads', 'Dateien', 'Medien', 'Tools', 'Smart Home', 'Andere']);
    // Position 1 puts a new entry in front; an entry without the option keeps its address.
    await add('Alpha', 'http://192.0.2.51:9000/', async () => { await page.fill('#position', '1'); });
    await add('Mitte', 'http://192.0.2.52:9001/');
    assert.deepEqual(await names(), ['Alpha', 'Zeta', 'Mitte']);
    assert.equal(await page.locator('.app-card').first().locator('.card-main').getAttribute('href'), 'http://192.0.2.51:9000/');
    assert.equal('nasHost' in latest()[0], false);
    // The editor offers the existing own category again and keeps it on save.
    await page.locator('.app-card').nth(1).locator('.edit').click();
    assert.equal(await page.locator('#edit-category').inputValue(), 'Smart Home'); assert.equal(await page.locator('#nas-host').isChecked(), true); assert.equal(await page.locator('#position').inputValue(), '2');
    await page.click('#cancel');
    // Sorting is a view setting: it survives a reload and does not write to the NAS.
    const files = dsm.revisionFiles().length;
    await page.selectOption('#sort-mode', 'name'); assert.deepEqual(await names(), ['Alpha', 'Mitte', 'Zeta']);
    assert.equal(await page.locator('.app-card[draggable=true]').count(), 0);
    await page.selectOption('#sort-mode', 'category'); assert.deepEqual(await names(), ['Zeta', 'Alpha', 'Mitte']);
    await page.reload(); await waitStatus(page, /Gemeinsame Liste auf NAS gespeichert/); assert.equal(await page.locator('#sort-mode').inputValue(), 'category'); assert.deepEqual(await names(), ['Zeta', 'Alpha', 'Mitte']);
    await page.selectOption('#sort-mode', 'custom'); assert.deepEqual(await names(), ['Alpha', 'Zeta', 'Mitte']); assert.equal(dsm.revisionFiles().length, files);
    // Filtering switches dragging off, so a partial view can never reorder the full list.
    await page.fill('#search', 'a'); assert.equal(await page.locator('.app-card[draggable=true]').count(), 0); await page.fill('#search', '');
    assert.equal(await page.locator('.app-card[draggable=true]').count(), 3);
    await page.locator('.app-card').nth(2).locator('.app-name').dragTo(page.locator('.app-card').nth(0).locator('.app-name'));
    await page.waitForFunction(() => document.querySelector('.app-card')?.dataset.appName === 'Mitte');
    assert.deepEqual(await names(), ['Mitte', 'Alpha', 'Zeta']); assert.deepEqual(latest().map(a => a.name), ['Mitte', 'Alpha', 'Zeta']);
    await page.click('#undo'); await page.waitForFunction(() => document.querySelector('.app-card')?.dataset.appName === 'Alpha'); assert.deepEqual(await names(), ['Alpha', 'Zeta', 'Mitte']);
    await page.screenshot({ path: path.join(SHOTS, '1.6-categories-order.png') });
  });
  await scenario('1.6: English labels for the new controls', async ({ page, url }) => {
    await page.goto(url); await waitStatus(page, /saved/);
    assert.deepEqual(await page.locator('#sort-mode option').allTextContents(), ['Custom order', 'By name', 'By category']);
    await page.click('#add');
    assert.match(await page.locator('#editor').textContent(), /Always use the current NAS address/); assert.match(await page.locator('#editor').textContent(), /Position in the list/);
    assert.ok((await page.locator('#edit-category option').allTextContents()).includes('New category …'));
    await page.selectOption('#edit-category', { label: 'New category …' }); await page.screenshot({ path: path.join(SHOTS, '1.6-editor-en.png') }); await page.fill('#name', 'X'); await page.fill('#url', 'nas.local:1');
    await page.click('#app-form button[type=submit]');
    assert.equal(await page.locator('#form-error').textContent(), 'Please enter a name for the new category.'); assert.equal(await page.locator('.app-card').count(), 0);
  }, { locale: 'en-GB' });
  {
    const dsm = new FakeDSM(); seed(dsm, '/Apps/Docker APPS', 2);
    await scenario('1.6: a list in another shared folder is found without a saved location', async ({ page, dsm, url }) => {
      await page.goto(url); await waitStatus(page, /Gemeinsame Liste auf NAS gespeichert: \/Apps\/Docker APPS/);
      assert.equal(await page.locator('.app-card').count(), 1);
      assert.equal(dsm.dirs.has('/docker/Docker APPS'), false, 'nothing is created in the default folder');
      assert.deepEqual(dsm.revisionFiles('/Apps/Docker APPS'), ['apps-000000000001.json', 'apps-000000000002.json']);
      await page.reload(); await waitStatus(page, /\/Apps\/Docker APPS/); assert.equal(await page.locator('.app-card').count(), 1);
    }, { dsm });
  }
  {
    const dsm = new FakeDSM(); seed(dsm, '/Apps/Docker APPS', 1); seed(dsm, '/homes/Docker APPS', 1);
    await scenario('1.6: two candidate lists are not guessed between', async ({ page, dsm, url }) => {
      await page.goto(url); await waitStatus(page, /Gemeinsame Liste auf NAS gespeichert: \/docker\/Docker APPS/);
      assert.equal(await page.locator('.app-card').count(), 0);
    }, { dsm });
  }
  class RateDSM extends FakeDSM {
    constructor() { super(); this.tick = 0; seed(this, '/docker/Docker APPS', 1, () => [{ id: 'a', name: 'Busy', url: 'http://nas.local:8080/', category: 'Tools', icon: 'container', description: '', containerName: 'busy' }]); }
    apiInfo() { return { ...super.apiInfo(), 'SYNO.Docker.Container.Resource': { path: 'entry.cgi', minVersion: 1, maxVersion: 1 } }; }
    async fetch(url, opts) {
      const p = Object.fromEntries(new URLSearchParams(String(opts.body)));
      if (p.api === 'SYNO.Docker.Container' && p.method === 'stats') { const n = ++this.tick; return this.ok({ abc: { name: '/busy', networks: { eth0: { rx_bytes: n * 1048576, tx_bytes: n * 2048 } }, blkio_stats: { io_service_bytes_recursive: [{ op: 'Read', value: n * 4096 }, { op: 'Write', value: 500 }] } } }); }
      if (p.api === 'SYNO.Docker.Container') return this.ok({ containers: [{ id: 'abc', name: 'busy', status: 'running', image: 'demo/busy', port_bindings: [{ host_port: 8080, container_port: 80 }] }] });
      if (p.api === 'SYNO.Docker.Container.Resource') return this.ok({ resources: [{ name: 'busy', cpu: 3, memory: 1048576, memoryPercent: 1 }] });
      if (p.api === 'SYNO.Core.System.Utilization') return this.ok({ cpu: { user_load: 1, system_load: 1, other_load: 0 }, memory: { real_usage: 9, total_real: 1000 }, network: [{ device: 'total', rx: 10, tx: 20 }] });
      return super.fetch(url, opts);
    }
  }
  await scenario('1.6: container network and disk rates appear in the details window', async ({ page, url }) => {
    await page.goto(url); await waitStatus(page, /Gemeinsame Liste auf NAS gespeichert/);
    await page.click('#app-settings > summary'); await page.locator('#live-toggle').check(); await page.keyboard.press('Escape');
    await page.locator('.app-card .status-label.running').waitFor();
    assert.equal(await page.locator('.app-card .io-rates').isVisible(), false, 'tiles stay as compact as before');
    await page.click('[data-view-choice=icons]'); await page.locator('.app-card .card-main').click(); await page.locator('#app-details').waitFor();
    assert.match(await page.locator('#details-metrics .io-rates').textContent(), /Netzwerk↓ — · ↑ —Datenträger/);
    await page.locator('#app-details .close').click();
    await page.waitForTimeout(1300);
    await page.click('#app-settings > summary'); await page.click('#refresh-monitor');
    await page.waitForFunction(() => /KiB\/s|MiB\/s/.test(document.querySelector('.app-card .io-rates')?.textContent || ''), null, { timeout: 8000 });
    await page.locator('.app-card .card-main').click();
    const text = await page.locator('#details-metrics .io-rates').textContent();
    assert.match(text, /↓ [\d.,]+ (KiB|MiB)\/s · ↑ [\d.,]+ (B|KiB)\/s/); assert.match(text, /Lesen [\d.,]+ (B|KiB)\/s · Schreiben 0 B\/s/);
    await page.screenshot({ path: path.join(SHOTS, '1.6-container-rates.png') });
  }, { dsm: new RateDSM() });
  await browser.close();
  for (const r of results) console.log(r.join(' | '));
  const failed = results.filter(r => r[0] !== 'ok').length;
  console.log(`\n${results.length - failed}/${results.length} Szenarien bestanden`);
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
