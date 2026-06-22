/* Gralha Azul — Premium v2 (experimental). Remova este script para reverter. */
(function(){
  document.body.classList.add('ga-v2');

  var GESTAO_BC={
    dashboard:['Dashboard'],
    'manut-imob':['Dashboard','Manutenções','Imobiliária'],
    'manut-cond':['Dashboard','Manutenções','Condomínios'],
    'manut-ocup':['Dashboard','Manutenções','Imóveis Ocupados'],
    'manut-ager':['Dashboard','Manutenções','Assistente'],
    'manut-agenda':['Dashboard','Agenda'],
    processos:['Dashboard','Processos Administrativos'],
    condominios:['Dashboard','Condomínios'],
    'cond-detail':['Dashboard','Condomínios','Detalhe'],
    financeiro:['Dashboard','Prestadores / Relatórios'],
    'prest-detail':['Dashboard','Prestadores / Relatórios','Detalhe'],
    checklist:['Dashboard','Checklist Operacional'],
    acesso:['Dashboard','Configurações'],
    config:['Dashboard','Configurações'],
    agenda:['Dashboard','Agenda Geral']
  };

  var RESC_BC={
    dash:['Panorama Geral'],
    rescisoes:['Panorama Geral','Rescisões'],
    agenda:['Panorama Geral','Agenda / Prazos'],
    agdiaria:['Panorama Geral','Agenda Diária'],
    cartas:['Panorama Geral','Cartas 30 Dias'],
    manutencoes:['Panorama Geral','Manutenções'],
    sanepar:['Panorama Geral','Sanepar'],
    marketing:['Panorama Geral','Marketing'],
    inadimplentes:['Panorama Geral','Inadimplentes'],
    loft:['Panorama Geral','Casos Loft'],
    juridicos:['Panorama Geral','Jurídicos'],
    relatorio:['Panorama Geral','Relatório'],
    modelos:['Panorama Geral','Modelos de Texto'],
    config:['Panorama Geral','Configurações']
  };

  function ensureSyncPill(){
    var pill=document.getElementById('ga-sync-pill');
    if(pill) return pill;
    pill=document.createElement('div');
    pill.id='ga-sync-pill';
    pill.className='ga-sync-pill ga-sync-ok';
    pill.textContent='Pronto';
    var topbar=document.getElementById('topbar');
    var hdr=document.querySelector('.hdr');
    if(topbar){
      var actions=topbar.querySelector('.ga-topbar-actions');
      if(!actions){
        actions=document.createElement('div');
        actions.className='ga-topbar-actions';
        topbar.appendChild(actions);
      }
      actions.appendChild(pill);
    } else if(hdr){
      hdr.appendChild(pill);
    }
    return pill;
  }

  window.gaSetSync=function(state,msg){
    var pill=ensureSyncPill();
    pill.className='ga-sync-pill ga-sync-'+(state||'ok');
    pill.textContent=msg||'Sincronizado';
  };

  function renderBc(el,parts,onClick){
    if(!el||!parts||!parts.length) return;
    el.innerHTML=parts.map(function(label,i){
      var isLast=i===parts.length-1;
      var html=isLast
        ?'<span class="ga-bc-cur">'+label+'</span>'
        :'<button type="button" class="ga-bc-item" data-bc="'+i+'">'+label+'</button>';
      if(i<parts.length-1) html+='<span class="ga-bc-sep">›</span>';
      return html;
    }).join('');
    el.querySelectorAll('.ga-bc-item').forEach(function(btn){
      btn.addEventListener('click',function(){
        var idx=+btn.getAttribute('data-bc');
        if(typeof onClick==='function') onClick(idx);
      });
    });
  }

  function setupGestaoBc(){
    var bc=document.getElementById('ga-bc');
    if(!bc){
      bc=document.createElement('nav');
      bc.id='ga-bc';
      bc.className='ga-breadcrumb';
      bc.setAttribute('aria-label','Navegação');
      var topbar=document.getElementById('topbar');
      if(topbar) topbar.insertBefore(bc,topbar.firstChild);
    }
    window.gaUpdateGestaoBc=function(id){
      var parts=GESTAO_BC[id]||['Dashboard'];
      renderBc(bc,parts,function(idx){
        if(idx===0&&typeof nav==='function') nav('dashboard');
      });
    };
    if(typeof nav==='function'){
      var _nav=nav;
      window.nav=function(id){
        _nav(id);
        window.gaUpdateGestaoBc(id);
      };
      window.gaUpdateGestaoBc('dashboard');
    }
  }

  function setupRescBc(){
    var bc=document.getElementById('ga-bc-resc');
    if(!bc){
      bc=document.createElement('nav');
      bc.id='ga-bc-resc';
      bc.className='ga-breadcrumb ga-bc-resc';
      bc.setAttribute('aria-label','Navegação');
      var mhd=document.querySelector('.mhd');
      if(mhd) mhd.insertBefore(bc,mhd.firstChild);
    }
    window.gaUpdateRescBc=function(page){
      var parts=RESC_BC[page]||['Panorama Geral'];
      renderBc(bc,parts,function(idx){
        if(idx===0&&typeof go==='function') go('dash',document.querySelector('.nav[onclick*="dash"]'));
      });
    };
    if(typeof go==='function'){
      var _go=go;
      window.go=function(p,el){
        _go(p,el);
        window.gaUpdateRescBc(p);
      };
      window.gaUpdateRescBc(typeof curPage!=='undefined'?curPage:'dash');
    }
  }

  function enhanceToast(){
    var orig=window.toast;
    window.toast=function(msg,type){
      var t=document.getElementById('toast');
      if(!t){
        if(typeof orig==='function') orig(msg);
        return;
      }
      if(!type){
        if(/erro|falha|não encontr|inválid/i.test(msg)) type='error';
        else if(/atenção|aviso|pendente/i.test(msg)) type='warn';
        else if(/salv|conclu|sucesso|export|sincroniz/i.test(msg)) type='success';
        else type='info';
      }
      var icons={success:'✓',error:'✕',warn:'!',info:'i'};
      t.className='show ga-toast-'+type;
      t.innerHTML='<span class="ga-toast-ico">'+(icons[type]||'i')+'</span><span>'+msg+'</span>';
      clearTimeout(window._gaToastT);
      window._gaToastT=setTimeout(function(){t.className='';t.textContent='';},3200);
    };
  }

  function enhanceEmptyStates(){
    document.querySelectorAll('.empty').forEach(function(el){
      if(el.querySelector('.ga-empty-cta')) return;
      var p=el.querySelector('p');
      if(!p) return;
      var txt=(p.textContent||'').toLowerCase();
      var btn=null;
      if(txt.includes('novo chamado')||txt.includes('cadastrado')){
        btn=document.createElement('button');
        btn.className='ga-empty-cta';
        btn.textContent='+ Novo chamado';
        btn.onclick=function(){
          var open=document.querySelector('.sh .btn-p[onclick*="m-new-manut"]');
          if(open) open.click();
        };
      } else if(txt.includes('rescisão')||txt.includes('nenhuma rescis')){
        btn=document.createElement('button');
        btn.className='ga-empty-cta';
        btn.textContent='+ Nova rescisão';
        btn.onclick=function(){
          if(typeof resetRescModal==='function') resetRescModal();
          if(typeof openM==='function') openM('m-resc');
        };
      }
      if(btn) el.appendChild(btn);
    });
  }

  function wrapDashStats(){
    if(typeof updateDashboard!=='function') return;
    var _upd=updateDashboard;
    window.updateDashboard=function(){
      _upd();
      document.querySelectorAll('.stat[id], .stat[onclick]').forEach(function(stat){
        var okEl=stat.querySelector('.stat-val');
        var pendEl=stat.querySelector('.stat-sub');
        if(!okEl||!pendEl) return;
        var ok=parseInt(okEl.textContent,10)||0;
        var pend=parseInt((pendEl.textContent||'').replace(/\D/g,''),10)||0;
        var tot=ok+pend;
        var pct=tot?Math.round(ok/tot*100):0;
        var bar=stat.querySelector('.ga-stat-bar');
        if(!bar){
          bar=document.createElement('div');
          bar.className='ga-stat-bar';
          bar.innerHTML='<div class="pbar"><div class="pfill gr"></div></div><span class="ga-stat-pct"></span>';
          stat.appendChild(bar);
        }
        bar.querySelector('.pfill').style.width=pct+'%';
        bar.querySelector('.ga-stat-pct').textContent=pct+'%';
      });
      enhanceEmptyStates();
    };
  }

  function wrapManutHome(){
    if(typeof renderManutHome!=='function') return;
    var _rm=renderManutHome;
    window.renderManutHome=function(){
      _rm();
      var map=[
        ['mi-cnt','imob'],['mc-cnt','cond'],['mo-cnt','ocup'],['mager-cnt','ager']
      ];
      map.forEach(function(pair){
        var el=document.getElementById(pair[0]);
        if(!el) return;
        var card=el.closest('.mcard');
        if(!card||typeof DB==='undefined') return;
        var arr=DB.manutencoes[pair[1]]||[];
        var ok=arr.filter(function(m){return m.status==='Concluído';}).length;
        var pend=arr.filter(function(m){return m.status!=='Concluído'&&m.status!=='Cancelado';}).length;
        var tot=ok+pend;
        var pct=tot?Math.round(ok/tot*100):0;
        var bar=card.querySelector('.ga-mcard-progress');
        if(!bar){
          bar=document.createElement('div');
          bar.className='ga-mcard-progress';
          bar.innerHTML='<div class="ga-mcard-progress-lbl"></div><div class="pbar"><div class="pfill gr"></div></div>';
          var meta=card.querySelector('.mmeta');
          if(meta) card.insertBefore(bar,meta);
        }
        bar.querySelector('.ga-mcard-progress-lbl').textContent=pct+'% concluído · '+ok+' realizadas · '+pend+' pendentes';
        bar.querySelector('.pfill').style.width=pct+'%';
      });
    };
  }

  function periodBarGestao(){
    var dash=document.getElementById('view-dashboard');
    if(!dash) return;
    var first=dash.querySelector('div[style*="Filtrar"]');
    if(!first||first.classList.contains('ga-period-bar')) return;
    first.classList.add('ga-period-bar');
    var lbl=first.querySelector('div');
    if(lbl) lbl.classList.add('ga-period-lbl');
  }

  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape') return;
    document.querySelectorAll('.moverlay.open,.overlay').forEach(function(o){
      if(o.classList.contains('moverlay')) o.classList.remove('open');
      else if(o.style) o.style.display='none';
    });
  });

  ensureSyncPill();
  enhanceToast();
  if(document.getElementById('topbar')) setupGestaoBc();
  if(document.querySelector('.mhd')) setupRescBc();
  wrapDashStats();
  wrapManutHome();
  periodBarGestao();
  setTimeout(enhanceEmptyStates,800);
  window.gaSetSync('ok','Pronto');
})();
