(function(){
 'use strict';
 const I=DockerAppsI18n,$=id=>document.getElementById(id),root=document.documentElement;
 let account='browser';for(const w of [window.parent,window.top])try{const user=typeof w._S==='function'&&w._S('username');if(typeof user==='string'&&user){account=user;break;}}catch(e){}
 const viewKey='docker-apps.view:'+account,summaryKey='docker-apps.summary-collapsed:'+account;
 const read=k=>{try{return localStorage.getItem(k);}catch(e){return null;}},save=(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}};
 function labelCards(){for(const card of $('grid').querySelectorAll('.app-card')){const main=card.querySelector('.card-main');main.title=card.dataset.appName;main.setAttribute('aria-label',card.dataset.appName+' · '+I.t(root.dataset.view==='icons'?'Details':'Öffnen'));}}
 function applyView(){const saved=read(viewKey),view=['tiles','list','icons'].includes(saved)?saved:'tiles';root.dataset.view=view;$('view-mode').value=view;$('tile-size').disabled=view!=='tiles';labelCards();}
 function applySummary(){const collapsed=read(summaryKey)!=='false';root.dataset.summaryCollapsed=String(collapsed);$('summary-toggle').setAttribute('aria-expanded',String(!collapsed));$('summary-toggle').textContent=I.t(collapsed?'Systemdetails':'Systemdetails ausblenden');}
 $('view-mode').addEventListener('change',()=>{save(viewKey,$('view-mode').value);applyView();});
 $('summary-toggle').addEventListener('click',()=>{save(summaryKey,String(root.dataset.summaryCollapsed!=='true'));applySummary();});
 const dialog=document.createElement('dialog');dialog.id='app-details';dialog.setAttribute('aria-labelledby','details-name');
 dialog.innerHTML='<div class="dialog-heading"><h2 id="details-name"></h2><button type="button" class="close" aria-label="'+I.t('Schließen')+'">×</button></div><div class="form-body"><p id="details-description"></p><a id="details-address" target="_blank" rel="noopener noreferrer"></a><div id="details-metrics"></div></div><div class="dialog-actions"><button id="details-edit" type="button">'+I.t('Bearbeiten')+'</button><span class="spacer"></span><a id="details-open" class="open" target="_blank" rel="noopener noreferrer">'+I.t('Öffnen ↗')+'</a></div>';
 document.body.append(dialog);let selectedId=null;
 function selectedCard(){return [...$('grid').querySelectorAll('.app-card')].find(c=>c.querySelector('[data-edit]')?.dataset.edit===selectedId);}
 function refreshDetails(){if(!dialog.open)return;const card=selectedCard();if(!card){dialog.close();return;}$('details-name').textContent=card.dataset.appName;$('details-description').textContent=card.querySelector('.app-description').textContent;$('details-address').textContent=card.dataset.appUrl;for(const id of ['details-address','details-open'])$(id).href=card.querySelector('.card-main').href;const metrics=card.querySelector('.container-metrics');$('details-metrics').replaceChildren(...(metrics&&!metrics.hidden?[metrics.cloneNode(true)]:[]));}
 dialog.querySelector('.close').addEventListener('click',()=>dialog.close());
 $('details-edit').addEventListener('click',()=>{const button=selectedCard()?.querySelector('[data-edit]');dialog.close();button?.click();});
 $('grid').addEventListener('click',event=>{const main=event.target.closest('.card-main');if(root.dataset.view!=='icons'||!main||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();selectedId=main.closest('.app-card').querySelector('[data-edit]').dataset.edit;dialog.showModal();refreshDetails();});
 new MutationObserver(refreshDetails).observe($('grid'),{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden']});
 window.addEventListener('storage',e=>{if(e.key===viewKey)applyView();if(e.key===summaryKey)applySummary();});
 document.addEventListener('docker-apps:render',labelCards);
 applyView();applySummary();
})();
