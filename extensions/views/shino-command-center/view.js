/** SHINO Command Center — Jarvis native full-screen view. */
(function () {
  if (!window.Jarvis?.views) return;

  const VIEW_ID = 'shino-command-center';
  const STYLE_ID = 'shino-command-center-css';
  const STATES = ['idle','listening','thinking','speaking','working','error'];
  const COPY = {
    idle:['IDLE','À VOTRE SERVICE.'],
    listening:['LISTENING','JE VOUS ÉCOUTE.'],
    thinking:['THINKING','ANALYSE EN COURS.'],
    speaking:['SPEAKING','RÉPONSE EN COURS.'],
    working:['WORKING','EXÉCUTION.'],
    error:['ERROR','ANOMALIE DÉTECTÉE.'],
  };
  const RGB = {
    idle:[72,221,255], listening:[86,255,209], thinking:[165,140,255],
    speaking:[138,241,255], working:[255,209,118], error:[255,97,120],
  };

  let container = null;
  let canvas = null;
  let ctx = null;
  let animFrame = null;
  let clockTimer = null;
  let perfTimer = null;
  let slowTimer = null;
  let visible = false;
  let phase = 0;
  let coreState = 'idle';
  let mode = 'RISO';
  let nodes = [];

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = `/static/skills/${VIEW_ID}/view.css`;
    document.head.appendChild(link);
  }

  function markup() {
    return `
      <div class="sho-shell">
        <header class="sho-top">
          <div class="sho-brand"><div class="sho-mark"></div><div><strong>SHINO-OS</strong><small>JARVIS-POWERED PERSONAL AI</small></div></div>
          <div class="sho-time"><span id="sho-date">--</span><b id="sho-clock">--:--:--</b></div>
          <div class="sho-topstats">
            <div class="sho-topstat"><span>CPU</span><b id="sho-top-cpu">--%</b></div>
            <div class="sho-topstat"><span>RAM</span><b id="sho-top-ram">--%</b></div>
            <div class="sho-topstat"><span>DISK</span><b id="sho-top-disk">--%</b></div>
            <div class="sho-topstat"><span>BACKEND</span><b class="sho-online" id="sho-backend">ONLINE</b></div>
          </div>
        </header>

        <aside class="sho-rail">
          <button class="active" title="Accueil">⌂</button><button title="Conversation">◌</button><button title="Skills">▦</button><button title="Métriques">╱╲</button><button title="Réseau">◎</button><button title="Terminal">›_</button>
          <div class="sho-build">SHINO v0.2<br>JARVIS CORE</div>
        </aside>

        <main class="sho-main">
          <section class="sho-panel sho-chat">
            <div class="sho-title"><span>CONVERSATION</span><small>JARVIS SESSION</small></div>
            <div class="sho-chatlog">
              <div class="sho-msg"><b>Toi</b><p>Shino, état du système ?</p></div>
              <div class="sho-msg ai"><b>Shino</b><p>Backend Jarvis connecté. SHINO Command Center utilise maintenant le vrai moteur, la mémoire, les missions et les extensions Jarvis.</p></div>
            </div>
            <div class="sho-input">La conversation principale reste pilotée par Jarvis.</div>
          </section>

          <section class="sho-stack">
            <div class="sho-panel"><div class="sho-title"><span>ACTIONS RÉCENTES</span><small>LIVE</small></div><ul class="sho-list"><li><span>Jarvis runtime</span><em>ONLINE</em></li><li><span>SHINO overlay</span><em>LOADED</em></li><li><span>Extension path</span><em>ACTIVE</em></li><li><span>Memory kernel</span><em>JARVIS</em></li></ul></div>
            <div class="sho-panel"><div class="sho-title"><span>CHARGE SYSTÈME</span><small>REAL API</small></div><div class="sho-gpu"><div class="sho-gpurow"><span>CPU</span><div class="sho-bar"><i id="sho-cpu-bar"></i></div><strong id="sho-cpu">--%</strong></div><div class="sho-gpurow"><span>RAM</span><div class="sho-bar"><i id="sho-ram-bar"></i></div><strong id="sho-ram">--%</strong></div><div class="sho-gpurow"><span>DISK</span><div class="sho-bar"><i id="sho-disk-bar"></i></div><strong id="sho-disk">--%</strong></div></div></div>
            <div class="sho-panel sho-modecard"><div class="sho-title"><span>MODE ACTUEL</span></div><b id="sho-mode">RISO</b><span>Contexte SHINO actif</span></div>
          </section>

          <section class="sho-corezone">
            <div class="sho-horizon"></div>
            <div class="sho-corelabel"><span>CORE STATE</span><strong id="sho-core-state">IDLE</strong></div>
            <div class="sho-corewrap" id="sho-corewrap"><div class="sho-ticks"></div><div class="sho-orbit sho-o3"></div><div class="sho-orbit sho-o2"></div><div class="sho-orbit sho-o1"></div><canvas class="sho-corecanvas" id="sho-corecanvas"></canvas></div>
            <div class="sho-service" id="sho-service">À VOTRE SERVICE.</div>
          </section>

          <section class="sho-stack" style="grid-template-rows:.9fr 1.1fr">
            <div class="sho-panel sho-brain"><div class="sho-title"><span>BRAIN MODE</span><small id="sho-brain-label">DETECTING</small></div><div class="sho-brainopt" data-brain="OPENAI"><div><b>CHATGPT / OPENAI</b><small>Cloud brain path</small></div><span>○</span></div><div class="sho-brainopt" data-brain="LOCAL"><div><b>LOCAL</b><small>Ollama / LAN</small></div><span>○</span></div><div class="sho-brainopt" data-brain="OTHER"><div><b>OTHER CLOUD</b><small>Claude / Gemini / Mistral</small></div><span>○</span></div></div>
            <div class="sho-panel sho-skills"><div class="sho-title"><span>SHINO SKILLS</span><small>OVERLAY</small></div><ul class="sho-list"><li><span>RISO ASSISTANT</span><em>PLANNED</em></li><li><span>SHINOBIWAN A&R</span><em>PLANNED</em></li><li><span>DEV HELPER</span><em>JARVIS</em></li><li><span>FILES / CLI</span><em>JARVIS</em></li><li><span>PROACTIVE ENGINE</span><em>JARVIS</em></li></ul></div>
          </section>

          <section class="sho-panel sho-system"><div class="sho-title"><span>SYSTÈME</span><small>JARVIS API</small></div><div class="sho-sysrow"><div><b>CPU</b><span>REALTIME</span></div><strong id="sho-sys-cpu">--%</strong></div><div class="sho-sysrow"><div><b>MEMORY</b><span>REALTIME</span></div><strong id="sho-sys-ram">--%</strong></div><div class="sho-sysrow"><div><b>STORAGE</b><span>REALTIME</span></div><strong id="sho-sys-disk">--%</strong></div><div class="sho-sysrow"><div><b>VOICE</b><span>JARVIS / LIVEKIT</span></div><strong>READY</strong></div><div class="sho-sysrow"><div><b>EXTENSIONS</b><span>SHINO ROOT</span></div><strong>ON</strong></div></section>
        </main>

        <nav class="sho-dock" id="sho-dock"><button class="active" data-mode="RISO"><b>RISO</b><small>OPERATIONS</small></button><button data-mode="MUSIC"><b>MUSIC</b><small>SHINOBIWAN</small></button><button data-mode="DEV"><b>DEV</b><small>DEVELOPMENT</small></button><button data-mode="FILES"><b>FILES</b><small>DOCUMENTS</small></button><button data-mode="PC"><b>PC</b><small>SYSTEM</small></button><button data-mode="SETTINGS"><b>SETTINGS</b><small>CONFIG</small></button><button class="sho-close" id="sho-close">×</button></nav>
      </div>`;
  }

  function ensureContainer() {
    if (container) return container;
    ensureStyle();
    container = document.createElement('div');
    container.id = `${VIEW_ID}-container`;
    container.dataset.state = coreState;
    Object.assign(container.style,{position:'fixed',inset:'0',zIndex:'2',display:'none',opacity:'0',transition:'opacity .25s ease'});
    container.innerHTML = markup();
    document.body.appendChild(container);
    canvas = container.querySelector('#sho-corecanvas');
    ctx = canvas.getContext('2d');
    initNodes();
    bindUi();
    return container;
  }

  function q(sel) { return container?.querySelector(sel); }
  function qa(sel) { return container ? [...container.querySelectorAll(sel)] : []; }
  function setText(sel, value) { const el=q(sel); if(el) el.textContent=value; }
  function pct(v) { return Math.max(0,Math.min(100,Number(v)||0)); }

  function setState(next) {
    if (!STATES.includes(next)) return;
    coreState = next;
    if (!container) return;
    container.dataset.state = next;
    setText('#sho-core-state',COPY[next][0]);
    setText('#sho-service',COPY[next][1]);
  }

  function setMode(next) {
    mode = String(next || 'RISO').toUpperCase();
    setText('#sho-mode',mode);
    qa('#sho-dock [data-mode]').forEach((b)=>b.classList.toggle('active',b.dataset.mode===mode));
    setState('working');
    setTimeout(()=>visible&&setState('idle'),700);
  }

  function bindUi() {
    qa('#sho-dock [data-mode]').forEach((b)=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
    q('#sho-close').addEventListener('click',hideView);
    q('#sho-corewrap').addEventListener('click',()=>{const i=STATES.indexOf(coreState);setState(STATES[(i+1)%STATES.length]);});
    qa('.sho-rail button').forEach((b)=>b.addEventListener('click',()=>{qa('.sho-rail button').forEach(x=>x.classList.remove('active'));b.classList.add('active');}));
  }

  function initNodes() {
    nodes=[];
    for(let i=0;i<86;i++){
      const u=Math.random()*2-1, a=Math.random()*Math.PI*2, r=.2+Math.pow(Math.random(),.6)*.8, s=Math.sqrt(1-u*u);
      nodes.push({x:r*s*Math.cos(a),y:r*u,z:r*s*Math.sin(a),seed:Math.random()*20,size:.5+Math.random()*1.5});
    }
  }

  function resizeCanvas() {
    if(!canvas) return null;
    const rect=canvas.getBoundingClientRect();
    const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    return {w:rect.width,h:rect.height};
  }

  function drawCore() {
    if(!visible||!ctx||!canvas) return;
    const sz=resizeCanvas();
    if(!sz){animFrame=requestAnimationFrame(drawCore);return;}
    const {w,h}=sz,cx=w/2,cy=h/2;
    const rgb=RGB[coreState]||RGB.idle;
    const speed=coreState==='thinking'?.024:coreState==='error'?.038:coreState==='speaking'?.021:coreState==='listening'?.018:.011;
    phase+=speed;
    ctx.clearRect(0,0,w,h);
    ctx.save();ctx.globalCompositeOperation='lighter';

    const breathe=1+Math.sin(phase*3)*((coreState==='listening'||coreState==='speaking')?.035:.012);
    const contraction=coreState==='thinking'?.78+Math.sin(phase*4)*.04:1;
    const radius=Math.min(w,h)*.43*breathe*contraction;
    const projected=[];
    for(const n of nodes){
      const ay=phase*.52+n.seed*.002, ax=Math.sin(phase*.21)*.18;
      const x1=n.x*Math.cos(ay)-n.z*Math.sin(ay),z1=n.x*Math.sin(ay)+n.z*Math.cos(ay);
      const y1=n.y*Math.cos(ax)-z1*Math.sin(ax),z2=n.y*Math.sin(ax)+z1*Math.cos(ax);
      const perspective=1/(1.65-z2*.35);
      const jitter=coreState==='error'?(Math.random()-.5)*4:0;
      projected.push({x:cx+x1*radius*perspective+jitter,y:cy+y1*radius*perspective+jitter,z:z2,p:perspective,n});
    }

    for(let i=0;i<projected.length;i++){
      const a=projected[i];
      for(let j=i+1;j<projected.length;j++){
        const b=projected[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.sqrt(dx*dx+dy*dy);
        if(d<Math.min(w,h)*.105){
          const alpha=(1-d/(Math.min(w,h)*.105))*.16*Math.max(.3,(a.p+b.p)/2);
          ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        }
      }
    }

    for(let i=0;i<18;i++){
      const t=phase*(.35+i*.009)+i*.93, r=radius*(.18+(i%6)*.105), x=cx+Math.cos(t*1.13)*r, y=cy+Math.sin(t*.91)*r*.72;
      const x2=cx+Math.cos(t*1.31+1.4)*r*.7,y2=cy+Math.sin(t*1.07+1.1)*r*.55;
      ctx.strokeStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${.12+(i%3)*.045})`;ctx.lineWidth=1.1+(i%4)*.22;ctx.beginPath();ctx.moveTo(x,y);ctx.quadraticCurveTo(cx+Math.sin(t)*r*.25,cy+Math.cos(t*.8)*r*.2,x2,y2);ctx.stroke();
    }

    for(const p of projected){
      const alpha=.26+p.p*.38+(p.z+1)*.08, rr=p.n.size*p.p*1.45;
      ctx.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Math.min(.95,alpha)})`;ctx.shadowBlur=9;ctx.shadowColor=`rgb(${rgb.join(',')})`;ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();
    }

    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,radius*.29);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.08,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.82)`);g.addColorStop(.35,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.17)`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.shadowBlur=34;ctx.shadowColor=`rgb(${rgb.join(',')})`;ctx.beginPath();ctx.arc(cx,cy,radius*.3,0,Math.PI*2);ctx.fill();
    ctx.restore();
    animFrame=requestAnimationFrame(drawCore);
  }

  function updateClock() {
    const d=new Date();
    const fmt=new Intl.DateTimeFormat('fr-FR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(d).toUpperCase();
    setText('#sho-date',fmt);setText('#sho-clock',d.toLocaleTimeString('fr-FR'));
  }

  function apiFetch(path){return fetch(window.location.origin+path,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(String(r.status));return r.json();});}
  function applyPerf(d){
    if(!d)return;const cpu=pct(d.cpu_pct),ram=pct(d.ram_pct),disk=pct(d.disk_pct??d.disk_used_pct);
    [['cpu',cpu],['ram',ram],['disk',disk]].forEach(([k,v])=>{setText(`#sho-${k}`,`${Math.round(v)}%`);setText(`#sho-sys-${k}`,`${Math.round(v)}%`);setText(`#sho-top-${k}`,`${Math.round(v)}%`);const bar=q(`#sho-${k}-bar`);if(bar)bar.style.width=`${v}%`;});
  }
  async function fetchPerf(){try{applyPerf(await apiFetch('/api/system/perf'));}catch(_){setText('#sho-backend','API WAIT');}}
  async function fetchBrain(){
    try{
      const d=await apiFetch('/api/config/llm-status');
      const raw=String(d.backend||d.provider||d.api_backend||d.active_backend||d.model||'ONLINE');const upper=raw.toUpperCase();setText('#sho-brain-label',upper);setText('#sho-backend','ONLINE');
      qa('.sho-brainopt').forEach(el=>{const key=el.dataset.brain;const match=key==='OPENAI'?upper.includes('OPENAI'):(key==='LOCAL'?upper.includes('OLLAMA')||upper.includes('LOCAL'):(!upper.includes('OPENAI')&&!upper.includes('OLLAMA')&&!upper.includes('LOCAL')));el.classList.toggle('active',match);});
    }catch(_){setText('#sho-brain-label','JARVIS');}
  }
  function refresh(){fetchPerf();fetchBrain();}

  function start() {
    visible=true;updateClock();refresh();
    clockTimer=setInterval(updateClock,1000);perfTimer=setInterval(fetchPerf,1500);slowTimer=setInterval(fetchBrain,7000);
    cancelAnimationFrame(animFrame);animFrame=requestAnimationFrame(drawCore);
  }
  function stop(){visible=false;clearInterval(clockTimer);clearInterval(perfTimer);clearInterval(slowTimer);clockTimer=perfTimer=slowTimer=null;cancelAnimationFrame(animFrame);animFrame=null;}
  function hideView(){if(!container)return;stop();container.style.opacity='0';setTimeout(()=>{if(container)container.style.display='none';},260);}

  Jarvis.views.register(VIEW_ID,{
    meta:{name:'SHINO Command Center',desc:'Cockpit SHINO-OS ultrawide alimenté par Jarvis',glyph:'SHO',tags:['shino','system','ultrawide','ai']},
    show(params={}){ensureContainer();if(container.style.display!=='none')return;container.style.display='block';container.getBoundingClientRect();container.style.opacity='1';if(params.mode)setMode(params.mode);if(params.state)setState(params.state);start();},
    hide(){hideView();},
    command(cmd,params={}){if(cmd==='set_state')setState(String(params.state||'idle').toLowerCase());else if(cmd==='set_mode')setMode(params.mode);else if(cmd==='refresh')refresh();},
  });
})();
