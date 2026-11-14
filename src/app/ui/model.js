(function(root,factory){const catalog=typeof module==='object'&&module.exports?require('./icon-catalog.js'):root.DockerAppsIcons;const model=factory(catalog);if(typeof module==='object'&&module.exports)module.exports=model;else root.DockerAppsModel=model;})(typeof globalThis!=='undefined'?globalThis:this,function(catalog){
  'use strict';
  const I=typeof module==='object'&&module.exports?require('./i18n.js'):globalThis.DockerAppsI18n;
  const categories=['Downloads','Dateien','Medien','Tools','Andere'];
  const icons=['jd','filezilla','filebot','container','terminal','media','cloud','tools'];
  const iconLibrary=Array.isArray(catalog?.items)?catalog.items:[],catalogById=new Map(iconLibrary.map(item=>[item.id,item]));
  function catalogIcon(value){const legacy={jd:'jdownloader',filezilla:'filezilla',filebot:'filebot'},id=String(value||'').startsWith('catalog:')?String(value).slice(8):legacy[value];return id?catalogById.get(id)||null:null;}
  const popular=['docker','jdownloader','filezilla','filebot','twonky-server','deemix','tautulli','apache-guacamole','jellyfin','plex','sonarr','radarr','prowlarr','lidarr','bazarr','qbittorrent','transmission','sabnzbd','home-assistant','nextcloud','immich','photoprism','portainer','nginx-proxy-manager','traefik','adguard-home','pi-hole','uptime-kuma','vaultwarden','bitwarden','postgresql','mariadb','redis','homepage','homarr','heimdall','bookstack','paperless-ngx','gitea','gitlab','code-server','apache-guacamole','kavita','calibre-web'];
  const popularRank=new Map(popular.map((id,index)=>[id,index]));
  function findIcons(query='',group=''){const term=String(query).trim().toLowerCase(),items=iconLibrary.filter(item=>(!group||item.group===group)&&(!term||(item.name+' '+item.id+' '+item.tags).toLowerCase().includes(term)));if(!term)items.sort((a,b)=>(popularRank.get(a.id)??99999)-(popularRank.get(b.id)??99999));return items;}
  const defaults=[];
  // Categories: the five built-in names stay canonical (German keys, translated for display); any other non-empty name is a custom category.
  function cleanCategory(value){const text=String(value??'').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,40);return text||'Andere';}
  function categoryList(entries){const custom=[...new Set((entries||[]).map(e=>e.category).filter(c=>c&&!categories.includes(c)))].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));return [...categories.slice(0,-1),...custom,'Andere'];}
  // nasHost: the stored URL stays a complete, valid address (older versions keep working); only the host name is swapped when opening.
  function resolveURL(entry,hostname){if(!entry?.nasHost||!hostname)return entry.url;try{const url=new URL(entry.url);url.hostname=hostname;return url.href;}catch(error){return entry.url;}}
  function sort(entries,mode){const list=entries.slice(),byName=(a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true});if(mode==='name')return list.sort(byName);if(mode==='category'){const order=categoryList(entries),rank=new Map(order.map((c,i)=>[c,i]));return list.sort((a,b)=>(rank.get(a.category)-rank.get(b.category))||byName(a,b));}return list;}
  function move(entries,id,index){const list=entries.slice(),from=list.findIndex(e=>e.id===id);if(from<0)return list;const [item]=list.splice(from,1),target=Math.max(0,Math.min(list.length,Number.isInteger(index)?index:list.length));list.splice(target,0,item);return list;}
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function normalizeURL(raw){
    let input=String(raw||'').trim();
    if(/^(javascript|vbscript|data|file|blob|about|ftp|ws|wss):/i.test(input))throw Error(I.literal('Nur HTTP- und HTTPS-Adressen sind erlaubt.'));
    if(!input||input.length>2048||/[\u0000-\u0020]/.test(input))throw Error(I.literal('Bitte eine gültige HTTP- oder HTTPS-Adresse ohne Leerzeichen eingeben.'));
    if(!/^https?:\/\//i.test(input)){
      if(/^[a-z][a-z0-9+.-]*:/i.test(input)&&!/^([a-z0-9.-]+|\[[a-f0-9:]+\]):[0-9]+(?:\/|$)/i.test(input))throw Error(I.literal('Nur HTTP- und HTTPS-Adressen sind erlaubt.'));
      input='http://'+input;
    }
    let url;try{url=new URL(input);}catch(error){throw Error(I.literal('Diese Adresse ist ungültig. Beispiel: http://nas.example:8080'));}
    if(!['http:','https:'].includes(url.protocol)||!url.hostname)throw Error(I.literal('Nur HTTP- und HTTPS-Adressen sind erlaubt.'));
    if(url.username||url.password)throw Error(I.literal('Bitte keine Benutzernamen oder Passwörter in der Adresse speichern.'));
    return url.href;
  }
  function clean(entry,index=0){
    if(!entry||typeof entry!=='object')throw Error(I.literal('Ungültiger Anwendungseintrag.'));
    const name=String(entry.name||'').trim().slice(0,80);if(!name)throw Error(I.literal('Bitte einen Namen eingeben.'));
    const id=/^[a-z0-9_-]{1,80}$/i.test(String(entry.id||''))?String(entry.id):'app-'+Date.now().toString(36)+'-'+index+'-'+Math.random().toString(36).slice(2,8);
    return {id,name,url:normalizeURL(entry.url),category:cleanCategory(entry.category),icon:icons.includes(entry.icon)||(typeof entry.icon==='string'&&entry.icon.startsWith('catalog:')&&catalogById.has(entry.icon.slice(8)))?entry.icon:'container',description:String(entry.description||'').trim().slice(0,160),...(typeof entry.containerName==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(entry.containerName)?{containerName:entry.containerName}:{}),...(entry.nasHost===true?{nasHost:true}:{})};
  }
  function validate(entries){if(!Array.isArray(entries)||entries.length>250)throw Error(I.literal('Die Datei muss eine Liste mit höchstens 250 Anwendungen enthalten.'));const used=new Set();return entries.map((entry,i)=>{const result=clean(entry,i),base=result.id;let suffix=i;while(used.has(result.id))result.id=base+'-'+suffix++;used.add(result.id);return result;});}
  function filter(entries,search,category){const term=String(search||'').trim().toLowerCase();return entries.filter(entry=>(!category||entry.category===category)&&(!term||(entry.name+' '+entry.description+' '+entry.category+' '+entry.url).toLowerCase().includes(term)));}
  function importData(text){if(text.length>262144)throw Error(I.literal('Die Sicherungsdatei ist zu groß.'));let data;try{data=JSON.parse(text);}catch(error){throw Error(I.literal('Die Datei ist keine gültige JSON-Sicherung.'));}if(Array.isArray(data))return validate(data);if(['docker-apps','docker-apps-shared'].includes(data?.format)&&data.version===1)return validate(data.apps);throw Error(I.literal('Diese Datei ist keine Docker-Apps-Sicherung.'));}
  function merge(current,imported){const next=current.map(entry=>({...entry}));for(const entry of imported){const index=next.findIndex(e=>e.id===entry.id);if(index<0)next.push(entry);else next[index]=entry;}return validate(next);}
  return {categories,icons,defaults,escape,normalizeURL,clean,validate,filter,importData,merge,iconLibrary,catalogIcon,findIcons,cleanCategory,categoryList,resolveURL,sort,move};
});
