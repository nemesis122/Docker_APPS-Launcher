(function(root){
  'use strict';
  const NS=root.DOCKERAPPS=root.DOCKERAPPS||{};
  function StyleFix(){}
  StyleFix.run=function(win){
    let removed=0;
    try{
      const origin=win.location.origin,doc=win.document;
      for(const link of Array.from(doc.querySelectorAll('link[rel~="stylesheet"][href]'))){
        const url=new URL(link.getAttribute('href'),doc.baseURI);
        if(url.origin===origin&&url.pathname==='/webman/3rdparty/docker-apps/style.css'){
          link.disabled=true;link.remove();removed++;
        }
      }
      if(removed)win.dispatchEvent(new win.Event('resize'));
    }catch(error){/* A different origin is never modified. */}
    return removed;
  };
  NS.StyleFix=StyleFix;
  StyleFix.run(root.parent===root?root:root.parent);
})(window);
