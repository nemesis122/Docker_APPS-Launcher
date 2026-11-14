(function(r,f){const api=f(typeof module==='object'&&module.exports?require('./model.js'):r.DockerAppsModel,typeof module==='object'&&module.exports?require('./i18n.js'):r.DockerAppsI18n,typeof module==='object'&&module.exports?require('./dsm-readonly.js'):r.DockerAppsDSM);if(typeof module==='object'&&module.exports)module.exports=api;else r.DockerAppsNAS=api;})(typeof globalThis!=='undefined'?globalThis:this,function(M,I,D){
 'use strict';
 // Closed table of File Station calls. Nothing outside the chosen share's "Docker APPS" folder is written or deleted.
 const operations=Object.freeze({
  shares:['SYNO.FileStation.List','list_share',2],
  list:['SYNO.FileStation.List','list',2],
  create:['SYNO.FileStation.CreateFolder','create',2],
  read:['SYNO.FileStation.Download','download',2],
  upload:['SYNO.FileStation.Upload','upload',2],
  remove:['SYNO.FileStation.Delete','delete',2]
 });
 const FOLDER='Docker APPS',DEFAULT_SHARE='docker',KEEP=30,MAX_BYTES=262144;
 const filename=n=>'apps-'+String(n).padStart(12,'0')+'.json',filePattern=/^apps-(\d{12})\.json$/;
 const sharePattern=/^[^/\\:*?"<>|\u0000-\u001f]{1,64}$/;
 function validShare(name){return typeof name==='string'&&sharePattern.test(name)&&name!=='.'&&name!=='..';}
 function failure(key,code){const err=Error(I.t(key)+(code&&code!=='conflict'&&code!=='no-share'?' ('+code+')':''));err.code=code;return err;}
 function missingShare(name){const err=Error(I.t('Der freigegebene Ordner {name} fehlt oder ist nicht zugänglich.').replace('{name}',name));err.code='no-share';err.share=name;return err;}
 class Store{
  constructor({fetcher=globalThis.fetch.bind(globalThis),getToken=()=>D.token(globalThis.window),share=null,keep=KEEP}={}){
   this.fetcher=fetcher;this.getToken=getToken;this.info=null;this.share=null;this.folder=null;
   this.preferredShare=validShare(share)?share:null;this.keep=Number.isInteger(keep)&&keep>=2?keep:KEEP;
  }
  get shareName(){return this.preferredShare||DEFAULT_SHARE;}
  setShare(name){
   if(name!==null&&!validShare(name))throw failure('Ungültiger Ordnername.');
   this.preferredShare=name;this.share=null;this.folder=null;
  }
  async request(api,method,version,params={},upload=null,raw=false){
   const meta=this.info?.[api];if(api!=='SYNO.API.Info'&&!meta)throw failure(api==='SYNO.FileStation.Delete'?'Alte Versionen können nicht gelöscht werden.':'File Station ist nicht verfügbar. Bitte Installation und Anwendungsrechte prüfen.');
   const path=String(meta?.path||'entry.cgi');if(!/^[A-Za-z0-9_/-]+\.cgi$/.test(path)||path.startsWith('/')||path.split('/').includes('..'))throw failure('Ungültiger DSM-API-Pfad.');
   const token=this.getToken(),headers={Accept:raw?'application/json, application/octet-stream':'application/json'};if(token)headers['X-SYNO-TOKEN']=token;
   let body;
   if(upload){body=new FormData();for(const [k,v]of Object.entries({api,version:String(version),method,...params}))body.append(k,String(v));body.append('file',new Blob([upload.content],{type:'application/json'}),upload.name);}
   else{body=new URLSearchParams({api,version:String(version),method});for(const [k,v]of Object.entries(params))body.set(k,JSON.stringify(v));headers['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';}
   const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),20000);
   try{const response=await this.fetcher('/webapi/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers,body,signal:abort.signal});
    if(!response.ok)throw failure('NAS-Speicher nicht erreichbar.',response.status);
    if(raw){const size=Number(response.headers?.get('content-length'));if(size>MAX_BYTES)throw failure('Die Sicherungsdatei ist zu groß.');let text='';if(response.body?.getReader){const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;for(;;){const chunk=await reader.read();if(chunk.done)break;bytes+=chunk.value.length;if(bytes>MAX_BYTES){await reader.cancel();throw failure('Die Sicherungsdatei ist zu groß.');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}else text=await response.text();if(text.length>MAX_BYTES)throw failure('Die Sicherungsdatei ist zu groß.');return text;}
    const result=await response.json();if(result.success!==true){const code=result.error?.code;throw failure([105,106,107,119,407].includes(code)?'DSM-Anmeldung oder Ordnerberechtigung fehlt.':'File-Station-Anfrage fehlgeschlagen.',code);}return result.data;
   }finally{clearTimeout(timeout);}
  }
  async discover(){
   if(this.info)return this.info;
   const query=[...new Set(Object.values(operations).map(op=>op[0]))].join(',');
   // Discovery uses a plain query string, as required by SYNO.API.Info.
   const token=this.getToken(),headers={'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'};if(token)headers['X-SYNO-TOKEN']=token;
   const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),20000);let result;
   try{const response=await this.fetcher('/webapi/entry.cgi',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers,body:new URLSearchParams({api:'SYNO.API.Info',version:'1',method:'query',query}),signal:abort.signal});if(!response.ok)throw failure('NAS-Speicher nicht erreichbar.',response.status);result=await response.json();}finally{clearTimeout(timeout);}
   if(!result?.success||!result.data||typeof result.data!=='object')throw failure('File Station ist nicht verfügbar. Bitte Installation und Anwendungsrechte prüfen.',result?.error?.code);
   this.info=result.data;return this.info;
  }
  // Shared folders the signed-in user can see, for the storage location dialog.
  async listShares(){
   await this.discover();const data=await this.request(...operations.shares,{limit:0,offset:0});
   return (data?.shares||[]).filter(s=>validShare(s?.name)&&/^\/[^/\\]+$/.test(s.path)&&!s.path.includes('..')).map(s=>s.name).sort((a,b)=>a.localeCompare(b));
  }
  // Finds an existing list when this browser has no saved location yet. Returns a share name, or null to keep the default.
  // Read-only: lists folders, never creates or changes anything.
  async locate(){
   await this.discover();const data=await this.request(...operations.shares,{limit:0,offset:0});
   const shares=(data?.shares||[]).filter(s=>validShare(s?.name)&&/^\/[^/\\]+$/.test(s.path)&&!s.path.includes('..'));
   const hasList=async share=>{try{const d=await this.request(...operations.list,{folder_path:share.path+'/'+FOLDER,limit:0,offset:0,pattern:'apps-*.json'});return (d?.files||[]).some(f=>!f.isdir&&filePattern.test(f.name));}catch(error){return false;}};
   const standard=shares.find(s=>s.name.toLowerCase()===DEFAULT_SHARE.toLowerCase());
   if(standard&&await hasList(standard))return null;
   const found=[];for(const share of shares.slice(0,40)){if(share===standard)continue;if(await hasList(share))found.push(share.name);if(found.length>1)return null;}
   return found.length===1?found[0]:null;
  }
  async resolve(){
   if(this.folder)return;await this.discover();
   const wanted=this.shareName,data=await this.request(...operations.shares,{limit:0,offset:0});
   const matches=(data?.shares||[]).filter(s=>String(s.name).toLowerCase()===wanted.toLowerCase());
   if(matches.length!==1||!/^\/[^/\\]+$/.test(matches[0].path)||matches[0].path.includes('..'))throw missingShare(wanted);
   this.share=matches[0].path;this.folder=this.share+'/'+FOLDER;
  }
  async exists(){await this.resolve();const data=await this.request(...operations.list,{folder_path:this.share,limit:0,offset:0,pattern:FOLDER});const row=(data?.files||[]).find(f=>f.name===FOLDER);if(row&&!row.isdir)throw failure('Docker APPS ist keine Ordnerstruktur.');return !!row;}
  // All stored revisions, newest first. Only files matching apps-<12 digits>.json are considered.
  async revisions(){
   await this.resolve();if(!await this.exists())return [];
   const data=await this.request(...operations.list,{folder_path:this.folder,limit:0,offset:0,pattern:'apps-*.json',sort_by:'name',sort_direction:'desc',additional:['time','size']});
   return (data?.files||[]).filter(f=>!f.isdir&&filePattern.test(f.name)).map(f=>({name:f.name,revision:Number(filePattern.exec(f.name)[1]),mtime:Number(f.additional?.time?.mtime)||null,size:Number(f.additional?.size)||null})).filter(f=>f.revision>=1).sort((a,b)=>b.revision-a.revision);
  }
  async readRevision(number){
   if(!Number.isInteger(number)||number<1||number>999999999999)throw failure('Ungültige NAS-Sicherungsdatei.');
   await this.resolve();const text=await this.request(...operations.read,{path:[this.folder+'/'+filename(number)],mode:'download'},null,true);
   let state;try{state=JSON.parse(text);}catch(err){throw failure('Die gemeinsame NAS-Liste ist beschädigt. Keine Daten wurden überschrieben.');}
   if(state?.success===false)throw failure('DSM-Anmeldung oder Ordnerberechtigung fehlt.',state.error?.code);
   if(state?.format!=='docker-apps-shared'||state.version!==1||state.revision!==number||typeof state.nonce!=='string'||state.nonce.length>100)throw failure('Ungültige NAS-Sicherungsdatei.');
   return {revision:number,nonce:state.nonce,apps:M.validate(state.apps)};
  }
  async load(){const list=await this.revisions();if(!list.length)return {revision:0,apps:[],nonce:null};return this.readRevision(list[0].revision);}
  async open(){
   const current=await this.load();if(current.revision)return current;
   // First launch only: initialize via the signed-in user's File Station rights.
   // No root installer, no permission changes and no automatic migration of browser data.
   try{return await this.save([],0);}catch(error){if(error.code==='conflict'){const winner=await this.load();if(winner.revision)return winner;}throw error;}
  }
  async save(apps,expected){const cleaned=M.validate(apps),current=await this.load();if(current.revision!==expected)throw failure('Die NAS-Liste wurde anderswo geändert. Bitte neu laden und die Änderung erneut ausführen.','conflict');
   if(!await this.exists()){try{await this.request(...operations.create,{folder_path:[this.share],name:[FOLDER],force_parent:false});}catch(err){if(!await this.exists())throw err;}}
   const revision=expected+1;if(revision>999999999999)throw failure('Ungültige NAS-Sicherungsdatei.');
   const nonce=Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),state={format:'docker-apps-shared',version:1,revision,nonce,apps:cleaned},content=JSON.stringify(state,null,2);if(new TextEncoder().encode(content).length>MAX_BYTES)throw failure('Die Sicherungsdatei ist zu groß.');
   // No overwrite parameter: DSM rejects an existing revision instead of overwriting it.
   let uploadError=null;try{await this.request(...operations.upload,{path:this.folder,create_parents:'false'},{name:filename(revision),content});}catch(err){uploadError=err;}
   const check=await this.load();if(check.revision===revision&&check.nonce===nonce)return check;
   // Verify this exact immutable revision if another writer already appended a newer one.
   if(check.revision>revision){try{const own=await this.readRevision(revision);if(own.nonce===nonce)return check;}catch(err){}}
   if(uploadError&&![1805,418].includes(uploadError.code))throw uploadError;
   throw failure('Die NAS-Liste wurde anderswo geändert. Bitte neu laden und die Änderung erneut ausführen.','conflict');
  }
  get canDeleteHistory(){return !!this.info?.[operations.remove[0]];}
  async deleteRevision(number,expectedCurrent){
   if(!Number.isInteger(number)||number<1||number>999999999999)throw failure('Ungültige NAS-Sicherungsdatei.');
   const rows=await this.revisions(),latest=rows[0]?.revision;
   if(!latest||latest!==expectedCurrent)throw failure('Die NAS-Liste wurde anderswo geändert. Bitte neu laden und die Änderung erneut ausführen.','conflict');
   if(number>=latest)throw failure('Die aktuelle Version kann nicht gelöscht werden.');
   if(!rows.some(row=>row.revision===number))throw failure('Diese Version ist nicht mehr vorhanden. Bitte den Verlauf neu öffnen.');
   // Validate the current list before deleting any backup. Never accept a caller-supplied path.
   await this.readRevision(latest);
   await this.request(...operations.remove,{path:[this.folder+'/'+filename(number)],recursive:false});
   if((await this.revisions()).some(row=>row.revision===number))throw failure('Das Löschen konnte nicht bestätigt werden. Bitte den Verlauf neu öffnen.');
   return {deleted:1};
  }
  // Removes all but the newest `keep` revisions. Best effort: never throws, never touches other files.
  async prune(keep=this.keep){
   try{
    if(!Number.isInteger(keep)||keep<2)return {deleted:0};
    const old=(await this.revisions()).slice(keep);if(!old.length)return {deleted:0};
    if(!this.info?.[operations.remove[0]])return {deleted:0,error:I.t('Alte Versionen können nicht gelöscht werden.')};
    let deleted=0;
    for(let i=0;i<old.length;i+=100){const batch=old.slice(i,i+100).map(f=>this.folder+'/'+filename(f.revision));await this.request(...operations.remove,{path:batch,recursive:false});deleted+=batch.length;}
    return {deleted};
   }catch(error){return {deleted:0,error:error.message};}
  }
 }
 return {Store,filename,filePattern,operations,validShare,KEEP,FOLDER,DEFAULT_SHARE};
});
