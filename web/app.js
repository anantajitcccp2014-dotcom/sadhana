(function(){
  var App = window.App || null; // мост к Android (MainActivity.Bridge); в обычном браузере его нет
  function $(id){ return document.getElementById(id); }
  function pad(n){ return (n<10?'0':'')+n; }
  function each(list, fn){ Array.prototype.forEach.call(list, fn); }
  function extend(){ var o={}; for(var i=0;i<arguments.length;i++){ var s=arguments[i]; if(s) for(var k in s) if(Object.prototype.hasOwnProperty.call(s,k)) o[k]=s[k]; } return o; }
  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function esc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function keyOf(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function fromKey(k){ var p=k.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function addDays(k,n){ var d=fromKey(k); d.setDate(d.getDate()+n); return keyOf(d); }
  function hm(iso){ if(!iso) return null; var d=new Date(iso); return pad(d.getHours())+':'+pad(d.getMinutes()); }
  function fmtDur(min){ if(min==null||!isFinite(min)||min<=0) return '—'; min=Math.round(min); return Math.floor(min/60)+' ч '+pad(min%60); }
  function closestAttr(el, attr, stop){ while(el && el!==stop && el.getAttribute && el.getAttribute(attr)==null) el=el.parentNode; return (el && el!==stop && el.getAttribute) ? el : null; }
  var DOW = ['вс','пн','вт','ср','чт','пт','сб'];
  var MON = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var CUTOFF = 5; // отбой до 5:00 считается вечером предыдущего дня
  var COLORS = ['dawn','night','tulsi','rose','teal'];
  var TYPE_NAME = {counter:'счётчик', timer:'таймер', check:'отметка'};

  // ---------- состояние ----------
  // practices: [{id, name, type:'counter'|'timer'|'check', color, goal, unit, steps:[1,4,8], hidden}]
  // days[k] = {date, wake, sleep, v:{ <id>: число | {min, start, ses:[{from,min}]} | ISO-время отметки }}
  function defaultPractices(){ return [
    {id:'japa',  name:'Джапа',           type:'counter', color:'tulsi', goal:16, unit:'кругов', steps:[1,4,8]},
    {id:'read',  name:'Чтение книг',     type:'timer',   color:'dawn'},
    {id:'sloka', name:'Повторение шлок', type:'timer',   color:'night'}
  ]; }
  var state = {sleepOn:true, practices:defaultPractices(), welcomed:false};
  var days = {};
  function todayKey(){ return keyOf(new Date()); }
  var cur = todayKey(), lastToday = cur;

  function pById(id){ for(var i=0;i<state.practices.length;i++) if(state.practices[i].id===id) return state.practices[i]; return null; }
  function visible(){ return state.practices.filter(function(p){ return !p.hidden; }); }
  function day(k){ return days[k] || {date:k, wake:null, sleep:null, v:{}}; }
  function val(k,id){ var v=day(k).v; return v ? v[id] : undefined; }
  function tv(k,id){ var t=val(k,id); return (t && typeof t==='object') ? t : {min:0, start:null, ses:[]}; }

  // записи из первой версии (japa, readMin, readStart, sessions, sloka…) → новая схема
  function migrateDay(d){
    if(!d || !d.date) return null;
    if(d.v) return d;
    var v={};
    if(d.japa) v.japa=d.japa;
    if(d.readMin || d.readStart || (d.sessions && d.sessions.length)) v.read={min:d.readMin||0, start:d.readStart||null, ses:d.sessions||[]};
    if(d.slokaMin || d.slokaStart || (d.slokaSessions && d.slokaSessions.length)) v.sloka={min:d.slokaMin||0, start:d.slokaStart||null, ses:d.slokaSessions||[]};
    return {date:d.date, wake:d.wake||null, sleep:d.sleep||null, v:v};
  }

  function setStatus(t,err){ each([$('status'),$('status2')], function(s){ s.textContent=t||''; s.className='status'+(err?' err':''); }); }

  // ---------- хранение ----------
  var LSK = 'sadhana-v1';
  function snapshot(){ var list=[]; for(var k in days) list.push(days[k]); return JSON.stringify({app:'sadhana', version:2, sleepOn:state.sleepOn, welcomed:state.welcomed, practices:state.practices, days:list}); }
  function loadAll(){
    var raw=null;
    try{ raw = App ? App.load() : localStorage.getItem(LSK); }catch(e){}
    if(!raw) return false;
    try{
      var o=JSON.parse(raw);
      if(o.practices && o.practices.length!=null){ state.practices=o.practices; }
      else { state.welcomed=true; var j=pById('japa'); if(o.goal && j) j.goal=o.goal; } // данные первой версии
      if(o.sleepOn===false) state.sleepOn=false;
      if(o.welcomed) state.welcomed=true;
      (o.days||[]).forEach(function(d){ d=migrateDay(d); if(d) days[d.date]=d; });
      return true;
    }catch(e){ setStatus('Не удалось прочитать сохранённые записи.', true); return false; }
  }
  var saveTimer=null;
  function saveNow(){
    clearTimeout(saveTimer); saveTimer=null;
    try{ if(App) App.save(snapshot()); else localStorage.setItem(LSK, snapshot()); }
    catch(e){ setStatus('Не удалось сохранить запись.', true); }
  }
  function persist(debounce){ clearTimeout(saveTimer); if(debounce) saveTimer=setTimeout(saveNow,600); else saveNow(); }
  function setDay(k, patch, debounce){ days[k]=extend(day(k), patch); render(); persist(debounce); }
  function setVal(k, id, value, debounce){ var d=day(k), v=extend(d.v); v[id]=value; setDay(k,{v:v},debounce); }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden' && saveTimer) saveNow(); });
  window.flush = function(){ if(saveTimer) saveNow(); };

  // ---------- подъём / отбой ----------
  $('btnWake').onclick = function(){
    if(cur===todayKey()) setDay(cur,{wake:new Date().toISOString()});
    else $('inWake').focus();
  };
  $('btnSleep').onclick = function(){
    var now=new Date(), early=now.getHours()<CUTOFF, k=early?addDays(todayKey(),-1):todayKey();
    if(cur===todayKey() || (early && cur===k)){ cur=k; setDay(k,{sleep:now.toISOString()}); }
    else $('inSleep').focus();
  };
  function timeOn(k, v, evening){
    var p=v.split(':'), h=+p[0], m=+p[1], d=fromKey(k);
    if(evening && h<CUTOFF) d.setDate(d.getDate()+1);
    d.setHours(h,m,0,0); return d.toISOString();
  }
  $('inWake').onchange = function(e){ var v=e.target.value; setDay(cur,{wake: v?timeOn(cur,v,false):null}); };
  $('inSleep').onchange = function(e){ var v=e.target.value; setDay(cur,{sleep: v?timeOn(cur,v,true):null}); };

  // ---------- практики на главном экране ----------
  function stepsOf(p){ var s=(p.steps&&p.steps.length)?p.steps:[1]; return s; }
  function counterCard(p, d){
    var n=(d.v && d.v[p.id])||0, goal=+p.goal||0, h='';
    if(goal){
      var off=276.46*(1-Math.min(1,n/goal));
      h+='<div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="var(--pc-soft)" stroke-width="9"/><circle cx="50" cy="50" r="44" fill="none" stroke="var(--pc)" stroke-width="9" stroke-linecap="round" stroke-dasharray="276.46" stroke-dashoffset="'+off.toFixed(2)+'"/></svg><div class="c"><b>'+n+'</b><span>из '+goal+(p.unit?' '+esc(p.unit):'')+'</span></div></div>';
    } else h+='<div class="bignum"><b>'+n+'</b><span>'+esc(p.unit||'')+'</span></div>';
    var btns=stepsOf(p).map(function(s){ return '<button data-do="add" data-n="'+s+'">+'+s+'</button>'; });
    btns.push('<button data-do="add" data-n="-'+Math.min.apply(null,stepsOf(p))+'">−'+Math.min.apply(null,stepsOf(p))+'</button>');
    var rows=''; for(var i=0;i<btns.length;i+=2) rows+='<div class="row">'+btns[i]+(btns[i+1]||'<span></span>')+'</div>';
    return '<div class="label">'+esc(p.name)+'</div><div class="japa">'+h+'<div class="jbtns">'+rows+'</div></div>';
  }
  function timerCard(p, d){
    var t=tv(d.date,p.id), on=!!t.start, goal=+p.goal||0, h='';
    h+='<div class="label">'+esc(p.name)+'</div>';
    h+='<div class="read"><div class="tot"><b>'+(t.min||0)+'</b> <span>мин сегодня'+(goal?' из '+goal:'')+'</span><div class="running" data-do="open" data-run="'+p.id+'"'+(on?'':' hidden')+'></div></div>';
    h+='<button class="play'+(on?' on':'')+'" data-do="toggle">'+(on?'Закончить':'Начать')+'</button></div>';
    if(goal) h+='<div class="bar"><i style="width:'+Math.min(100,Math.round((t.min||0)/goal*100))+'%"></i></div>';
    h+='<div class="quick">добавить вручную: <button data-do="addmin" data-n="5">+5</button><button data-do="addmin" data-n="15">+15</button><button data-do="addmin" data-n="30">+30</button><button data-do="addmin" data-n="-5">−5</button></div>';
    if(t.ses && t.ses.length) h+='<div class="sessions">'+t.ses.map(function(x){ return hm(x.from)+' · '+x.min+' мин'; }).join('    ')+'</div>';
    return h;
  }
  function checkCard(p, d){
    var at=d.v && d.v[p.id];
    return '<div class="checkrow"><div class="cname">'+esc(p.name)+'</div><button class="checkbtn'+(at?' done':'')+'" data-do="check">'+(at?'✓ '+(typeof at==='string'?hm(at):'сделано'):'Отметить')+'</button></div>';
  }
  function renderPractices(d){
    $('practices').innerHTML = visible().map(function(p){
      var body = p.type==='counter'?counterCard(p,d) : p.type==='timer'?timerCard(p,d) : checkCard(p,d);
      return '<section class="card c-'+(p.color||'dawn')+(p.type==='check'?' check':'')+'" data-pid="'+esc(p.id)+'">'+body+'</section>';
    }).join('');
  }
  $('practices').onclick = function(e){
    var b=closestAttr(e.target,'data-do',this); if(!b) return;
    var card=closestAttr(b,'data-pid',this); if(!card) return;
    var p=pById(card.getAttribute('data-pid')); if(!p) return;
    var act=b.getAttribute('data-do'), n=parseInt(b.getAttribute('data-n'),10);
    if(act==='add'){ setVal(cur,p.id,Math.max(0,(val(cur,p.id)||0)+n),true); }
    else if(act==='addmin'){ var t=clone(tv(cur,p.id)); t.min=Math.max(0,(t.min||0)+n); setVal(cur,p.id,t,true); }
    else if(act==='toggle'){ toggleTimer(p.id); }
    else if(act==='open'){ openFocus(p.id); }
    else if(act==='check'){ setVal(cur,p.id, val(cur,p.id)?null:(cur===todayKey()?new Date().toISOString():true)); }
  };

  // ---------- таймер на весь экран; экран не гаснет ----------
  function toggleTimer(id){
    var t=clone(tv(cur,id));
    if(t.start){
      var min=Math.max(1, Math.round((Date.now()-new Date(t.start).getTime())/60000));
      t.ses=(t.ses||[]).concat([{from:t.start, min:min}]); t.min=(t.min||0)+min; t.start=null;
      closeFocus(); setVal(cur,id,t);
    } else { t.start=new Date().toISOString(); setVal(cur,id,t); openFocus(id); }
  }
  var focusId=null;
  function screenOn(on){ try{ if(App) App.keepScreenOn(!!on); }catch(e){} }
  function openFocus(id){
    var p=pById(id); if(!p) return;
    focusId=id; $('focus').className='focus c-'+(p.color||'dawn');
    $('fName').textContent=p.name;
    $('focus').hidden=false; document.body.style.overflow='hidden';
    screenOn(true); tick();
  }
  function closeFocus(){ focusId=null; $('focus').hidden=true; document.body.style.overflow=''; screenOn(false); }
  $('fStop').onclick = function(){ if(focusId) toggleTimer(focusId); };
  $('fHide').onclick = closeFocus;
  window.onBack = function(){
    if(focusId){ closeFocus(); return true; }
    if(!$('settings').hidden){ closeSettings(); return true; }
    return false;
  };

  // ---------- день ----------
  $('prev').onclick=function(){ cur=addDays(cur,-1); render(); };
  $('next').onclick=function(){ if(cur<todayKey()){ cur=addDays(cur,1); render(); } };
  $('hist').onclick = function(e){ var tr=closestAttr(e.target,'data-d',this); if(tr){ cur=tr.getAttribute('data-d'); render(); window.scrollTo(0,0); } };
  window.onResume = function(){ var t=todayKey(); if(t!==lastToday){ if(cur===lastToday) cur=t; lastToday=t; } render(); };

  // ---------- расчёты ----------
  function sleepBefore(k){ var w=day(k).wake, s=day(addDays(k,-1)).sleep; if(!w||!s) return null; var m=(new Date(w)-new Date(s))/60000; return (m>0&&m<20*60)?m:null; }
  function clockMin(iso, evening){ var d=new Date(iso), m=d.getHours()*60+d.getMinutes(); if(evening && d.getHours()<12) m+=1440; return m; }
  function fromClock(m){ m=Math.round(m)%1440; return pad(Math.floor(m/60))+':'+pad(m%60); }
  function mean(a){ if(!a.length) return null; var s=0; a.forEach(function(x){ s+=x; }); return s/a.length; }
  function r1(x){ return x==null?'—':Math.round(x*10)/10; }
  function cellOf(p,k){
    var v=val(k,p.id);
    if(p.type==='counter') return v||null;
    if(p.type==='timer') return (v&&v.min)? v.min+'′' : null;
    return v ? '✓' : null;
  }

  // ---------- отрисовка главного экрана ----------
  function render(){
    var d=day(cur), isToday=cur===todayKey(), dt=fromKey(cur), label=DOW[dt.getDay()]+', '+dt.getDate()+' '+MON[dt.getMonth()];
    $('dayname').innerHTML=(isToday?'Сегодня':label)+'<small>'+(isToday?label:'прошлый день — правка')+'</small>';
    $('next').disabled=isToday;
    $('welcome').hidden=state.welcomed;

    $('sleepCard').hidden=!state.sleepOn;
    if(state.sleepOn){
      var w=hm(d.wake), s=hm(d.sleep);
      $('tWake').textContent=w||'—'; $('tSleep').textContent=s||'—';
      $('btnWake').className='mark wake'+(w?' done':''); $('btnSleep').className='mark sleep'+(s?' done':'');
      $('hWake').textContent=w?'отмечено':(isToday?'нажми, когда встал':'введи время ниже');
      $('hSleep').textContent=s?'отмечено':(isToday?'нажми перед сном':'введи время ниже');
      if(document.activeElement!==$('inWake')) $('inWake').value=w||'';
      if(document.activeElement!==$('inSleep')) $('inSleep').value=s||'';
      $('sleepDur').textContent=fmtDur(sleepBefore(cur));
    }
    renderPractices(d);
    tick();

    var keys=[], i; for(i=0;i<14;i++) keys.push(addDays(todayKey(),-i));
    var ps=visible();
    var head='<tr><th>День</th>'+(state.sleepOn?'<th>Встал</th><th>Лёг</th><th>Сон</th>':'')+ps.map(function(p){ return '<th>'+esc(p.name.length>9?p.name.slice(0,8)+'…':p.name)+'</th>'; }).join('')+'</tr>';
    $('histHead').innerHTML=head;
    $('hist').innerHTML=keys.map(function(k){
      var x=day(k), t=fromKey(k), sb=sleepBefore(k);
      function c(v){ return v?'<td>'+v+'</td>':'<td class="dim">—</td>'; }
      return '<tr data-d="'+k+'"'+(k===cur?' class="cur"':'')+'><td>'+DOW[t.getDay()]+' '+t.getDate()+'</td>'+
        (state.sleepOn? c(hm(x.wake))+c(hm(x.sleep))+c(sb?fmtDur(sb):null) : '')+
        ps.map(function(p){ return c(cellOf(p,k)); }).join('')+'</tr>';
    }).join('');

    var wk=keys.slice(0,7), cells=[];
    if(state.sleepOn){
      var ws=wk.map(function(k){ return day(k).wake; }).filter(Boolean).map(function(v){ return clockMin(v); });
      var ss=wk.map(function(k){ return day(k).sleep; }).filter(Boolean).map(function(v){ return clockMin(v,true); });
      var ds=wk.map(sleepBefore).filter(function(v){ return v!=null; });
      cells.push([ws.length?fromClock(mean(ws)):'—','подъём'],[ss.length?fromClock(mean(ss)):'—','отбой'],[fmtDur(mean(ds)),'сон']);
    }
    ps.forEach(function(p){
      if(p.type==='counter') cells.push([r1(mean(wk.map(function(k){ return val(k,p.id)||0; }))), esc(p.name)+(p.unit?', '+esc(p.unit):'')]);
      else if(p.type==='timer') cells.push([Math.round(mean(wk.map(function(k){ return tv(k,p.id).min||0; }))), esc(p.name)+', мин']);
      else cells.push([wk.filter(function(k){ return !!val(k,p.id); }).length+' из 7', esc(p.name)]);
    });
    var rows=''; for(i=0;i<cells.length;i+=3){ rows+='<div class="row">'; for(var j=i;j<i+3;j++) rows+= cells[j]?'<div><b>'+cells[j][0]+'</b><span>'+cells[j][1]+'</span></div>':'<div></div>'; rows+='</div>'; }
    $('avg').innerHTML=rows || '<span class="hint2">Пока нечего считать.</span>';
    $('chart').hidden=!state.sleepOn;
    if(state.sleepOn) chart(keys.slice().reverse());
  }

  function chart(keys){
    var W=340,H=120,L=22,B=18,T=8, cw=(W-L-4)/keys.length, max=10, g='';
    function y(h){ return T+(H-T-B)*(1-Math.min(h,max)/max); }
    [4,6,8,10].forEach(function(h){ g+='<line x1="'+L+'" x2="'+W+'" y1="'+y(h)+'" y2="'+y(h)+'" stroke="var(--line)" stroke-width="1"/><text x="'+(L-5)+'" y="'+(y(h)+3.5)+'" fill="var(--muted)" font-size="9" text-anchor="end" font-family="JetBrains Mono, monospace">'+h+'ч</text>'; });
    keys.forEach(function(k,i){
      var m=sleepBefore(k), x=L+i*cw+cw*.18, w=cw*.64, t=fromKey(k);
      if(m){ var h=m/60; g+='<rect x="'+x.toFixed(1)+'" y="'+y(h).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+(y(0)-y(h)).toFixed(1)+'" rx="2" fill="'+(k===cur?'var(--dawn)':'var(--night)')+'" opacity="'+(k===cur?1:.75)+'"/>'; }
      g+='<text x="'+(x+w/2).toFixed(1)+'" y="'+(H-5)+'" fill="var(--muted)" font-size="8.5" text-anchor="middle" font-family="JetBrains Mono, monospace">'+t.getDate()+'</text>';
    });
    $('chart').innerHTML='<svg viewBox="0 0 '+W+' '+H+'">'+g+'</svg>';
  }

  function elapsed(start){ return Math.max(0,Math.floor((Date.now()-new Date(start).getTime())/1000)); }
  function tick(){
    each(document.querySelectorAll('[data-run]'), function(el){
      var t=tv(cur, el.getAttribute('data-run'));
      if(t.start){ var s=elapsed(t.start); el.textContent='идёт '+Math.floor(s/3600)+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60)+' · открыть таймер'; }
    });
    if(focusId){
      var t=tv(cur,focusId);
      if(!t.start){ closeFocus(); return; }
      var s=elapsed(t.start), h=Math.floor(s/3600), m=Math.floor(s/60)%60, p=pById(focusId);
      $('fClock').innerHTML=(h? h+':'+pad(m) : m)+'<small>:'+pad(s%60)+'</small>';
      $('fSince').textContent='начато в '+hm(t.start);
      $('fDay').innerHTML='за сегодня вместе с этим: <b>'+((t.min||0)+Math.round(s/60))+'</b> мин'+(p&&p.goal?' из '+p.goal:'');
    }
  }
  setInterval(tick,1000);
  setInterval(function(){ var t=todayKey(); if(t!==lastToday){ if(cur===lastToday) cur=t; lastToday=t; render(); } },30000);

  // ---------- приветствие ----------
  $('welcomeClose').onclick=function(){ state.welcomed=true; persist(); render(); };
  $('welcomeGo').onclick=function(){ state.welcomed=true; persist(); openSettings(); };

  // ---------- настройки ----------
  function openSettings(){ setStatus(''); closeEditor(); $('main').hidden=true; $('settings').hidden=false; renderSettings(); window.scrollTo(0,0); }
  function closeSettings(){ setStatus(''); closeEditor(); $('settings').hidden=true; $('main').hidden=false; render(); window.scrollTo(0,0); }
  $('openSettings').onclick=openSettings;
  $('closeSettings').onclick=closeSettings;
  $('sleepOn').onchange=function(e){ state.sleepOn=!!e.target.checked; persist(); };

  function describe(p){
    var t=TYPE_NAME[p.type]||p.type;
    if(p.type==='counter') return t+(p.goal?' · цель '+p.goal+(p.unit?' '+p.unit:''):'')+' · кнопки '+stepsOf(p).join(', ');
    if(p.type==='timer') return t+(p.goal?' · цель '+p.goal+' мин':'');
    return t+' «сделано»';
  }
  function renderSettings(){
    $('sleepOn').checked=state.sleepOn;
    var n=state.practices.length;
    $('plist').innerHTML = n ? state.practices.map(function(p,i){
      return '<div class="pitem c-'+(p.color||'dawn')+(p.hidden?' off':'')+'" data-i="'+i+'"><span class="dot"></span><div class="pinfo"><b>'+esc(p.name)+'</b><span>'+(p.hidden?'скрыта · ':'')+esc(describe(p))+'</span></div>'+
        '<button data-mv="-1" aria-label="Выше"'+(i===0?' disabled':'')+'>↑</button><button data-mv="1" aria-label="Ниже"'+(i===n-1?' disabled':'')+'>↓</button><button class="edit" data-ed="1" aria-label="Изменить">✎</button></div>';
    }).join('') : '<div class="hint2">Практик пока нет. Добавьте первую.</div>';
  }
  $('plist').onclick=function(e){
    var row=closestAttr(e.target,'data-i',this); if(!row) return;
    var i=+row.getAttribute('data-i'), b=e.target;
    if(b.getAttribute('data-mv')){ var j=i+(+b.getAttribute('data-mv')); if(j<0||j>=state.practices.length) return;
      var tmp=state.practices[i]; state.practices[i]=state.practices[j]; state.practices[j]=tmp; persist(); renderSettings(); closeEditor(); }
    else if(b.getAttribute('data-ed')) openEditor(state.practices[i]);
  };

  // редактор практики
  var draft=null, draftIsNew=false, delArmed=false;
  function openEditor(p){
    draftIsNew=!p;
    draft = p ? clone(p) : {id:null, name:'', type:'check', color:COLORS[state.practices.length%COLORS.length], goal:0, unit:'', steps:[1], hidden:false};
    $('edTitle').textContent=draftIsNew?'Новая практика':'Изменить практику';
    $('edName').value=draft.name;
    $('edUnit').value=draft.unit||'';
    $('edSteps').value=stepsOf(draft).join(', ');
    $('edGoal').value=draft.goal?draft.goal:'';
    $('edHidden').checked=!!draft.hidden;
    $('edDelete').hidden=draftIsNew; disarm();
    $('editor').hidden=false; edRender();
    setTimeout(function(){ $('editor').scrollIntoView(); if(draftIsNew) $('edName').focus(); },30);
  }
  function closeEditor(){ draft=null; $('editor').hidden=true; disarm(); }
  function edRender(){
    if(!draft) return;
    each($('edType').querySelectorAll('button'), function(b){ b.className = b.getAttribute('data-type')===draft.type?'on':''; });
    $('edType').className='seg'+(draftIsNew?'':' locked');
    $('edTypeHint').textContent = draftIsNew ? ({counter:'Считать количество: круги, поклоны, главы.', timer:'Засекать время, с большим таймером на экране.', check:'Просто отметить, что сделано сегодня.'})[draft.type]
                                             : 'Вид уже созданной практики не меняется. Нужен другой вид — создайте новую практику.';
    $('edCounter').hidden = draft.type!=='counter';
    $('edGoalBox').hidden = draft.type==='check';
    $('edGoalLabel').textContent = draft.type==='timer' ? 'Цель на день, минут' : 'Цель на день';
    $('edColor').innerHTML = COLORS.map(function(c){ return '<button class="c-'+c+(draft.color===c?' on':'')+'" data-color="'+c+'" aria-label="'+c+'"></button>'; }).join('');
  }
  $('edType').onclick=function(e){ var t=e.target.getAttribute && e.target.getAttribute('data-type'); if(t && draft && draftIsNew){ draft.type=t; edRender(); } };
  $('edColor').onclick=function(e){ var c=e.target.getAttribute && e.target.getAttribute('data-color'); if(c && draft){ draft.color=c; edRender(); } };
  $('addPractice').onclick=function(){ openEditor(null); };
  $('edCancel').onclick=closeEditor;
  $('edSave').onclick=function(){
    if(!draft) return;
    var name=$('edName').value.replace(/^\s+|\s+$/g,'');
    if(!name){ setStatus('Впишите название практики.', true); $('edName').focus(); return; }
    draft.name=name;
    draft.hidden=$('edHidden').checked;
    var g=parseInt($('edGoal').value,10); draft.goal = (g>0 && draft.type!=='check') ? g : 0;
    if(draft.type==='counter'){
      draft.unit=$('edUnit').value.replace(/^\s+|\s+$/g,'');
      var st=$('edSteps').value.split(/[^0-9]+/).map(function(x){ return parseInt(x,10); }).filter(function(x){ return x>0 && x<10000; });
      draft.steps = st.length ? st.slice(0,5) : [1];
    } else { delete draft.unit; delete draft.steps; }
    if(draftIsNew){ draft.id='p'+Date.now().toString(36); state.practices.push(draft); }
    else for(var i=0;i<state.practices.length;i++) if(state.practices[i].id===draft.id) state.practices[i]=draft;
    persist(); closeEditor(); renderSettings(); setStatus('Сохранено: «'+name+'».');
  };
  function disarm(){ delArmed=false; $('edDelete').className='danger'; $('edDelete').textContent='Удалить практику'; }
  $('edDelete').onclick=function(){
    if(!draft || draftIsNew) return;
    if(!delArmed){ delArmed=true; this.className='danger armed'; this.textContent='Точно удалить? Нажмите ещё раз'; return; }
    var id=draft.id, name=draft.name;
    if(focusId===id) closeFocus();
    state.practices=state.practices.filter(function(p){ return p.id!==id; });
    persist(); closeEditor(); renderSettings(); setStatus('Практика «'+name+'» удалена. Если нужно убрать её лишь на время, лучше «Скрыть».');
  };

  // ---------- резервная копия ----------
  $('exp').onclick=function(){
    saveNow();
    var name='sadhana-'+todayKey()+'.json';
    if(App){ try{ App.exportBackup(snapshot(), name); }catch(e){ setStatus('Не получилось сохранить копию.',true); } return; }
    try{
      var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([snapshot()],{type:'application/json'}));
      a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ a.parentNode.removeChild(a); },1000);
    }catch(e){ setStatus('Не получилось сохранить копию.',true); }
  };
  window.onBackupSaved=function(ok){ setStatus(ok?'Копия сохранена.':'Копия не сохранена.', !ok); };
  var fileIn=null;
  $('imp').onclick=function(){
    if(App){ try{ App.importBackup(); }catch(e){} return; }
    if(!fileIn){ fileIn=document.createElement('input'); fileIn.type='file'; fileIn.accept='.json,application/json';
      fileIn.onchange=function(){ var f=fileIn.files[0]; if(!f) return; var r=new FileReader(); r.onload=function(){ window.onBackupLoaded(r.result); fileIn.value=''; }; r.readAsText(f); }; }
    fileIn.click();
  };
  function empty(v){ return v==null || v===0 || v===false || (typeof v==='object' && !v.start && !v.min && !(v.ses&&v.ses.length)); }
  // Слияние: дни и практики из копии добавляются; то, что уже записано в телефоне, важнее.
  window.onBackupLoaded=function(text){
    if(text==null) return;
    try{
      var o=JSON.parse(text), added=0, merged=0, newP=0;
      if(!o || !o.days || !o.days.forEach) throw new Error('format');
      var incoming = (o.practices && o.practices.length!=null) ? o.practices : defaultPractices();
      incoming.forEach(function(p){ if(p && p.id && !pById(p.id)){ state.practices.push(p); newP++; } });
      o.days.forEach(function(d){
        d=migrateDay(d); if(!d) return;
        var mine=days[d.date];
        if(!mine){ days[d.date]=d; added++; return; }
        var out={date:d.date, wake:mine.wake||d.wake||null, sleep:mine.sleep||d.sleep||null, v:extend(d.v)};
        for(var id in mine.v) if(!empty(mine.v[id])) out.v[id]=mine.v[id];
        days[d.date]=out; merged++;
      });
      saveNow(); render(); if(!$('settings').hidden) renderSettings();
      setStatus('Восстановлено: новых дней '+added+', дополнено '+merged+(newP?', практик добавлено '+newP:'')+'.');
    }catch(e){ setStatus('Этот файл не похож на копию дневника.',true); }
  };

  // ---------- запуск ----------
  try{ if(App && App.isDark()) document.documentElement.setAttribute('data-theme','dark'); }catch(e){}
  if(!App && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme','dark');
  loadAll(); render();
  // если таймер шёл, когда приложение закрыли, — сразу показать его
  visible().forEach(function(p){ if(!focusId && p.type==='timer' && tv(todayKey(),p.id).start){ cur=todayKey(); render(); openFocus(p.id); } });
})();
