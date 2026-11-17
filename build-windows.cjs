// Dependency-free Node build for the same SPK layout as build.sh.
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto');
const root=__dirname,version=fs.readFileSync(path.join(root,'VERSION'),'utf8').trim();
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Invalid VERSION');
// Monotonic for supported major.minor.patch versions; never reuse build zero.
const parts=version.split('.').map(Number),packageBuild=parts[0]*1000000+parts[1]*1000+parts[2];
if(parts[1]>999||parts[2]>999||!Number.isSafeInteger(packageBuild)||packageBuild<1||packageBuild>2147483647)throw Error('VERSION exceeds DSM build-number range');
const build=path.join(root,'build'),stage=path.join(build,'stage','app'),spk=path.join(build,'spk'),dist=path.join(root,'dist');
if(path.resolve(build)!==path.join(path.resolve(root),'build')||path.dirname(build)!==root||path.basename(build)!=='build')throw Error('Unexpected build directory');
fs.rmSync(build,{recursive:true,force:true});
fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(spk,{recursive:true});fs.mkdirSync(dist,{recursive:true});
fs.cpSync(path.join(root,'src/app'),stage,{recursive:true});
fs.copyFileSync(path.join(root,'LICENSE'),path.join(stage,'ui','licenses','GPL-3.0.txt')); // source licence, shown in the app
fs.renameSync(path.join(stage,'ui'),path.join(stage,'ui-temp'));
fs.mkdirSync(path.join(stage,'ui'),{recursive:true});fs.renameSync(path.join(stage,'ui-temp'),path.join(stage,'ui','v'+version));
for(const name of ['wrapper','bootstrap'])fs.renameSync(path.join(stage,name+'.js'),path.join(stage,name+'-'+version+'.js'));
function walk(dir,prefix=''){return fs.readdirSync(dir).sort().flatMap(name=>{const rel=prefix+name,full=path.join(dir,name);return fs.statSync(full).isDirectory()?[{name:rel+'/',full,dir:true},...walk(full,rel+'/')]:[{name:rel,full,dir:false}];});}
// DSM's extensionless `config` is as important as HTML/JS. Replace the marker
// wherever it occurs, without rewriting unrelated binaries or text files.
for(const f of walk(stage))if(!f.dir){const bytes=fs.readFileSync(f.full);if(bytes.includes(Buffer.from('__VERSION__')))fs.writeFileSync(f.full,bytes.toString('utf8').replaceAll('__VERSION__',version));}
const config=JSON.parse(fs.readFileSync(path.join(stage,'config'),'utf8'));
for(const file of Object.keys(config))if(!fs.existsSync(path.join(stage,file)))throw Error('DSM config references missing file: '+file);
for(const f of walk(stage))if(!f.dir&&fs.readFileSync(f.full).includes(Buffer.from('__VERSION__')))throw Error('Unresolved version marker in '+f.name);
const epoch=Number(process.env.SOURCE_DATE_EPOCH||1793617200);
function pack(items){const chunks=[];for(const item of items){const data=item.dir?Buffer.alloc(0):item.data??fs.readFileSync(item.full);const h=Buffer.alloc(512);let name=item.name;
 const bytes=Buffer.byteLength(name);if(bytes>100){const slash=name.lastIndexOf('/',name.length-2);const prefix=name.slice(0,slash);name=name.slice(slash+1);if(Buffer.byteLength(name)>100||Buffer.byteLength(prefix)>155)throw Error('Tar path too long');h.write(prefix,345,155);}
 h.write(name,0,100);const oct=(v,start,len)=>h.write(v.toString(8).padStart(len-1,'0')+'\0',start,len,'ascii');
 oct(item.dir||item.executable?0o755:0o644,100,8);oct(0,108,8);oct(0,116,8);oct(data.length,124,12);oct(epoch,136,12);h.fill(32,148,156);h[156]=item.dir?53:48;h.write('ustar\0',257,6);h.write('00',263,2);const sum=h.reduce((a,b)=>a+b,0);h.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8,'ascii');chunks.push(h,data,Buffer.alloc((512-data.length%512)%512));}
 chunks.push(Buffer.alloc(1024));return Buffer.concat(chunks);}
const payload=zlib.gzipSync(pack([{name:'app/',dir:true},...walk(stage).map(f=>({...f,name:'app/'+f.name}))]),{level:9,mtime:0});
fs.cpSync(path.join(root,'spk'),spk,{recursive:true});fs.writeFileSync(path.join(spk,'package.tgz'),payload);
let info=fs.readFileSync(path.join(spk,'INFO'),'utf8').replaceAll('__VERSION__',version).replaceAll('__BUILD__',String(packageBuild)).replaceAll('__CHECKSUM__',crypto.createHash('md5').update(payload).digest('hex'));
fs.writeFileSync(path.join(spk,'INFO'),info);
let members=walk(spk).map(f=>({...f,executable:f.name.startsWith('scripts/')}));members.sort((a,b)=>{const rank=n=>n==='INFO'?0:n==='package.tgz'?1:2;return rank(a.name)-rank(b.name)||a.name.localeCompare(b.name);});
const name='docker-apps-monitor_noarch-'+version+'-'+packageBuild+'.spk';const data=pack(members);fs.writeFileSync(path.join(dist,name),data);
const hash=crypto.createHash('sha256').update(data).digest('hex');fs.writeFileSync(path.join(dist,'SHA256SUMS-'+version+'.txt'),hash+'  '+name+'\n');console.log(name+' '+hash);
