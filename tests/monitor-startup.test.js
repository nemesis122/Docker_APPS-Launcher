'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/app/ui/monitor.js'),'utf8');
function boot({saved=null,blocked=false,hidden=false,user='browser'}={}){
 const nodes=new Map(),events=new Map(),calls=[],writes=[];
 function node(id){if(!nodes.has(id))nodes.set(id,{textContent:'',hidden:false,checked:false,addEventListener(type,fn){events.set(id+':'+type,fn);}});return nodes.get(id);}
 const document={hidden,documentElement:{dataset:{}},getElementById:node,querySelectorAll:()=>[],querySelector:()=>node('system-bar'),dispatchEvent(){},addEventListener(type,fn){events.set(type,fn);}};
 const window={addEventListener(){},_S:key=>key==='username'?user:null};window.parent=window;window.top=window;
 const sandbox={document,window,location:{hostname:'nas.example',origin:'http://nas.example'},localStorage:{getItem(key){if(blocked)throw Error('blocked');assert.equal(key,'docker-apps.live:'+user);return saved;},setItem(key,value){writes.push([key,value]);}},DockerAppsI18n:{literal:x=>x,t:x=>x},DockerAppsModel:{escape:String},DockerAppsMonitorModel:{},DockerAppsDSM:{Client:class{call(operation){calls.push(operation);return new Promise(()=>{});}}},Event:class{},AbortController,setTimeout:()=>1,clearTimeout(){},console};
 vm.runInNewContext(source,sandbox);
 return {node,document,events,calls,writes};
}
for(const [name,options,enabled]of [['first launch',{},true],['saved on',{saved:'true'},true],['saved off',{saved:'false'},false],['blocked storage',{blocked:true},true]])test(name+': switch and polling agree',()=>{
 const app=boot(options);assert.equal(app.node('live-toggle').checked,enabled);assert.equal(app.calls.length,enabled?1:0);assert.equal(app.document.documentElement.dataset.liveState,enabled?'connecting':'off');assert.deepEqual(app.writes,[]);
});
test('hidden startup pauses polling and resumes when visible',()=>{const app=boot({hidden:true});assert.equal(app.node('live-toggle').checked,true);assert.equal(app.calls.length,0);assert.equal(app.document.documentElement.dataset.liveState,'paused');app.document.hidden=false;app.events.get('visibilitychange')();assert.deepEqual(app.calls,['containers']);});
test('switch stores the account preference and keeps disabled on reload',()=>{const app=boot({user:'alice'});app.node('live-toggle').checked=false;app.events.get('live-toggle:change')();assert.deepEqual(app.writes,[['docker-apps.live:alice','false']]);assert.equal(app.document.documentElement.dataset.liveState,'off');assert.equal(boot({saved:app.writes[0][1],user:'alice'}).node('live-toggle').checked,false);});
