(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.DockerAppsMonitorModel=m;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const I=typeof module==='object'&&module.exports?require('./i18n.js'):globalThis.DockerAppsI18n;
 const numeric=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 const nonnegative=v=>{const n=numeric(v);return n!==null&&n>=0?n:null;};
 const list=(data,key)=>Array.isArray(data)?data:Array.isArray(data?.[key])?data[key]:data&&typeof data==='object'?Object.entries(data).filter(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)&&typeof(v.name??v.Name)==='string').map(([id,v])=>({id,...v})):[];
 const name=v=>String(v??'').replace(/^\//,'').slice(0,128);
 function state(raw){const value=String(raw?.status??raw?.state??raw?.State?.Status??'').toLowerCase();if(raw?.State?.Paused||value==='paused')return 'paused';if(raw?.State?.Running===true||value==='running'||value.startsWith('up '))return 'running';if(['stopped','exited','created','dead'].includes(value)||value.startsWith('exited '))return 'stopped';if(value==='restarting')return 'restarting';return 'unknown';}
 function containers(data){return list(data,'containers').map(v=>({id:String(v.id??v.Id??''),name:name(v.name??v.Name??v.Names?.[0]),image:String(v.image??v.Image??v.Config?.Image??'').slice(0,200),state:state(v),ports:ports(v)})).filter(v=>v.name);}
 function ports(raw,depth=0){
  if(depth>4)return [];if(typeof raw==='string'){if(raw.length>524288)return [];try{raw=JSON.parse(raw);}catch(err){return [];}}if(!raw||typeof raw!=='object')return [];
  const result=[],add=(host,container,protocol='tcp',ip='')=>{host=numeric(host);container=numeric(container);if(!Number.isInteger(host)||host<1||host>65535||String(protocol).toLowerCase()!=='tcp')return;const p={host,container,ip:String(ip)};if(!result.some(v=>v.host===p.host&&v.ip===p.ip))result.push(p);};
  for(const p of [...(Array.isArray(raw?.port_bindings)?raw.port_bindings:[]),...(Array.isArray(raw?.ports)?raw.ports:[]),...(Array.isArray(raw?.Ports)?raw.Ports:[])])add(p.host_port??p.PublicPort,p.container_port??p.PrivatePort,p.type??p.Type??'tcp',p.host_ip??p.IP??'');
  for(const binding of [raw?.NetworkSettings?.Ports,raw?.HostConfig?.PortBindings])for(const [key,values]of Object.entries(binding||{})){const [port,protocol]=key.split('/');for(const v of values||[])add(v.HostPort,port,protocol,v.HostIp);}
  for(const key of ['data','container','profile','config','settings'])if(raw[key])for(const p of ports(raw[key],depth+1))add(p.host,p.container,'tcp',p.ip);
  return result;
 }
 function resourceMap(data){return new Map(list(data,'resources').map(v=>[name(v.name),{cpu:nonnegative(v.cpu),memory:nonnegative(v.memory),memoryPercent:nonnegative(v.memoryPercent)}]));}
 function ioMap(data){const result=new Map();for(const [id,v]of Object.entries(data||{})){
  if(!v||typeof v!=='object')continue;const n=name(v.name??v.Name),net=Object.values(v.networks||{}),block=v.blkio_stats?.io_service_bytes_recursive;
  result.set(n||id,{rx:net.length?net.reduce((a,x)=>a+(nonnegative(x.rx_bytes)||0),0):null,tx:net.length?net.reduce((a,x)=>a+(nonnegative(x.tx_bytes)||0),0):null,read:Array.isArray(block)?block.filter(x=>String(x.op).toLowerCase()==='read').reduce((a,x)=>a+(nonnegative(x.value)||0),0):null,write:Array.isArray(block)?block.filter(x=>String(x.op).toLowerCase()==='write').reduce((a,x)=>a+(nonnegative(x.value)||0),0):null});
 }return result;}
 // Per-second rates from two cumulative counter readings. A missing, reset or implausible reading gives null, never a guess.
 function rates(previous,current,seconds){const result=new Map();if(!(previous instanceof Map)||!(current instanceof Map)||!(seconds>=1&&seconds<=300))return result;
  for(const [key,now]of current){const then=previous.get(key);if(!then)continue;const rate=field=>now[field]===null||then[field]===null||now[field]<then[field]?null:(now[field]-then[field])/seconds;result.set(key,{rx:rate('rx'),tx:rate('tx'),read:rate('read'),write:rate('write')});}
  return result;}
 function system(data){const cpu=data?.cpu||{},mem=data?.memory||{},parts=[cpu.user_load,cpu.system_load,cpu.other_load].map(numeric),memoryPercent=nonnegative(mem.real_usage),memoryTotal=nonnegative(mem.total_real)!==null?nonnegative(mem.total_real)*1024:null,network=Array.isArray(data?.network)?data.network:[],total=network.find(x=>x.device==='total');return {cpu:parts.every(n=>n!==null)?parts.reduce((a,b)=>a+b,0):null,memoryPercent,memoryTotal,memoryUsed:memoryTotal!==null&&memoryPercent!==null&&memoryPercent<=100?memoryTotal*memoryPercent/100:null,network,rxRate:nonnegative(total?.rx),txRate:nonnegative(total?.tx)};}
 function temperature(data){const cpu=nonnegative(data?.cpu_temp??data?.cpu_temperature),system=nonnegative(data?.sys_temp),value=cpu!==null?cpu:system;return {value:value!==null&&value>0&&value<=150?value:null,kind:cpu!==null?'cpu':'system'};}
 function volumeLabel(value){const text=String(value),match=/^(?:\/)?volume[_\s-]*(\d+)$/i.exec(text);return match?'Volume '+Number(match[1]):text;}
 function volumes(data){
  const source=Array.isArray(data)?data:data?.volumes??data?.vol_info??data?.volume_info??data?.storage?.volumes??[];
  const rows=Array.isArray(source)?source:source&&typeof source==='object'?Object.entries(source).map(([id,v])=>({id,...v})):[];
  return rows.filter(v=>v&&typeof v==='object').map(v=>{const size=v.size||{},total=nonnegative(size.total??v.total_size??v.size_total??v.total),used=nonnegative(size.used??v.used_size??v.size_used??v.used);let free=nonnegative(size.free??v.free_size??v.size_free??v.free);if(free===null&&total!==null&&used!==null&&used<=total)free=total-used;
   return {name:volumeLabel(v.display_name??v.name??v.volume_path??v.id??'Volume'),total,free,used:total!==null&&free!==null?total-free:null,percent:total>0&&free!==null?100*(total-free)/total:null};
  }).filter(v=>v.total!==null&&v.free!==null&&v.total>=v.free).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true}));
 }
 function addresses(data){const entries=Array.isArray(data)?data:data?.interfaces??data?.ifaces??data?.netif??[];const result=[];
  for(const row of Array.isArray(entries)?entries:Object.values(entries)){const iface=String(row.id??row.name??row.ifname??'');if(/^(lo$|docker|veth|br-|sit)/i.test(iface))continue;
   for(const candidate of [row.ip,row.ip_address,row.ipv4?.ip,row.ipv4?.address,...(Array.isArray(row.ipv4)?row.ipv4.map(x=>x.address??x.ip):[])]){const ip=String(candidate??'').split('/')[0],parts=ip.split('.');if(parts.length!==4||!parts.every(x=>/^\d{1,3}$/.test(x)&&Number(x)<=255)||['0','127'].includes(parts[0])||(parts[0]==='169'&&parts[1]==='254'))continue;if(!result.includes(ip))result.push(ip);}
  }return result;
 }
 function matchContainer(app,containers,hosts){if(app.containerName)return containers.find(c=>c.name===app.containerName)||null;
  let url;try{url=new URL(app.url);}catch(err){return null;}if(!app.nasHost&&!hosts.includes(url.hostname))return null;
  const choose=items=>items.length===1?items[0]:null,port=Number(url.port||(url.protocol==='https:'?443:80));let match=choose(containers.filter(c=>c.ports.some(p=>p.host===port)));if(match)return match;
  const norm=s=>{s=String(s).toLowerCase().replace(/[^a-z0-9]/g,'');if(['jd','jd2','jdownloader','jdownloader2'].includes(s))return 'jdownloader';if(s==='twonkyserver')return 'twonky';return s;};
  match=choose(containers.filter(c=>norm(c.name)===norm(app.name)));if(match)return match;
  const icon={jd:'catalog:jdownloader',filezilla:'catalog:filezilla',filebot:'catalog:filebot'}[app.icon]||app.icon;
  return icon?.startsWith('catalog:')?choose(containers.filter(c=>guessIcon(c,[])===icon)):null;
 }
 const known=[['jdownloader','jdownloader'],['jd2','jdownloader'],['filezilla','filezilla'],['filebot','filebot'],['twonky','twonky-server'],['tautulli','tautulli'],['deemix','deemix'],['guacamole','apache-guacamole']];
 function guessIcon(container,catalog){const hay=(container.name+' '+container.image).toLowerCase(),match=known.find(([k])=>hay.includes(k));if(match)return 'catalog:'+match[1];const term=container.image.replace(/:.*$/,'').split('/').pop();return catalog.some(x=>x.id===term)?'catalog:'+term:'container';}
 function suggestURL(container,hostname){
  const candidates=container.ports.filter(p=>!['127.0.0.1','::1'].includes(p.ip));
  const preferred=candidates.find(p=>[80,443,5800,8080,8081,8096,9000,8181].includes(p.container))||candidates[0];
  if(!preferred)return '';const host=hostname.includes(':')&&!hostname.startsWith('[')?'['+hostname+']':hostname;return (preferred.container===443?'https':'http')+'://'+host+':'+preferred.host+'/';
 }
 function bytes(value){if(value===null||value===undefined||!Number.isFinite(Number(value)))return '—';let n=Number(value),i=0;const units=['B','KiB','MiB','GiB','TiB'];while(n>=1024&&i<units.length-1){n/=1024;i++;}return n.toLocaleString(I.locale,{maximumFractionDigits:i?1:0})+' '+units[i];}
 return {numeric,containers,ports,resourceMap,ioMap,system,volumes,guessIcon,suggestURL,bytes,state,addresses,matchContainer,temperature,rates};
});
