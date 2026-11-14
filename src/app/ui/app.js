(function(){
  'use strict';
  const I=DockerAppsI18n;
  const nasStore=new DockerAppsNAS.Store();
  let nasRevision=0,nasReady=false,saving=false,refreshing=false,nasTimer=null,storageActive=true;
  const M=DockerAppsModel,$=id=>document.getElementById(id),e=M.escape;
  let account='browser';for(const win of [window.parent,window.top])try{const name=typeof win._S==='function'&&win._S('username');if(typeof name==='string'&&name){account=name;break;}}catch(error){}
  const shareKey='docker-apps.share:'+account;try{const savedShare=localStorage.getItem(shareKey);if(savedShare&&DockerAppsNAS.validShare(savedShare))nasStore.setShare(savedShare);}catch(error){}
  let pruned=false,noShareShown=false,historySelected=null,historyRows=[],historyRequest=0;
  const key='docker-apps.links.empty.v1:'+account,themeKey='docker-apps.theme:'+account,backupKey=key+':previous',sizeKey='docker-apps.tile-size:'+account,sortKey='docker-apps.sort:'+account;
  let sortMode='custom',located=false,dragId=null;try{const savedSort=localStorage.getItem(sortKey);if(['custom','name','category'].includes(savedSort))sortMode=savedSort;}catch(error){}
  let apps,previous=null,editingId=null,loadError='',iconLimit=96,iconSearchTimer=null;
  try{const saved=localStorage.getItem(key);apps=saved?M.validate(JSON.parse(saved)):M.validate(M.defaults);const old=localStorage.getItem(backupKey);if(old)previous=M.validate(JSON.parse(old));}catch(error){apps=M.validate(M.defaults);loadError=I.literal('Gespeicherte Links konnten nicht gelesen werden. Die Liste bleibt zunächst leer.');}
  const legacyApps=apps.map(x=>({...x}));previous=null;
  const symbols={jd:'<path d="M12 3v12m-5-5 5 5 5-5M5 18v3h14v-3"/>',filezilla:'<path d="M6 20V4h11M6 11h9M15 16h6l-6 5h6"/>',filebot:'<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M12 3v3M8 17h8M2 11h2m16 0h2"/><circle cx="8.5" cy="11" r=".9"/><circle cx="15.5" cy="11" r=".9"/>',container:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',terminal:'<path d="m5 6 6 6-6 6m9 0h6"/>',media:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',cloud:'<path d="M6 18a5 5 0 010-10 6 6 0 0111-1 5.5 5.5 0 011 11ZM12 10v7m-3-3 3 3 3-3"/>',tools:'<path d="m14 5 5 5M4 20l10-10m2-7a6 6 0 00-6 8l-7 7a2 2 0 003 3l7-7a6 6 0 008-6l-4 3-4-4Z"/>'};
  function icon(kind){const original=M.catalogIcon(kind);if(original)return '<div class="app-icon catalog-logo"><img src="icons/'+encodeURIComponent(original.file)+'" alt="" loading="lazy" decoding="async" width="44" height="44"></div>';const safe=M.icons.includes(kind)?kind:'container';return '<div class="app-icon icon-'+safe+'"><svg viewBox="0 0 24 24" aria-hidden="true">'+symbols[safe]+'</svg></div>';}
  const simpleIcons=[{id:'container',name:I.literal('Container (einfach)')},{id:'terminal',name:I.literal('Terminal (einfach)')},{id:'media',name:I.literal('Medien (einfach)')},{id:'cloud',name:I.literal('Cloud (einfach)')},{id:'tools',name:I.literal('Werkzeuge (einfach)')}];
  function syncIcon(){const value=$('icon').value,item=M.catalogIcon(value),simple=simpleIcons.find(i=>i.id===value);$('selected-icon-preview').innerHTML=icon(value);$('selected-icon-name').textContent=item?.name||simple?.name||'Container';}
  function renderIconPicker(reset=false){
    const query=$('icon-search').value,group=$('icon-group').value,items=M.findIcons(query,group).map(item=>({id:'catalog:'+item.id,name:item.name}));
    if(!group)items.unshift(...simpleIcons.filter(item=>!query||item.name.toLowerCase().includes(query.toLowerCase())));
    const current=$('icon').value,scroll=reset?0:$('icon-results').scrollTop;
    $('icon-results').innerHTML=items.slice(0,iconLimit).map(item=>'<button type="button" class="icon-option '+(item.id===current?'is-selected':'')+'" data-pick="'+e(item.id)+'" aria-label="'+e(item.name)+'" title="'+e(item.name)+'">'+icon(item.id)+'<span>'+e(item.name)+'</span></button>').join('')||I.literal('<p class="no-icons">Kein passendes Icon gefunden.</p>');
    $('icon-count').textContent=Math.min(iconLimit,items.length)+I.literal(' von ')+items.length.toLocaleString(I.locale)+' Icons';$('more-icons').hidden=iconLimit>=items.length;$('icon-results').scrollTop=scroll;
  }
  function openIconPicker(){iconLimit=96;$('icon-search').value='';$('icon-group').value='';renderIconPicker(true);$('icon-picker').showModal();$('icon-search').focus();}
  function toast(message,allowUndo=false){$('toast-text').textContent=message;$('undo').hidden=!allowUndo||!previous;$('toast').hidden=false;}
  function storageStatus(message){$('storage-status').textContent=message;}
  function lockControls(){for(const button of document.querySelectorAll('#add,#browse-icons,#import,#delete,#undo,.edit,#app-form button[type="submit"]'))button.disabled=saving||!nasReady;$('confirm-migration').disabled=saving;$('migrate-browser').disabled=saving||!nasReady;$('show-history').disabled=saving||!nasReady;$('storage-location').disabled=saving;$('confirm-restore').disabled=saving||!historySelected;$('confirm-location').disabled=saving;$('delete-history').disabled=saving||!historySelected||historySelected.revision>=historyRows[0]?.revision||!nasStore.canDeleteHistory;$('delete-history').title=I.t(nasStore.canDeleteHistory?'Ausgewählte alte Version dauerhaft löschen.':'Alte Versionen können nicht gelöscht werden.');for(const b of $('history-list').querySelectorAll('button'))b.disabled=saving||Number(b.dataset.revision)===historyRows[0]?.revision;}
  function migrationEntries(){const next=apps.map(x=>({...x}));for(const item of legacyApps){if(next.some(x=>x.url===item.url))continue;const entry={...item};if(next.some(x=>x.id===entry.id))delete entry.id;next.push(M.clean(entry));}return M.validate(next);}
  function migrationButton(){$('migrate-browser').hidden=!legacyApps.length||(nasReady&&!legacyApps.some(x=>!apps.some(y=>y.url===x.url)));$('migrate-browser').textContent=I.t('Lokale Einträge hinzufügen');}
  async function refreshShared(force=false){
    if(!force&&(!storageActive||document.hidden))return;
    if(refreshing||saving||(!force&&[...document.querySelectorAll('dialog')].some(d=>d.open))){clearTimeout(nasTimer);if(!document.hidden&&storageActive)nasTimer=setTimeout(()=>refreshShared(),20000);return;}refreshing=true;
    try{if(!located){located=true;if(!nasStore.preferredShare){try{const found=await nasStore.locate();if(found){nasStore.setShare(found);try{localStorage.setItem(shareKey,found);}catch(error){}footerPath();}}catch(error){/* Not finding a list is not an error; the default location is used. */}}}
      const state=await nasStore.open();if(state.revision!==nasRevision||!nasReady){apps=state.revision?state.apps:legacyApps.map(x=>({...x}));nasRevision=state.revision;nasReady=state.revision>0;previous=null;render();}storageStatus(I.t(nasReady?'Gemeinsame Liste auf NAS gespeichert: ':'Noch nicht auf NAS übernommen: ')+storagePath());migrationButton();if(nasReady&&!pruned){pruned=true;cleanup();}}
    catch(error){storageStatus(I.t('NAS-Speicher nicht verfügbar: ')+error.message);if(force)toast(error.message);if(error.code==='no-share'&&!noShareShown&&![...document.querySelectorAll('dialog')].some(d=>d.open)){noShareShown=true;openLocation();}}
    finally{refreshing=false;lockControls();clearTimeout(nasTimer);if(!document.hidden&&storageActive)nasTimer=setTimeout(()=>refreshShared(),20000);}
  }
  async function commit(next,message,initialize=false){
    if(saving){toast(I.t('Eine Speicherung läuft bereits.'));return false;}
    if(!nasReady&&!initialize){toast(I.t('Bitte zuerst die gemeinsame NAS-Liste einrichten.'));return false;}
    const cleaned=M.validate(next),old=apps.map(app=>({...app}));saving=true;lockControls();storageStatus(I.t('Wird auf NAS gespeichert …'));
    try{const state=await nasStore.save(cleaned,nasRevision);previous=old;apps=state.apps;nasRevision=state.revision;nasReady=true;render();migrationButton();storageStatus(I.t('Gemeinsame Liste auf NAS gespeichert: ')+storagePath());toast(message,true);cleanup();return true;}
    catch(error){storageStatus(I.t('Nicht auf NAS gespeichert: ')+error.message);toast(error.message);for(const [dialog,target]of [['editor','form-error'],['container-import','container-import-error'],['migration-dialog','migration-error']])if($(dialog).open){$(target).textContent=error.message;$(target).hidden=false;}if(error.code==='conflict'){try{const state=await nasStore.load();apps=state.apps;nasRevision=state.revision;nasReady=state.revision>0;previous=null;render();}catch(readError){storageStatus(I.t('NAS-Speicher nicht verfügbar: ')+readError.message);}}return false;}
    finally{saving=false;lockControls();}
  }
  async function undo(){if(!previous)return;const restore=previous.map(app=>({...app}));if(await commit(restore,I.literal('Die vorherige Version wurde wiederhergestellt.')))$('undo').hidden=true;}

  function render(){
    syncCategories();
    const visible=M.sort(M.filter(apps,$('search').value,$('category').value),sortMode),movable=canReorder();
    $('app-count').textContent=visible.length===apps.length?apps.length+(apps.length===1?I.literal(' Anwendung'):I.literal(' Anwendungen')):visible.length+I.literal(' von ')+apps.length+I.literal(' Anwendungen');
    $('grid').innerHTML=visible.map(app=>{
      const target=M.resolveURL(app,location.hostname),address=new URL(target),display=address.host+(address.pathname==='/'?'':address.pathname);
      return '<article class="app-card" data-app-id="'+e(app.id)+'" data-container-name="'+e(app.containerName||'')+'" data-app-name="'+e(app.name)+'" data-app-url="'+e(target)+'" data-nas-host="'+(app.nasHost?'true':'')+'" data-app-icon="'+e(app.icon)+'"'+(movable?' draggable="true"':'')+'><span class="app-category">'+e(I.t(app.category))+'</span><a class="card-main" href="'+e(target)+'" target="_blank" rel="noopener noreferrer" aria-label="'+e(app.name+' · '+I.t('Öffnen'))+'">'+icon(app.icon)+'<h2 class="app-name">'+e(app.name)+'</h2><div class="app-description">'+e(app.description||I.literal('Weboberfläche öffnen'))+'</div><div class="app-address" title="'+e(target)+'">'+e(display)+'</div></a><div class="card-footer"><button class="edit" data-edit="'+e(app.id)+'" aria-label="'+e(app.name+' · '+I.t('Bearbeiten'))+I.literal('">Bearbeiten</button><a class="open" href="')+e(target)+I.literal('" target="_blank" rel="noopener noreferrer">Öffnen ↗</a></div></article>');
    }).join('');
    lockControls();document.dispatchEvent(new Event('docker-apps:render'));
    $('empty').hidden=visible.length>0;$('empty-text').textContent=apps.length?I.literal('Ändere den Filter oder füge eine Anwendung hinzu.'):I.literal('Füge deine erste Container-Anwendung mit ihrer Browseradresse hinzu.');
  }
  function editor(id){
    const app=apps.find(app=>app.id===id);editingId=app?app.id:null;
    $('editor-title').textContent=app?I.literal('Anwendung bearbeiten'):I.literal('Anwendung hinzufügen');
    $('name').value=app?.name||'';$('url').value=app?.url||'';$('nas-host').checked=!!app?.nasHost;fillEditCategories(app?.category||'Andere');const place=app?apps.findIndex(x=>x.id===app.id)+1:apps.length+1;$('position').max=String(app?apps.length:apps.length+1);$('position').value=String(place);$('icon').value=app?.icon||'container';$('description').value=app?.description||'';
    const bound=app?.containerName||'',select=$('edit-container');if(bound&&!Array.from(select.options).some(o=>o.value===bound))select.add(new Option(bound,bound));select.value=bound;
    syncIcon();
    $('delete').hidden=!app;$('form-error').hidden=true;$('editor').showModal();$('name').focus();
  }
  function closeEditor(){$('editor').close();}
  function applySize(){let size='small';try{const saved=localStorage.getItem(sizeKey);if(['ultra-small','very-small','small','medium','large'].includes(saved))size=saved;}catch(error){}document.documentElement.dataset.tileSize=size;$('tile-size').value=size;}
  $('tile-size').addEventListener('change',event=>{const size=event.target.value;if(!['ultra-small','very-small','small','medium','large'].includes(size))return;document.documentElement.dataset.tileSize=size;try{localStorage.setItem(sizeKey,size);}catch(error){toast(I.literal('Die Kachelgröße konnte in diesem Browser nicht gespeichert werden.'));}});
  function themePreference(){try{return localStorage.getItem(themeKey)||'auto';}catch(error){return 'auto';}}
  function resolveTheme(preference){
    if(['light','dark'].includes(preference))return preference;
    try{if(window.parent!==window){const doc=window.parent.document,mark=(doc.documentElement.className+' '+(doc.body?.className||'')).toLowerCase(),attribute=doc.documentElement.getAttribute('data-theme');if(attribute==='dark'||/(^|[\s_-])dark([\s_-]|$)/.test(mark))return 'dark';if(attribute==='light')return 'light';}}catch(error){}
    return window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
  }
  function applyTheme(){const value=resolveTheme(themePreference());if(document.documentElement.dataset.theme!==value)document.documentElement.dataset.theme=value;$('theme').value=themePreference();}
  const NEW_CATEGORY=' +new'; // leading space: cannot collide, category names are trimmed
  const categoryOptions=list=>list.map(category=>'<option value="'+e(category)+'">'+e(I.t(category))+'</option>').join('');
  function syncCategories(){const select=$('category'),list=M.categoryList(apps),signature=list.join('\n');if(select.dataset.signature===signature)return;const value=select.value;select.innerHTML='<option value="">'+e(I.t('Alle Kategorien'))+'</option>'+categoryOptions(list);select.dataset.signature=signature;select.value=list.includes(value)?value:'';}
  function fillEditCategories(selected){const list=M.categoryList(selected&&!M.categories.includes(selected)?[...apps,{category:selected}]:apps);$('edit-category').innerHTML=categoryOptions(list)+'<option value="'+e(NEW_CATEGORY)+'">'+e(I.t('Neue Kategorie …'))+'</option>';$('edit-category').value=selected;$('new-category').value='';$('new-category').hidden=true;}
  $('edit-category').addEventListener('change',()=>{const fresh=$('edit-category').value===NEW_CATEGORY;$('new-category').hidden=!fresh;if(fresh)$('new-category').focus();});
  // Order: the stored list order is the user's own order. Drag and drop is offered only when that order is shown unfiltered.
  function canReorder(){return sortMode==='custom'&&nasReady&&!saving&&!$('search').value.trim()&&!$('category').value&&apps.length>1;}
  $('sort-mode').value=sortMode;
  $('sort-mode').addEventListener('change',event=>{const value=event.target.value;if(!['custom','name','category'].includes(value))return;sortMode=value;try{localStorage.setItem(sortKey,value);}catch(error){}render();});
  function clearDrag(){dragId=null;for(const card of $('grid').querySelectorAll('.is-dragging,.is-drop-target'))card.classList.remove('is-dragging','is-drop-target');}
  $('grid').addEventListener('dragstart',event=>{const card=event.target.closest?.('.app-card');if(!card||!canReorder()){event.preventDefault();return;}dragId=card.dataset.appId;card.classList.add('is-dragging');try{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',card.dataset.appName);}catch(error){}});
  $('grid').addEventListener('dragover',event=>{if(!dragId)return;const card=event.target.closest?.('.app-card');if(!card)return;event.preventDefault();try{event.dataTransfer.dropEffect='move';}catch(error){}for(const other of $('grid').querySelectorAll('.is-drop-target'))if(other!==card)other.classList.remove('is-drop-target');card.classList.toggle('is-drop-target',card.dataset.appId!==dragId);});
  $('grid').addEventListener('drop',async event=>{if(!dragId)return;event.preventDefault();const card=event.target.closest?.('.app-card'),id=dragId;clearDrag();if(!card||card.dataset.appId===id||!canReorder())return;const index=apps.findIndex(app=>app.id===card.dataset.appId);if(index<0)return;await commit(M.move(apps,id,index),I.t('Reihenfolge geändert.'));});
  $('grid').addEventListener('dragend',clearDrag);
  $('grid').addEventListener('click',event=>{const button=event.target.closest('[data-edit]');if(button)editor(button.dataset.edit);});
  $('add').addEventListener('click',()=>editor());$('empty-add').addEventListener('click',()=>editor());$('cancel').addEventListener('click',closeEditor);$('close').addEventListener('click',closeEditor);
  $('pick-icon').addEventListener('click',openIconPicker);
  $('browse-icons').addEventListener('click',()=>{editor();openIconPicker();});
  $('close-icons').addEventListener('click',()=>$('icon-picker').close());
  $('icon-search').addEventListener('input',()=>{clearTimeout(iconSearchTimer);iconSearchTimer=setTimeout(()=>{iconLimit=96;renderIconPicker(true);},120);});
  $('icon-group').addEventListener('change',()=>{iconLimit=96;renderIconPicker(true);});
  $('more-icons').addEventListener('click',()=>{iconLimit+=96;renderIconPicker();});
  $('icon-results').addEventListener('click',event=>{const button=event.target.closest('[data-pick]');if(!button)return;$('icon').value=button.dataset.pick;const selected=M.catalogIcon(button.dataset.pick);if(!$('name').value.trim()&&selected)$('name').value=selected.name;syncIcon();$('icon-picker').close();});
  $('library-size').textContent=M.iconLibrary.length.toLocaleString(I.locale);
  $('editor').addEventListener('click',event=>{if(event.target===$('editor')){const rect=$('editor').getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeEditor();}});
  $('app-form').addEventListener('submit',async event=>{
    event.preventDefault();
    try{let category=$('edit-category').value;if(category===NEW_CATEGORY){category=M.cleanCategory($('new-category').value);if(!$('new-category').value.trim())throw Error(I.t('Bitte einen Namen für die neue Kategorie eingeben.'));}const app=M.clean({id:editingId,name:$('name').value,url:$('url').value,category,icon:$('icon').value,description:$('description').value,containerName:$('edit-container').value,nasHost:$('nas-host').checked});let next=apps.slice();const index=next.findIndex(entry=>entry.id===editingId);if(index<0)next.push(app);else next[index]=app;const wanted=Number($('position').value);if(Number.isInteger(wanted)&&wanted>=1)next=M.move(next,app.id,wanted-1);if(await commit(next,index<0?I.literal('Anwendung hinzugefügt.'):I.literal('Anwendung gespeichert.')))closeEditor();}
    catch(error){$('form-error').textContent=error.message;$('form-error').hidden=false;}
  });
  $('delete').addEventListener('click',async()=>{if(editingId&&await commit(apps.filter(app=>app.id!==editingId),I.literal('Anwendung entfernt.')))closeEditor();});
  $('search').addEventListener('input',render);$('category').addEventListener('change',render);
  $('theme').addEventListener('change',event=>{try{localStorage.setItem(themeKey,event.target.value);}catch(error){}applyTheme();});
  const media=window.matchMedia('(prefers-color-scheme: dark)');media.addEventListener('change',applyTheme);
  const observer=new MutationObserver(applyTheme);try{if(window.parent!==window)observer.observe(window.parent.document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});}catch(error){}
  $('export').addEventListener('click',()=>{
    const content=JSON.stringify({format:'docker-apps',version:1,apps},null,2),blob=new Blob([content],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='docker-apps-links.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(I.literal('Sicherung wurde zum Download bereitgestellt.'));
  });
  $('import').addEventListener('click',()=>$('import-file').click());
  $('import-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>262144)throw Error(I.literal('Die Sicherungsdatei ist zu groß.'));const incoming=M.importData(await file.text());await commit(M.merge(apps,incoming),incoming.length+I.literal(' Einträge aus der Sicherung übernommen.'));}catch(error){toast(error.message);}finally{event.target.value='';}});
  $('templates').hidden=true;
  $('templates').addEventListener('click',()=>{const missing=M.defaults.filter(app=>!apps.some(old=>old.id===app.id||old.url===app.url));if(!missing.length){toast(I.literal('Alle Standardlinks sind bereits vorhanden.'));return;}commit([...apps,...missing],I.literal('Standardlinks ergänzt.'));});
  $('undo').addEventListener('click',undo);$('dismiss').addEventListener('click',()=>$('toast').hidden=true);
  window.addEventListener('storage',event=>{if(event.key===themeKey)applyTheme();if(event.key===sizeKey)applySize();});
  window.addEventListener('pagehide',()=>{clearTimeout(nasTimer);observer.disconnect();media.removeEventListener('change',applyTheme);});
  document.addEventListener('docker-apps:container-import',async event=>{
    try{const incoming=M.validate(event.detail),next=apps.map(x=>({...x}));let added=0,linked=0;
      for(const entry of incoming){const existing=next.find(x=>x.containerName===entry.containerName||x.url===entry.url||DockerAppsMonitorModel.matchContainer(x,[{name:entry.containerName,image:'',ports:[{host:Number(new URL(entry.url).port||(new URL(entry.url).protocol==='https:'?443:80))}]}],event.detail.hosts||[location.hostname]));if(existing){existing.containerName=entry.containerName;linked++;}else{next.push(entry);added++;}}
      const result=await commit(next,added+I.literal(' Anwendungen ergänzt, ')+linked+I.literal(' bestehende Links verknüpft.'));event.detail.onComplete?.(result);
    }catch(error){toast(error.message);event.detail.onComplete?.(false);}
  });
  document.addEventListener('docker-apps:refresh',()=>refreshShared(true));
  $('migrate-browser').addEventListener('click',()=>{try{$('migration-error').textContent='';const planned=migrationEntries();$('migration-preview').innerHTML=planned.map(x=>'<li><strong>'+e(x.name)+'</strong><br>'+e(x.url)+'</li>').join('')||'<li>'+e(I.t('Die gemeinsame Liste startet leer.'))+'</li>';$('migration-dialog').showModal();}catch(error){toast(error.message);}});
  $('cancel-migration').addEventListener('click',()=>$('migration-dialog').close());
  $('confirm-migration').addEventListener('click',async()=>{if(await commit(migrationEntries(),I.t('Gemeinsame NAS-Liste gespeichert.'),true))$('migration-dialog').close();});
  window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='docker-apps:visibility')return;storageActive=event.data.visible===true;clearTimeout(nasTimer);if(storageActive&&!document.hidden)refreshShared();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(nasTimer);if(!document.hidden)refreshShared();});

  // --- Storage location, version history and cleanup (1.5.0) ---
  function storagePath(){return nasStore.folder||('/'+nasStore.shareName+'/'+DockerAppsNAS.FOLDER);}
  function footerPath(){$('storage-path-label').textContent=I.t('Gemeinsame App-Liste: ')+nasStore.shareName+'/'+DockerAppsNAS.FOLDER+'.';}
  async function cleanup(){const result=await nasStore.prune();if(result.error)console.warn('Docker Apps: '+result.error);}
  function fmt(key,vars){return I.t(key).replace(/\{(\w+)\}/g,(m,k)=>String(vars[k]));}
  function formatTime(seconds){return seconds?new Date(seconds*1000).toLocaleString(I.locale,{dateStyle:'medium',timeStyle:'short'}):'—';}
  function differences(target){const now=new Map(apps.map(a=>[a.id,a])),then=new Map(target.map(a=>[a.id,a]));const added=target.filter(a=>!now.has(a.id)),removed=apps.filter(a=>!then.has(a.id)),changed=target.filter(a=>now.has(a.id)&&JSON.stringify(now.get(a.id))!==JSON.stringify(a));return {added,removed,changed};}
  async function openHistory(){if(saving)return;$('history-dialog').showModal();await reloadHistory();}
  async function reloadHistory(){
    const request=++historyRequest;
    historySelected=null;historyRows=[];$('history-error').textContent='';$('history-preview').innerHTML='';$('history-list').innerHTML='<li class="history-empty">'+e(I.t('Versionen werden geladen …'))+'</li>';lockControls();
    try{const list=await nasStore.revisions();if(request!==historyRequest)return;historyRows=list;
      $('history-list').innerHTML=list.map((row,i)=>'<li><button type="button" data-revision="'+row.revision+'"'+(i===0?' disabled':'')+'><strong>'+e(formatTime(row.mtime))+'</strong><span>'+e(fmt(i===0?'Version {n} · aktuell':'Version {n}',{n:row.revision}))+'</span></button></li>').join('')||'<li class="history-empty">'+e(I.t('Keine Versionen gefunden.'))+'</li>';
      $('history-note').textContent=fmt('Die letzten {n} Versionen werden aufbewahrt. Wiederherstellen legt eine neue Version an; nichts wird überschrieben.',{n:nasStore.keep})+' '+I.t('Die aktuelle Version ist geschützt.');$('history-preview').textContent=I.t('Eine alte Version auswählen, um Änderungen zu prüfen oder den Eintrag zu löschen.');lockControls();
    }catch(error){$('history-list').innerHTML='';$('history-error').textContent=error.message;}
  }
  async function previewRevision(number){
    if(saving)return;const request=++historyRequest;
    for(const b of $('history-list').querySelectorAll('button'))b.classList.toggle('is-selected',Number(b.dataset.revision)===number);
    historySelected=null;lockControls();$('history-error').textContent='';$('history-preview').innerHTML='<p>'+e(I.t('Version wird geladen …'))+'</p>';
    try{const state=await nasStore.readRevision(number);if(request!==historyRequest)return;const diff=differences(state.apps);historySelected=state;
      const group=(label,items,cls)=>items.length?'<h3>'+e(fmt(label,{n:items.length}))+'</h3><ul class="'+cls+'">'+items.map(a=>'<li><strong>'+e(a.name)+'</strong> <span>'+e(a.url)+'</span></li>').join('')+'</ul>':'';
      $('history-preview').innerHTML='<p>'+e(fmt(state.apps.length===1?'Version {n} enthält {count} Anwendung.':'Version {n} enthält {count} Anwendungen.',{n:number,count:state.apps.length}))+'</p>'+(group('Kommt zurück ({n})',diff.added,'diff-added')+group('Wird entfernt ({n})',diff.removed,'diff-removed')+group('Wird geändert ({n})',diff.changed,'diff-changed')||'<p>'+e(I.t('Identisch mit der aktuellen Liste.'))+'</p>');
    }catch(error){if(request!==historyRequest)return;$('history-preview').innerHTML='';$('history-error').textContent=error.message;}
    finally{lockControls();}
  }
  async function restoreRevision(){if(saving||!historySelected)return;const target=historySelected;if(await commit(target.apps,fmt('Version {n} wurde wiederhergestellt.',{n:target.revision})))$('history-dialog').close();}
  async function deleteHistoryRevision(){
    if(saving||!historySelected||!nasStore.canDeleteHistory)return;
    const number=historySelected.revision,current=historyRows[0]?.revision;
    if(number>=current)return;
    if(!window.confirm(fmt('Version {n} dauerhaft löschen? Dies kann nicht rückgängig gemacht werden. Die aktuelle App-Liste bleibt erhalten.',{n:number})))return;
    saving=true;lockControls();$('history-error').textContent='';
    try{await nasStore.deleteRevision(number,current);await reloadHistory();toast(fmt('Version {n} wurde gelöscht.',{n:number}));}
    catch(error){$('history-error').textContent=error.message;}
    finally{saving=false;lockControls();}
  }
  async function openLocation(){
    $('location-error').textContent='';$('location-share').innerHTML='<option>'+e(I.t('Wird geladen …'))+'</option>';$('location-copy-row').hidden=!nasReady||!apps.length;$('location-copy').checked=true;lockControls();$('location-dialog').showModal();
    try{const shares=await nasStore.listShares(),current=nasStore.shareName;if(!shares.some(s=>s.toLowerCase()===current.toLowerCase()))shares.unshift(current);
      $('location-share').innerHTML=shares.map(s=>'<option value="'+e(s)+'"'+(s.toLowerCase()===current.toLowerCase()?' selected':'')+'>'+e(s)+(s===DockerAppsNAS.DEFAULT_SHARE?' '+e(I.t('(Standard)')):'')+'</option>').join('');
    }catch(error){$('location-share').innerHTML='';$('location-error').textContent=error.message;}
  }
  async function applyLocation(){
    const name=$('location-share').value;if(!DockerAppsNAS.validShare(name)){$('location-error').textContent=I.t('Ungültiger Ordnername.');return;}
    const copy=nasReady&&apps.length&&$('location-copy').checked,current=apps.map(a=>({...a})),before=nasStore.preferredShare;
    if(name.toLowerCase()===nasStore.shareName.toLowerCase()&&nasReady){$('location-dialog').close();return;}
    saving=true;lockControls();$('location-error').textContent='';
    let target;try{nasStore.setShare(name===DockerAppsNAS.DEFAULT_SHARE?null:name);target=await nasStore.load();}
    catch(error){nasStore.setShare(before);$('location-error').textContent=error.message;saving=false;lockControls();return;}
    saving=false;
    try{if(nasStore.preferredShare)localStorage.setItem(shareKey,nasStore.preferredShare);else localStorage.removeItem(shareKey);}catch(error){}
    footerPath();previous=null;
    if(!target.revision&&copy){nasRevision=0;nasReady=false;if(await commit(current,I.t('Liste in den neuen Speicherort kopiert.'),true)){$('location-dialog').close();return;}$('location-error').textContent=$('location-error').textContent||I.t('Kopieren fehlgeschlagen. Der Speicherort wurde trotzdem gewechselt.');lockControls();return;}
    nasRevision=-1;nasReady=false;$('location-dialog').close();await refreshShared(true);
    toast(I.t(target.revision?'Vorhandene Liste aus dem neuen Speicherort geladen.':'Speicherort gewechselt.'));
  }
  $('show-history').addEventListener('click',openHistory);
  $('close-history').addEventListener('click',()=>$('history-dialog').close());
  $('cancel-history').addEventListener('click',()=>$('history-dialog').close());
  $('history-list').addEventListener('click',event=>{const b=event.target.closest('[data-revision]');if(b&&!b.disabled)previewRevision(Number(b.dataset.revision));});
  $('confirm-restore').addEventListener('click',restoreRevision);
  $('delete-history').addEventListener('click',deleteHistoryRevision);
  $('storage-location').addEventListener('click',openLocation);
  $('close-location').addEventListener('click',()=>$('location-dialog').close());
  $('cancel-location').addEventListener('click',()=>$('location-dialog').close());
  $('confirm-location').addEventListener('click',applyLocation);
  footerPath();
  applySize();applyTheme();render();migrationButton();storageStatus(I.t('NAS-Liste wird geladen …'));refreshShared();if(loadError)toast(loadError);
})();
