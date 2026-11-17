(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.DockerAppsDSM=m;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const I=typeof module==='object'&&module.exports?require('./i18n.js'):globalThis.DockerAppsI18n;
 // Closed operation table. Caller-provided API names, methods and URL paths are never accepted.
 const operations=Object.freeze({
  discovery:{api:'SYNO.API.Info',method:'query',version:1},
  containers:{api:'SYNO.Docker.Container',method:'list',version:1,params:{limit:-1,offset:0,type:'all'}},
  resources:{api:'SYNO.Docker.Container.Resource',method:'get',version:1},
  stats:{api:'SYNO.Docker.Container',method:'stats',version:1},
  detail:{api:'SYNO.Docker.Container',method:'get',version:1},
  profile:{api:'SYNO.Docker.Container.Profile',method:'get',version:1},
  system:{api:'SYNO.Core.System.Utilization',method:'get',version:1},
  hardware:{api:'SYNO.Core.System',method:'info',version:3},
  network:{api:'SYNO.Core.Network.Interface',method:'list',version:1},
  storage:{api:'SYNO.Storage.CGI.Storage',method:'load_info',version:1},
  volumes:{api:'SYNO.Core.Storage.Volume',method:'list',version:1}
 });
 const namespaces=[...new Set(Object.values(operations).map(x=>x.api))].join(',');
 function token(win){for(const w of [win,win?.parent,win?.top])try{const t=w?.SYNO?.SDS?.Session?.SynoToken??w?.SYNO?.SDS?.SynoToken??(typeof w?._S==='function'?w._S('SynoToken'):null);if(typeof t==='string'&&/^[A-Za-z0-9._~-]{1,2048}$/.test(t))return t;}catch(e){}return '';}
 class Client{
  constructor({fetcher=globalThis.fetch.bind(globalThis),getToken=()=>token(globalThis.window)}={}){this.fetcher=fetcher;this.getToken=getToken;this.info=null;}
  async call(operation,argument,signal){
   if(!Object.hasOwn(operations,operation))throw Error(I.literal('Dieser Zugriff ist nicht freigegeben.'));
   const def=operations[operation];if(operation!=='discovery'&&!this.info)await this.discover(signal);
   const info=this.info?.[def.api];if(operation!=='discovery'&&!info)throw Error(def.api+I.literal(' ist auf diesem DSM nicht verfügbar.'));
   // Use only a validated same-origin path underneath /webapi/. No credentials leave DSM.
   const path=String(info?.path||'entry.cgi');if(!/^[A-Za-z0-9_/-]+\.cgi$/.test(path)||path.split('/').includes('..')||path.startsWith('/'))throw Error(I.literal('Ungültiger DSM-API-Pfad.'));
   const minimum=Number.isInteger(info?.minVersion)?info.minVersion:1,maximum=Number.isInteger(info?.maxVersion)?info.maxVersion:def.version;
   const version=Math.max(minimum,Math.min(def.version,maximum));
   const body=new URLSearchParams({api:def.api,version:String(version),method:def.method,...def.params});
   if(operation==='discovery')body.set('query',namespaces);
   if(['detail','profile'].includes(operation)){if(typeof argument!=='string'||!/^\/?[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(argument))throw Error(I.literal('Ungültiger Containername.'));body.set('name',argument.replace(/^\//,''));}
   if(info?.requestFormat==='JSON')for(const key of [...Object.keys(def.params||{}),...(['detail','profile'].includes(operation)?['name']:[])]){const raw=key==='name'?argument.replace(/^\//,''):def.params[key];body.set(key,JSON.stringify(raw));}
   const auth=this.getToken(),headers={'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'application/json'};if(auth)headers['X-SYNO-TOKEN']=auth;
   const response=await this.fetcher('/webapi/'+path,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers,body:body.toString(),signal});
   if(!response.ok)throw Error(I.literal('DSM antwortet mit HTTP ')+response.status+'.');
   const result=await response.json();if(result.success!==true){const code=result.error?.code;if([105,106,107,119].includes(code))throw Object.assign(Error(I.literal('DSM-Sitzung oder Berechtigung fehlt (Code ')+code+I.literal('). Bitte neu anmelden und Container-Manager-Rechte prüfen.')),{code});throw Error(I.literal('DSM-Schnittstelle nicht verfügbar (Code ')+(code??I.literal('unbekannt'))+').');}
   return result.data;
  }
  async discover(signal){const info=await this.call('discovery',null,signal);if(!info||typeof info!=='object')throw Error(I.literal('DSM liefert keine API-Liste.'));this.info=info;return info;}
 }
 return {Client,operations,token};
});
