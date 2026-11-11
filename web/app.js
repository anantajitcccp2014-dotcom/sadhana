(function(){
  var App = window.App || null; // мост к Android (MainActivity.Bridge); в обычном браузере его нет
  function $(id){ return document.getElementById(id); }
  function pad(n){ return (n<10?'0':'')+n; }
  function each(list, fn){ Array.prototype.forEach.call(list, fn); }
  function extend(){ var o={}; for(var i=0;i<arguments.length;i++){ var s=arguments[i]; if(s) for(var k in s) if(Object.prototype.hasOwnProperty.call(s,k)) o[k]=s[k]; } return o; }
  function keyOf(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function fromKey(k){ var p=k.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function addDays(k,n){ var d=fromKey(k); d.setDate(d.getDate()+n); return keyOf(d); }
  function hm(iso){ if(!iso) return null; var d=new Date(iso); return pad(d.getHours())+':'+pad(d.getMinutes()); }
  function fmtDur(min){ if(min==null||!isFinite(min)||min<=0) return '—'; min=Math.round(min); return Math.floor(min/60)+' ч '+pad(min%60); }
  var DOW = ['вс','пн','вт','ср','чт','пт','сб'];
  var MON = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  var CUTOFF = 5; // отбой до 5:00 считается вечером предыдущего дня

  function todayKey(){ return keyOf(new Date()); }
  var cur = todayKey();
  var days = {};
  var goal = 16;

  function day(k){ return days[k] || {date:k, wake:null, sleep:null, japa:0, readMin:0, sessions:[], readStart:null, slokaMin:0, slokaSessions:[], slokaStart:null}; }
  function setStatus(t,err){ var s=$('status'); s.textContent=t||''; s.className='status'+(err?' err':''); }

  // ---------- хранение ----------
  var LSK = 'sadhana-v1';
  function snapshot(){ var list=[]; for(var k in days) list.push(days[k]); return JSON.stringify({app:'sadhana', goal:goal, days:list}); }
  function loadAll(){
    var raw = null;
    try{ raw = App ? App.load() : localStorage.getItem(LSK); }catch(e){}
    if(!raw) return;
    try{ var o=JSON.parse(raw); (o.days||[]).forEach(function(d){ if(d && d.date) days[d.date]=d; }); if(o.goal) goal=o.goal; }
    catch(e){ setStatus('Не удалось прочитать сохранённые записи.', true); }
  }
  var saveTimer = null;
  function saveNow(){
    clearTimeout(saveTimer); saveTimer=null;
    try{ if(App) App.save(snapshot()); else localStorage.setItem(LSK, snapshot()); }
    catch(e){ setStatus('Не удалось сохранить запись.', true); }
  }
  function persist(debounce){ clearTimeout(saveTimer); if(debounce) saveTimer=setTimeout(saveNow,600); else saveNow(); }
  function update(k, patch, debounce){ days[k] = extend(day(k), patch); render(); persist(debounce); }
  document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden' && saveTimer) saveNow(); });
  window.flush = function(){ if(saveTimer) saveNow(); };
  window.onResume = function(){ var t=todayKey(); if(t!==lastToday){ if(cur===lastToday) cur=t; lastToday=t; } render(); };

  // ---------- подъём / отбой ----------
  $('btnWake').onclick = function(){
    if(cur===todayKey()) update(cur,{wake:new Date().toISOString()});
    else $('inWake').focus();
  };
  $('btnSleep').onclick = function(){
    var now=new Date(), early=now.getHours()<CUTOFF, k=early?addDays(todayKey(),-1):todayKey();
    if(cur===todayKey() || (early && cur===k)){ cur=k; update(k,{sleep:now.toISOString()}); }
    else $('inSleep').focus();
  };
  function timeOn(k, v, evening){
    var p=v.split(':'), h=+p[0], m=+p[1], d=fromKey(k);
    if(evening && h<CUTOFF) d.setDate(d.getDate()+1);
    d.setHours(h,m,0,0); return d.toISOString();
  }
  $('inWake').onchange = function(e){ var v=e.target.value; update(cur,{wake: v?timeOn(cur,v,false):null}); };
  $('inSleep').onchange = function(e){ var v=e.target.value; update(cur,{sleep: v?timeOn(cur,v,true):null}); };

  // ---------- джапа ----------
  function japa(n){ update(cur,{japa: Math.max(0,(day(cur).japa||0)+n)}, true); }
  $('j1').onclick=function(){ japa(1); }; $('j4').onclick=function(){ japa(4); };
  $('j8').onclick=function(){ japa(8); }; $('jm').onclick=function(){ japa(-1); };
  $('goalIn').onchange = function(e){ var v=parseInt(e.target.value,10); if(v>0){ goal=v; persist(); render(); } };

  // ---------- занятия по времени: чтение книг и повторение шлок ----------
  var ACTS = {
    read:  {min:'readMin',  start:'readStart',  ses:'sessions',      tot:'readTot',  run:'running',      play:'play',      list:'sessions',      go:'Начать чтение',     name:'Чтение книг',     color:'#f0a04a'},
    sloka: {min:'slokaMin', start:'slokaStart', ses:'slokaSessions', tot:'slokaTot', run:'slokaRunning', play:'slokaPlay', list:'slokaSessions', go:'Начать повторение', name:'Повторение шлок', color:'#a5b1f0'}
  };
  var ACT_KEYS = ['read','sloka'];
  each(document.querySelectorAll('[data-add]'), function(b){ b.onclick = function(){
    var a=ACTS[b.getAttribute('data-act')], n=parseInt(b.getAttribute('data-add'),10), p={};
    p[a.min]=Math.max(0,(day(cur)[a.min]||0)+n); update(cur,p,true);
  }; });
  function toggleAct(k){
    var a=ACTS[k], d=day(cur), p={};
    if(d[a.start]){
      var min=Math.max(1, Math.round((Date.now()-new Date(d[a.start]).getTime())/60000));
      p[a.start]=null; p[a.min]=(d[a.min]||0)+min; p[a.ses]=(d[a.ses]||[]).concat([{from:d[a.start], min:min}]);
      closeFocus(); update(cur,p);
    } else { p[a.start]=new Date().toISOString(); update(cur,p); openFocus(k); }
  }
  ACT_KEYS.forEach(function(k){ var a=ACTS[k];
    $(a.play).onclick = function(){ toggleAct(k); };
    $(a.run).onclick = function(){ openFocus(k); };
  });

  // ---------- полноэкранный таймер; экран не гаснет ----------
  var focusAct = null;
  function screenOn(on){ try{ if(App) App.keepScreenOn(!!on); }catch(e){} }
  function openFocus(k){
    focusAct=k; var a=ACTS[k];
    $('focus').style.setProperty('--fc', a.color);
    $('fName').textContent=a.name;
    $('focus').hidden=false; document.body.style.overflow='hidden';
    screenOn(true); tick();
  }
  function closeFocus(){ focusAct=null; $('focus').hidden=true; document.body.style.overflow=''; screenOn(false); }
  $('fStop').onclick = function(){ if(focusAct) toggleAct(focusAct); };
  $('fHide').onclick = closeFocus;
  // кнопка «Назад» на телефоне сворачивает таймер, а не закрывает приложение
  window.onBack = function(){ if(focusAct){ closeFocus(); return true; } return false; };

  // ---------- день ----------
  $('prev').onclick=function(){ cur=addDays(cur,-1); render(); };
  $('next').onclick=function(){ if(cur<todayKey()){ cur=addDays(cur,1); render(); } };
  $('hist').onclick = function(e){
    var el=e.target; while(el && el!==this && !el.getAttribute('data-d')) el=el.parentNode;
    if(el && el.getAttribute && el.getAttribute('data-d')){ cur=el.getAttribute('data-d'); render(); window.scrollTo(0,0); }
  };

  // ---------- резервная копия ----------
  $('exp').onclick = function(){
    saveNow();
    var name='sadhana-'+todayKey()+'.json';
    if(App){ try{ App.exportBackup(snapshot(), name); }catch(e){ setStatus('Не получилось сохранить копию.',true); } return; }
    try{
      var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([snapshot()],{type:'application/json'}));
      a.download=name; document.body.appendChild(a); a.click(); setTimeout(function(){ a.parentNode.removeChild(a); },1000);
    }catch(e){ setStatus('Не получилось сохранить копию.',true); }
  };
  window.onBackupSaved = function(ok){ setStatus(ok?'Копия сохранена.':'Копия не сохранена.', !ok); };
  var fileIn=null;
  $('imp').onclick = function(){
    if(App){ try{ App.importBackup(); }catch(e){} return; }
    if(!fileIn){ fileIn=document.createElement('input'); fileIn.type='file'; fileIn.accept='.json,application/json';
      fileIn.onchange=function(){ var f=fileIn.files[0]; if(!f) return; var r=new FileReader(); r.onload=function(){ window.onBackupLoaded(r.result); fileIn.value=''; }; r.readAsText(f); }; }
    fileIn.click();
  };
  // Слияние: дни из копии добавляются, а уже записанные в телефоне поля важнее.
  window.onBackupLoaded = function(text){
    if(text==null) return;
    try{
      var o=JSON.parse(text), added=0, merged=0;
      if(!o || !o.days || !o.days.forEach) throw new Error('format');
      o.days.forEach(function(d){
        if(!d || !d.date) return;
        if(!days[d.date]){ days[d.date]=d; added++; }
        else { var mine=days[d.date], out=extend(d);
          for(var f in mine){ var v=mine[f]; if(v!==null && v!==0 && !(v && v.length===0)) out[f]=v; }
          days[d.date]=out; merged++; }
      });
      if(o.goal && !goal) goal=o.goal;
      saveNow(); render(); setStatus('Восстановлено: новых дней '+added+', дополнено '+merged+'.');
    }catch(e){ setStatus('Этот файл не похож на копию дневника.',true); }
  };

  // ---------- расчёты ----------
  function sleepBefore(k){ var w=day(k).wake, s=day(addDays(k,-1)).sleep; if(!w||!s) return null; var m=(new Date(w)-new Date(s))/60000; return (m>0&&m<20*60)?m:null; }
  function clockMin(iso, evening){ var d=new Date(iso), m=d.getHours()*60+d.getMinutes(); if(evening && d.getHours()<12) m+=1440; return m; }
  function fromClock(m){ m=Math.round(m)%1440; return pad(Math.floor(m/60))+':'+pad(m%60); }
  function mean(a){ if(!a.length) return null; var s=0; a.forEach(function(x){ s+=x; }); return s/a.length; }
  function round1(x){ return x==null?'—':Math.round(x*10)/10; }

  // ---------- отрисовка ----------
  function render(){
    var d=day(cur), isToday=cur===todayKey(), dt=fromKey(cur), label=DOW[dt.getDay()]+', '+dt.getDate()+' '+MON[dt.getMonth()];
    $('dayname').innerHTML = (isToday?'Сегодня':label)+'<small>'+(isToday?label:'прошлый день — правка')+'</small>';
    $('next').disabled = isToday;

    var w=hm(d.wake), s=hm(d.sleep);
    $('tWake').textContent=w||'—'; $('tSleep').textContent=s||'—';
    $('btnWake').className='mark wake'+(w?' done':''); $('btnSleep').className='mark sleep'+(s?' done':'');
    $('hWake').textContent = w?'отмечено':(isToday?'нажми, когда встал':'введи время ниже');
    $('hSleep').textContent = s?'отмечено':(isToday?'нажми перед сном':'введи время ниже');
    if(document.activeElement!==$('inWake')) $('inWake').value=w||'';
    if(document.activeElement!==$('inSleep')) $('inSleep').value=s||'';
    $('sleepDur').textContent = fmtDur(sleepBefore(cur));

    var j=d.japa||0;
    $('japaN').textContent=j; $('japaOf').textContent='из '+goal;
    $('ringArc').setAttribute('stroke-dashoffset', 276.46*(1-Math.min(1,j/goal)));
    if(document.activeElement!==$('goalIn')) $('goalIn').value=goal;

    ACT_KEYS.forEach(function(k){ var a=ACTS[k], on=!!d[a.start];
      $(a.tot).textContent = d[a.min]||0;
      $(a.play).textContent = on?'Закончить':a.go;
      $(a.play).className = 'play'+(k==='sloka'?' alt':'')+(on?' on':'');
      $(a.run).hidden = !on;
      $(a.list).textContent = (d[a.ses]||[]).map(function(x){ return hm(x.from)+' · '+x.min+' мин'; }).join('    ');
    });
    tick();

    var keys=[], i; for(i=0;i<14;i++) keys.push(addDays(todayKey(),-i));
    $('hist').innerHTML = keys.map(function(k){
      var x=day(k), t=fromKey(k), sb=sleepBefore(k);
      function c(v){ return v?'<td>'+v+'</td>':'<td class="dim">—</td>'; }
      return '<tr data-d="'+k+'"'+(k===cur?' class="cur"':'')+'><td>'+DOW[t.getDay()]+' '+t.getDate()+'</td>'+c(hm(x.wake))+c(hm(x.sleep))+c(sb?fmtDur(sb):null)+c(x.japa||null)+c(x.readMin?x.readMin+'′':null)+c(x.slokaMin?x.slokaMin+'′':null)+'</tr>';
    }).join('');

    var wk=keys.slice(0,7);
    var ws=wk.map(function(k){ return day(k).wake; }).filter(Boolean).map(function(v){ return clockMin(v); });
    var ss=wk.map(function(k){ return day(k).sleep; }).filter(Boolean).map(function(v){ return clockMin(v,true); });
    var ds=wk.map(sleepBefore).filter(function(v){ return v!=null; });
    $('aWake').textContent = ws.length?fromClock(mean(ws)):'—';
    $('aSleep').textContent = ss.length?fromClock(mean(ss)):'—';
    $('aDur').textContent = fmtDur(mean(ds));
    $('aJapa').textContent = round1(mean(wk.map(function(k){ return day(k).japa||0; })));
    $('aRead').textContent = Math.round(mean(wk.map(function(k){ return day(k).readMin||0; })));
    $('aSloka').textContent = Math.round(mean(wk.map(function(k){ return day(k).slokaMin||0; })));
    chart(keys.slice().reverse());
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

  function tick(){
    var d=day(cur);
    ACT_KEYS.forEach(function(k){ var a=ACTS[k];
      if(d[a.start]){ var s=Math.max(0,Math.floor((Date.now()-new Date(d[a.start]).getTime())/1000)); $(a.run).textContent='идёт '+Math.floor(s/3600)+':'+pad(Math.floor(s/60)%60)+':'+pad(s%60)+' · открыть таймер'; }
    });
    if(focusAct){
      var a=ACTS[focusAct];
      if(!d[a.start]){ closeFocus(); return; }
      var s=Math.max(0,Math.floor((Date.now()-new Date(d[a.start]).getTime())/1000)), h=Math.floor(s/3600), m=Math.floor(s/60)%60;
      $('fClock').innerHTML = (h? h+':'+pad(m) : m)+'<small>:'+pad(s%60)+'</small>';
      $('fSince').textContent = 'начато в '+hm(d[a.start]);
      $('fDay').innerHTML = 'за сегодня вместе с этим: <b>'+((d[a.min]||0)+Math.round(s/60))+'</b> мин';
    }
  }
  setInterval(tick,1000);
  var lastToday=todayKey();
  setInterval(function(){ var t=todayKey(); if(t!==lastToday){ if(cur===lastToday) cur=t; lastToday=t; render(); } },30000);

  // ---------- запуск ----------
  try{ if(App && App.isDark()) document.documentElement.setAttribute('data-theme','dark'); }catch(e){}
  if(!App && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme','dark');
  loadAll(); render();
  // если таймер шёл, когда приложение закрыли, — сразу показать его
  var td=day(todayKey());
  ACT_KEYS.forEach(function(k){ if(!focusAct && td[ACTS[k].start]){ cur=todayKey(); render(); openFocus(k); } });
})();
