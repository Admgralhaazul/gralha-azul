(function(){
  function emptyIconKind(msg,ic){
    if(ic) return ic;
    const plain=String(msg||'').replace(/<[^>]*>/g,'').trim();
    if(/^Sem\b/i.test(plain)||/sem pendências|tudo em dia|sem vencimentos|sem itens|sem dados|sem alertas/i.test(plain)) return 'check';
    return 'doc';
  }
  window.emptyHtml=function(msg,ic){
    return `<div class="empty"><div class="empty-mark icon-${emptyIconKind(msg,ic)}"></div><p>${msg}</p></div>`;
  };
  window.applyEmptySemIcons=function(root){
    (root||document).querySelectorAll('.empty').forEach(el=>{
      const mark=el.querySelector('.empty-mark');
      if(!mark||[...mark.classList].some(c=>c.startsWith('icon-'))) return;
      const txt=(el.textContent||'').trim();
      mark.classList.add(/^Sem\b/i.test(txt)||/sem pendências|tudo em dia/i.test(txt)?'icon-check':'icon-doc');
    });
  };
})();
