(function(){
  function emptyIconKind(msg,ic){
    if(ic) return ic;
    return 'check';
  }
  window.emptyHtml=function(msg,ic){
    return `<div class="empty"><div class="empty-mark icon-${emptyIconKind(msg,ic)}"></div><p>${msg}</p></div>`;
  };
  window.applyEmptySemIcons=function(root){
    (root||document).querySelectorAll('.empty').forEach(el=>{
      const mark=el.querySelector('.empty-mark');
      if(!mark) return;
      if([...mark.classList].some(c=>c.startsWith('icon-'))) return;
      mark.classList.add('icon-check');
    });
  };
})();
