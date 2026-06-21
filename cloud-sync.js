(function(){
  const CLOUD_URL = 'https://zirimotcujjxfgwpccda.supabase.co';
  const CLOUD_KEY = 'sb_publishable__Lq-nQj8sY_RuDAVxDoUCw_nq3rnPx0';
  const MODULE = /rescis/i.test(document.title) ? 'rescisoes' : 'gestao';
  const STATE_KEY = MODULE + '_v5';
  const DEVICE_ID_KEY = 'ga_device_id';
  const SNAPSHOT_KEY = 'ga_snapshot_' + STATE_KEY;
  const SAVE_DELAY = 900;

  let client = null;
  let ready = false;
  let applyingRemote = false;
  let lastJson = '';
  let timer = null;
  let channel = null;

  function getDeviceId(){
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if(!id){
      id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  }

  const DEVICE_ID = getDeviceId();

  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src=src;
      s.onload=resolve;
      s.onerror=reject;
      document.head.appendChild(s);
    });
  }

  async function ensureClient(){
    if(window.supabase && window.supabase.createClient){
      client = window.supabase.createClient(CLOUD_URL, CLOUD_KEY);
      return client;
    }
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    client = window.supabase.createClient(CLOUD_URL, CLOUD_KEY);
    return client;
  }

  function getUserName(){
    const shellUser = localStorage.getItem('ga_user_name');
    if(shellUser) return shellUser;
    try{
      const sess = sessionStorage.getItem('ga_session');
      if(sess){
        const u = JSON.parse(sess);
        return u.nome || u.login || 'Usuario';
      }
    }catch(e){}
    if(typeof DB !== 'undefined' && DB.currentUser) return DB.currentUser.nome || 'Usuario';
    return localStorage.getItem('ga_user_name') || 'Usuario';
  }

  function getState(){
    if(typeof S !== 'undefined') return S;
    if(typeof DB !== 'undefined') return DB;
    return null;
  }

  function setState(next){
    applyingRemote = true;
    try{
      if(MODULE === 'rescisoes' && typeof S !== 'undefined'){
        S = Object.assign({}, S, next || {});
        try{ localStorage.setItem('ga_v3', JSON.stringify(S)); }catch(e){}
        if(typeof dadosAno === 'function') dadosAno(S.anoAtivo || 2026);
        if(typeof fixNomeDebora === 'function') fixNomeDebora();
        if(typeof renderAll === 'function') renderAll();
        if(typeof updHeader === 'function') updHeader();
      }
      if(MODULE === 'gestao' && typeof DB !== 'undefined'){
        Object.assign(DB, next || {});
        if(typeof fillCondSelects === 'function') fillCondSelects();
        if(typeof fillChkCondSelects === 'function') fillChkCondSelects();
        if(typeof fillPrestSelects === 'function') fillPrestSelects();
        if(typeof fillRelSelects === 'function') fillRelSelects();
        if(typeof renderUsers === 'function') renderUsers();
        if(typeof updateDashboard === 'function') updateDashboard();
        if(typeof renderManut === 'function'){
          renderManut('imob'); renderManut('cond'); renderManut('ocup'); renderManut('ager');
        }
        if(typeof renderManutHome === 'function') renderManutHome();
        if(typeof renderPrestCards === 'function') renderPrestCards();
        if(typeof renderGlobalChk === 'function') renderGlobalChk();
        if(typeof renderColabs === 'function') renderColabs();
        if(typeof renderFin === 'function') renderFin();
        if(typeof renderAgenda === 'function') renderAgenda();
        if(typeof renderLembretes === 'function') renderLembretes();
        if(typeof renderTasks === 'function') renderTasks();
        if(typeof renderProcHist === 'function') renderProcHist();
      }
    }finally{
      setTimeout(()=>{ applyingRemote=false; }, 150);
    }
  }

  function showStatus(text, ok){
    let el = document.getElementById('ga-cloud-status');
    if(!el){
      el = document.createElement('div');
      el.id='ga-cloud-status';
      el.style.cssText='position:fixed;right:12px;bottom:10px;z-index:999999;background:#0f172a;color:#fff;border-radius:999px;padding:6px 10px;font:11px Arial;box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:.86';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.background = ok ? '#14532d' : '#7f1d1d';
  }

  async function audit(action, detail){
    if(!client) return;
    try{
      await client.from('ga_historico_nuvem').insert({
        modulo: MODULE,
        usuario_nome: getUserName(),
        acao: action,
        detalhe: detail,
        dispositivo: DEVICE_ID
      });
    }catch(e){}
  }

  async function snapshotIfNeeded(state){
    if(!client || !state) return;
    const today = new Date().toISOString().slice(0,10);
    const last = localStorage.getItem(SNAPSHOT_KEY);
    if(last === today) return;
    try{
      await client.from('ga_app_snapshots').insert({
        key: STATE_KEY,
        value: state,
        snapshot_date: today,
        created_by: getUserName(),
        device_id: DEVICE_ID
      });
      localStorage.setItem(SNAPSHOT_KEY, today);
    }catch(e){}
  }

  async function pushState(reason){
    if(!ready || applyingRemote || !client) return;
    const state = getState();
    if(!state) return;
    const json = JSON.stringify(state);
    if(json === lastJson) return;
    lastJson = json;
    try{
      await client.from('ga_app_state').upsert({
        key: STATE_KEY,
        value: state,
        updated_by: getUserName(),
        device_id: DEVICE_ID,
        updated_at: new Date().toISOString()
      });
      await snapshotIfNeeded(state);
      await audit('save', reason || 'Alterou dados');
      showStatus('Nuvem sincronizada', true);
    }catch(e){
      showStatus('Nuvem sem conexão', false);
      console.error('Erro ao salvar na nuvem:', e);
    }
  }

  function scheduleSave(reason){
    clearTimeout(timer);
    timer = setTimeout(()=>pushState(reason), SAVE_DELAY);
  }

  async function pullState(){
    const {data,error} = await client.from('ga_app_state').select('value,device_id').eq('key', STATE_KEY).maybeSingle();
    if(error) throw error;
    if(data && data.value){
      setState(data.value);
      lastJson = JSON.stringify(getState());
    }else{
      await pushState('Criou estado inicial na nuvem');
    }
  }

  async function exportCloudBackup(){
    const state = getState();
    if(!state) return;
    const pack = {
      module: MODULE,
      exported_at: new Date().toISOString(),
      state
    };
    const blob = new Blob([JSON.stringify(pack,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'backup_gralha_azul_' + MODULE + '_' + new Date().toISOString().slice(0,10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  window.gaCloudSave = function(){
    return pushState('Salvamento manual');
  };
  window.gaCloudBackup = exportCloudBackup;

  function addCloudTools(){
    if(window.top !== window.self) return;
    if(document.getElementById('ga-cloud-tools')) return;
    const box = document.createElement('div');
    box.id = 'ga-cloud-tools';
    box.style.cssText = 'position:fixed;right:12px;bottom:44px;z-index:999999;display:flex;gap:6px;font:11px Arial';
    box.innerHTML = '<button type="button" id="ga-cloud-save" style="border:none;border-radius:999px;background:#1e3a5f;color:#fff;padding:6px 10px;cursor:pointer">Salvar nuvem</button><button type="button" id="ga-cloud-backup" style="border:none;border-radius:999px;background:#334155;color:#fff;padding:6px 10px;cursor:pointer">Backup</button>';
    document.body.appendChild(box);
    document.getElementById('ga-cloud-save').onclick = ()=>pushState('Salvamento manual');
    document.getElementById('ga-cloud-backup').onclick = exportCloudBackup;
  }

  function watchChanges(){
    if(MODULE === 'rescisoes'){
      try{
        save = function(){
          try{ localStorage.setItem('ga_v3', JSON.stringify(S)); }catch(e){}
          scheduleSave('Salvou dados');
        };
        loadFromSupabase = async function(){ await pullState(); };
        setupRealtime = function(){ subscribeRealtime(); };
        logEvent = async function(tipo, desc){ await audit(tipo || 'alteracao', desc || 'Alterou dados'); };
      }catch(e){}
    }
    document.addEventListener('change', ()=>scheduleSave('Alterou campo'), true);
    document.addEventListener('click', (e)=>{
      const t=e.target;
      if(!t) return;
      const txt=(t.innerText||t.value||t.title||'').trim();
      if(t.matches('button,.btn,.nav,input[type=checkbox],select') || t.closest('button,.btn,.nav')){
        scheduleSave(txt ? 'Clicou/alterou: '+txt.slice(0,80) : 'Clicou/alterou item');
      }
    }, true);
    setInterval(()=>scheduleSave('Salvamento automático'), 8000);
  }

  function subscribeRealtime(){
    if(channel) return;
    channel = client.channel('ga_app_state_' + STATE_KEY)
      .on('postgres_changes', {event:'*', schema:'public', table:'ga_app_state', filter:'key=eq.'+STATE_KEY}, payload=>{
        const row = payload.new;
        if(!row || row.device_id === DEVICE_ID || !row.value) return;
        setState(row.value);
        lastJson = JSON.stringify(getState());
        showStatus('Atualizado em tempo real', true);
      })
      .subscribe();
  }

  async function boot(){
    try{
      await ensureClient();
      await pullState();
      ready = true;
      subscribeRealtime();
      watchChanges();
      addCloudTools();
      showStatus('Nuvem conectada', true);
      await audit('open', 'Abriu o módulo');
    }catch(e){
      showStatus('Nuvem não configurada', false);
      console.error('Cloud sync não iniciou:', e);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 300);
})();
