(function(){
 'use strict';
 const I=DockerAppsI18n;
 const $=id=>document.getElementById(id),M=DockerAppsModel,T=DockerAppsMonitorModel,e=M.escape,client=new DockerAppsDSM.Client();
 let account='browser';for(const w of [window.parent,window.top])try{const user=typeof w._S==='function'&&w._S('username');if(typeof user==='string'&&user){account=user;break;}}catch(err){}
 const liveKey='docker-apps.live:'+account;
 let remembered=false;try{remembered=localStorage.getItem(liveKey)==='true';}catch(err){}
 let enabled=remembered,active=true,busy=false,timer=null,controller=null,importController=null,last=null,failures=0,storageTime=0,storage=[],storageError='',candidates=[],snapshot=null,previousIo=null;
 let nasIPs=[],networkTime=0;
 let scanGeneration=0;
 const hosts=()=>[...new Set([location.hostname,...nasIPs])];
 async function readNetwork(signal){if(Date.now()-networkTime<60000)return;networkTime=Date.now();nasIPs=T.addresses(await optional('network',signal));$('nas-address').textContent='NAS: '+(nasIPs.length?nasIPs.join(' · '):location.hostname);}
 const unavailable=new Set(),issues=new Map(),stateLabels={running:I.literal('Läuft'),stopped:I.literal('Gestoppt'),paused:I.literal('Pausiert'),restarting:I.literal('Startet neu'),unknown:I.literal('Unbekannt')};
 function visible(){let shown=!document.hidden&&active;try{const frame=window.frameElement;if(frame&&(frame.getClientRects().length===0||getComputedStyle(frame).visibility==='hidden'))shown=false;}catch(err){}return shown;}
 function percent(value){return value===null||value===undefined?'—':Number(value).toLocaleString(I.locale,{maximumFractionDigits:1})+' %';}
 function bar(label,value,text){return '<div class="meter-label"><span>'+e(label)+'</span><span>'+e(text??percent(value))+'</span></div><div class="meter-track"><span style="width:'+Math.max(0,Math.min(100,Number(value)||0))+'%"></span></div>';}
 // Network and disk throughput of one container, shown in the details window. Needs two readings, so the first poll shows dashes.
 function ioRates(rate){const speed=v=>v===null||v===undefined?'—':T.bytes(v)+'/s';return '<div class="io-rates"><span>'+e(I.t('Netzwerk'))+'</span><span>↓ '+e(speed(rate?.rx))+' · ↑ '+e(speed(rate?.tx))+'</span><span>'+e(I.t('Datenträger'))+'</span><span>'+e(I.t('Lesen'))+' '+e(speed(rate?.read))+' · '+e(I.t('Schreiben'))+' '+e(speed(rate?.write))+'</span></div>';}
 function findContainer(card){return snapshot?T.matchContainer({containerName:card.dataset.containerName,name:card.dataset.appName,url:card.dataset.appUrl,icon:card.dataset.appIcon,nasHost:card.dataset.nasHost==='true'},snapshot.containers,hosts()):null;}
 function render(){
  for(const card of document.querySelectorAll('.app-card')){
   let panel=card.querySelector('.container-metrics');if(!panel){panel=document.createElement('div');panel.className='container-metrics';card.querySelector('.card-footer').before(panel);}
   panel.title='';const c=findContainer(card);if(!enabled){panel.hidden=true;continue;}panel.hidden=false;
   if(!c){panel.innerHTML='<span class="status-label unknown">'+(card.dataset.containerName?I.literal('Container nicht verfügbar'):I.literal('Nicht verknüpft'))+'</span>';continue;}
   const r=snapshot.resources.get(c.name),io=snapshot.io.get(c.name)||snapshot.io.get(c.id),running=c.state==='running';
   panel.innerHTML='<span class="status-label '+e(c.state)+'">● '+e(stateLabels[c.state])+'</span>'+bar('CPU',running?r?.cpu??null:null)+bar('RAM',running?r?.memoryPercent??null:null,running?T.bytes(r?.memory??null)+' · '+percent(r?.memoryPercent??null):'—')+'<div class="compact-metrics"><span>CPU <strong>'+e(percent(running?r?.cpu??null:null))+'</strong></span><span>RAM <strong>'+e(running?T.bytes(r?.memory??null):'—')+'</strong></span></div>'+(running&&io?ioRates(snapshot.rates.get(c.name)||snapshot.rates.get(c.id)):'');
   // The same figures as a tooltip, for views that have no details window.
   const rateRow=panel.querySelector('.io-rates');panel.title=rateRow?[...rateRow.children].map(x=>x.textContent).reduce((rows,text,i)=>{if(i%2)rows[rows.length-1]+=' '+text;else rows.push(text+':');return rows;},[]).join('\n'):'';
  }
  $('nas-summary').hidden=!enabled;
  document.querySelector('.system-bar').hidden=!enabled;
  if(!snapshot){$('nas-summary').innerHTML=I.literal('<span>NAS-Werte: —</span>');document.dispatchEvent(new Event('docker-apps:system-render'));return;}
  const s=snapshot.system,temp=snapshot.temperature,temperatureLabel=I.t(temp?.kind==='cpu'?'CPU-Temperatur':'Systemtemperatur'),temperatureText=temp?.value!==null&&temp?.value!==undefined?Number(temp.value).toLocaleString(I.locale,{maximumFractionDigits:1})+' °C':'—';
  const ramText=s?.memoryUsed!==null&&s?.memoryUsed!==undefined?'≈ '+T.bytes(s.memoryUsed)+' / '+T.bytes(s.memoryTotal):'— / '+T.bytes(s?.memoryTotal??null);
  const volumeHTML=storage.length?storage.map(v=>'<div class="volume-meter '+(v.percent>=95?'critical':v.percent>=85?'warning':'')+'">'+bar(v.name,v.percent)+'<div class="summary-detail">'+e(T.bytes(v.used))+' '+e(I.t('belegt'))+' / '+e(T.bytes(v.total))+' · '+e(T.bytes(v.free))+' '+e(I.t('frei'))+'</div></div>').join(''):'<div class="summary-detail">'+e(storageError||I.literal('Volume-Speicher: —'))+'</div>';
  const rate=v=>v===null||v===undefined?'—':T.bytes(v)+'/s';
  $('nas-summary').innerHTML='<div class="summary-cpu">'+bar('CPU',s?.cpu??null)+'</div><div class="summary-ram">'+bar('RAM',s?.memoryPercent??null)+'<div class="summary-detail" title="'+e(I.t('Aus dem DSM-Prozentwert berechnet; gerundet.'))+'">'+e(ramText)+'</div></div><div class="summary-temperature"><span class="summary-heading">'+e(temperatureLabel)+'</span><strong>'+e(temperatureText)+'</strong></div><div class="summary-network"><div class="summary-heading">'+e(I.t('Netzwerk'))+'</div><div class="summary-detail">↓ '+e(I.t('Empfangen'))+' '+e(rate(s?.rxRate))+' · <br>↑ '+e(I.t('Gesendet'))+' '+e(rate(s?.txRate))+'</div></div><div class="volume-summary" title="'+e(storageError)+'">'+volumeHTML+'</div>';
  document.dispatchEvent(new Event('docker-apps:system-render'));

 }
 function status(text){$('monitor-status').textContent=text;}
 async function optional(operation,signal){if(unavailable.has(operation))return null;try{const data=await client.call(operation,null,signal);issues.delete(operation);return data;}catch(err){if(signal.aborted)throw err;issues.set(operation,err.message);if(!client.info?.[DockerAppsDSM.operations[operation].api])unavailable.add(operation);return null;}}
 function stop(){clearTimeout(timer);timer=null;controller?.abort();}
 function schedule(delay=10000){clearTimeout(timer);if(enabled&&visible())timer=setTimeout(poll,delay);}
 async function poll(){
  if(!enabled||!visible()||busy)return;busy=true;controller=new AbortController();const signal=controller.signal,timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const containers=T.containers(await client.call('containers',null,signal));
   await readNetwork(signal);
   const results=await Promise.all([optional('resources',signal),optional('stats',signal),optional('system',signal),optional('hardware',signal)]);
   if(Date.now()-storageTime>60000){storageTime=Date.now();let data=await optional('storage',signal),received=data!==null;storage=T.volumes(data);if(!storage.length){data=await optional('volumes',signal);received=received||data!==null;storage=T.volumes(data);}const reasons=[issues.get('storage'),issues.get('volumes')].filter(Boolean);storageError=storage.length?'':received?I.literal('Volume: Keine Kapazitätswerte erkannt'):reasons.some(x=>/Berechtigung|Sitzung|permission|session/.test(x))?I.literal('Volume: DSM-Berechtigung oder Sitzung prüfen'):I.literal('Volume: DSM-Abfrage nicht verfügbar');if(storageError&&reasons.length)storageError+=' ('+reasons.join(' / ')+')';}
   if(!enabled||!visible())return;
   const io=T.ioMap(results[1]),now=Date.now(),rates=T.rates(previousIo?.map,io,previousIo?(now-previousIo.time)/1000:0);if(results[1])previousIo={map:io,time:now};
   snapshot={containers,resources:T.resourceMap(results[0]),io,rates,system:results[2]?T.system(results[2]):null,temperature:T.temperature(results[3])};last=Date.now();failures=0;
   status('Live · '+new Date(last).toLocaleTimeString(I.locale)+(results[0]?'':I.literal(' · CPU/RAM nicht verfügbar')));render();updateContainerChoices();
  }catch(err){if(enabled&&visible()){snapshot=null;failures++;status(I.literal('Keine aktuellen Daten · ')+(err.name==='AbortError'?I.literal('Zeitüberschreitung.'):err.message));render();}}
  finally{clearTimeout(timeout);busy=false;controller=null;schedule(failures?Math.min(120000,30000*failures):10000);}
 }
 function updateContainerChoices(){const select=$('edit-container'),value=select.value;select.innerHTML=I.literal('<option value="">Nicht verknüpft</option>')+(snapshot?.containers||[]).map(c=>'<option value="'+e(c.name)+'">'+e(c.name)+'</option>').join('');if(value&&!snapshot?.containers.some(c=>c.name===value))select.insertAdjacentHTML('beforeend','<option value="'+e(value)+'">'+e(value)+I.literal(' (nicht verfügbar)</option>'));select.value=value;}
 $('live-toggle').addEventListener('change',()=>{enabled=$('live-toggle').checked;try{localStorage.setItem(liveKey,String(enabled));}catch(err){$('toast-text').textContent=I.t('Live-Einstellung konnte nicht gespeichert werden.');$('undo').hidden=true;$('toast').hidden=false;}stop();snapshot=null;previousIo=null;render();if(enabled){status(I.literal('Verbinde mit DSM …'));poll();}else{status(I.literal('Live-Daten aus'));importController?.abort();}});
 $('refresh-monitor').addEventListener('click',()=>{document.dispatchEvent(new Event('docker-apps:refresh'));if(enabled){storageTime=0;stop();if(!busy)poll();}});
 document.addEventListener('docker-apps:render',render);
 document.addEventListener('visibilitychange',()=>{stop();if(enabled&&visible())poll();else if(enabled)status(I.literal('Live-Daten pausiert'));});
 window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='docker-apps:visibility')return;active=event.data.visible===true;stop();if(enabled&&visible())poll();else if(enabled)status(I.literal('Live-Daten pausiert'));});
 window.addEventListener('pagehide',()=>{enabled=false;stop();importController?.abort();});
 function drawCandidates(){
  $('container-results').innerHTML=candidates.map((c,i)=>'<div class="container-row"><label class="container-choice"><input type="checkbox" data-check="'+i+'" '+(c.url?'checked':'')+'><span><strong>'+e(c.name)+'</strong><small>'+e(stateLabels[c.state]+' · '+(c.image||'Container'))+'</small></span></label><input class="candidate-url" data-url="'+i+I.literal('" aria-label="Webadresse ')+e(c.name)+I.literal('" placeholder="Webadresse eingeben" value="')+e(c.url)+'"><small>'+e(c.note||I.literal('Port-Vorschlag prüfen: Nicht jeder TCP-Port ist eine Weboberfläche.'))+'</small></div>').join('')||I.literal('<p class="no-icons">Keine laufenden Container gefunden.</p>');
 }
 $('scan-containers').addEventListener('click',async()=>{
  const generation=++scanGeneration;importController?.abort();if(!$('container-import').open)$('container-import').showModal();$('container-results').textContent=I.literal('Laufende Container werden gelesen …');$('container-import-error').textContent='';$('confirm-container-import').disabled=true;
  candidates=[];importController=new AbortController();const signal=importController.signal,timeout=setTimeout(()=>importController.abort(),30000);
  try{
   await readNetwork(signal);const preferred=nasIPs.includes(location.hostname)?location.hostname:(nasIPs.length===1?nasIPs[0]:location.hostname);$('import-host').innerHTML=hosts().map(host=>'<option value="'+e(host)+'">'+e(host)+'</option>').join('');$('import-host').value=preferred;
   const found=T.containers(await client.call('containers',null,signal)).filter(c=>$('include-stopped').checked||c.state==='running');
   // Inspect only for the preview; environment values, mounts and raw profiles are never stored/exported.
   candidates=found.map(c=>({...c,url:T.suggestURL(c,$('import-host').value),icon:T.guessIcon(c,M.iconLibrary)}));
   let cursor=0;await Promise.all(Array.from({length:Math.min(4,candidates.length)},async()=>{while(cursor<candidates.length){const index=cursor++,c=candidates[index];if(signal.aborted)throw Error(I.literal('Import abgebrochen.'));if(c.ports.length)continue;for(const operation of ['detail','profile']){try{c.ports=T.ports(await client.call(operation,c.name,signal));if(c.ports.length)break;}catch(err){if(signal.aborted)throw err;c.note=I.literal('Port-Abfrage: ')+err.message;}}c.url=T.suggestURL(c,$('import-host').value);if(!c.url&&!c.note)c.note=I.literal('DSM meldet keinen erreichbaren veröffentlichten TCP-Port. Host-Netzwerk oder Portzuordnung im Container Manager prüfen.');}}));
   if(generation!==scanGeneration||!$('container-import').open)return;drawCandidates();$('confirm-container-import').disabled=!candidates.length;
  }catch(err){if(generation===scanGeneration&&$('container-import').open){$('container-results').textContent='';$('container-import-error').textContent=err.name==='AbortError'?I.literal('Abfrage abgebrochen oder Zeitüberschreitung.'):err.message;}}
  finally{clearTimeout(timeout);}
 });
 $('include-stopped').addEventListener('change',()=>$('scan-containers').click());
 $('import-host').addEventListener('change',()=>{for(const [i,c]of candidates.entries()){const field=$('container-results').querySelector('[data-url="'+i+'"]');if(field&&field.value===c.url){c.url=T.suggestURL(c,$('import-host').value);field.value=c.url;}}});
 function closeImport(){importController?.abort();$('container-import').close();}
 $('close-container-import').addEventListener('click',closeImport);$('cancel-container-import').addEventListener('click',closeImport);$('container-import').addEventListener('cancel',()=>importController?.abort());
 $('confirm-container-import').addEventListener('click',async()=>{
  try{const entries=[];for(const check of $('container-results').querySelectorAll('[data-check]:checked')){const i=Number(check.dataset.check),c=candidates[i],url=$('container-results').querySelector('[data-url="'+i+'"]').value;
    // Follow the NAS address only when the link uses the very address DSM is open with right now (proven reachable).
    let nasHost=false;try{nasHost=new URL(M.normalizeURL(url)).hostname===location.hostname;}catch(err){}
    entries.push(M.clean({id:'container-'+c.name,name:c.name,url,category:'Andere',icon:c.icon,description:'',containerName:c.name,nasHost}));}
   if(!entries.length)throw Error(I.literal('Bitte mindestens einen Container auswählen.'));
   entries.hosts=hosts();const saved=await new Promise(resolve=>{entries.onComplete=resolve;document.dispatchEvent(new CustomEvent('docker-apps:container-import',{detail:entries}));});if(saved){closeImport();if(enabled&&!busy)poll();}
  }catch(err){$('container-import-error').textContent=err.message;}
 });
 $('live-toggle').checked=enabled;render();if(enabled){status(I.literal('Verbinde mit DSM …'));poll();}
})();
