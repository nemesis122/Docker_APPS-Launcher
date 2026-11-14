Ext.ns('DOCKERAPPS');
Ext.define('DOCKERAPPS.AppInstance',{extend:'SYNO.SDS.AppInstance',appWindowName:'DOCKERAPPS.AppWindow',constructor:function(){this.callParent(arguments);}});
Ext.define('DOCKERAPPS.AppWindow',{
  extend:'SYNO.SDS.AppWindow',
  notifyMonitor:function(visible){var frame=this.body&&this.body.dom.querySelector('iframe');if(frame&&frame.contentWindow)frame.contentWindow.postMessage({type:'docker-apps:visibility',visible:visible},window.location.origin);},
  constructor:function(config){DOCKERAPPS.StyleFix.run(window);this.callParent([Ext.apply({title:'Docker Apps __VERSION__',width:1000,height:670,minWidth:620,minHeight:430,resizable:true,maximizable:true,minimizable:true,layout:'fit',border:false,listeners:{minimize:function(){this.notifyMonitor(false);},hide:function(){this.notifyMonitor(false);},deactivate:function(){this.notifyMonitor(false);},show:function(){this.notifyMonitor(true);},activate:function(){this.notifyMonitor(true);}},items:[{xtype:'box',autoEl:{tag:'iframe',src:'/webman/3rdparty/docker-apps/ui/v__VERSION__/index.html?launch='+Date.now(),frameborder:'0',style:'width:100%;height:100%;border:0;'}}]},config)]);}
});
