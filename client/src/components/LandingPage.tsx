import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pen, Square, Circle, Type, ArrowRight, MousePointer2,
  ScanSearch, Zap, Lightbulb, Users, GraduationCap, Link,
  Shield, Monitor, ChevronRight, Sparkles, Bot, MessageSquare,
  Layers, Diamond, GitBranch, Cpu, Binary, Network, BrainCircuit,
  Play, Check, AlertTriangle, Info
} from "lucide-react";

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

/* ── tiny hook: mouse‑relative glow on a card ── */
function useCardGlow() {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);
  return { ref, onMove };
}

function GlowCard({ children, className = "", big = false }: { children: React.ReactNode; className?: string; big?: boolean }) {
  const { ref, onMove } = useCardGlow();
  return (
    <div ref={ref} onMouseMove={onMove} className={`lp-glow-card ${big ? "lp-glow-big" : ""} ${className}`}>
      <div className="lp-glow-spot" />
      {children}
    </div>
  );
}

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeDiagram, setActiveDiagram] = useState(0);
  const [activeAiTab, setActiveAiTab] = useState<"explain" | "correct" | "chat">("explain");
  const heroRef = useRef<HTMLDivElement>(null);

  // ── scroll reveal ──
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e, i) => {
        if (e.isIntersecting) {
          setTimeout(() => e.target.classList.add("lp-visible"), i * 80);
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".lp-reveal").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── counter animation ──
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseInt(el.dataset.count || "0", 10);
        let cur = 0;
        const step = Math.max(1, Math.ceil(target / 45));
        const iv = setInterval(() => { cur = Math.min(cur + step, target); el.textContent = String(cur); if (cur >= target) clearInterval(iv); }, 25);
        obs.unobserve(el);
      });
    }, { threshold: 0.5 });
    document.querySelectorAll<HTMLElement>(".lp-counter").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // ── hero parallax on mouse ──
  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const handler = (e: MouseEvent) => {
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx, dy = (e.clientY - cy) / cy;
      hero.style.setProperty("--px", `${dx * 18}px`);
      hero.style.setProperty("--py", `${dy * 12}px`);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // ── canvas ER animation ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect();
      canvas!.width = rect.width * dpr; canvas!.height = rect.height * dpr;
      canvas!.style.width = rect.width + "px"; canvas!.style.height = rect.height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize(); window.addEventListener("resize", resize);
    const w = () => canvas!.width / dpr, h = () => canvas!.height / dpr;
    function rrect(x: number, y: number, wi: number, hi: number, r: number, stroke: string, fill: string) {
      ctx!.beginPath(); ctx!.moveTo(x+r,y); ctx!.lineTo(x+wi-r,y); ctx!.quadraticCurveTo(x+wi,y,x+wi,y+r);
      ctx!.lineTo(x+wi,y+hi-r); ctx!.quadraticCurveTo(x+wi,y+hi,x+wi-r,y+hi); ctx!.lineTo(x+r,y+hi);
      ctx!.quadraticCurveTo(x,y+hi,x,y+hi-r); ctx!.lineTo(x,y+r); ctx!.quadraticCurveTo(x,y,x+r,y); ctx!.closePath();
      if(fill){ctx!.fillStyle=fill;ctx!.fill()} ctx!.strokeStyle=stroke;ctx!.lineWidth=1.5;ctx!.stroke();
    }
    function diam(cx:number,cy:number,rw:number,rh:number,s:string){ctx!.beginPath();ctx!.moveTo(cx,cy-rh);ctx!.lineTo(cx+rw,cy);ctx!.lineTo(cx,cy+rh);ctx!.lineTo(cx-rw,cy);ctx!.closePath();ctx!.strokeStyle=s;ctx!.lineWidth=1.5;ctx!.stroke();ctx!.fillStyle="rgba(236,72,153,0.06)";ctx!.fill()}
    function ell(cx:number,cy:number,rx:number,ry:number,s:string){ctx!.beginPath();ctx!.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx!.strokeStyle=s;ctx!.lineWidth=1.5;ctx!.stroke();ctx!.fillStyle="rgba(16,185,129,0.06)";ctx!.fill()}
    function ln(x1:number,y1:number,x2:number,y2:number,c="rgba(255,255,255,0.15)"){ctx!.beginPath();ctx!.moveTo(x1,y1);ctx!.lineTo(x2,y2);ctx!.strokeStyle=c;ctx!.lineWidth=1;ctx!.stroke()}
    function lbl(t:string,x:number,y:number,c="rgba(255,255,255,0.5)",s=12){ctx!.font=`500 ${s}px Inter,sans-serif`;ctx!.fillStyle=c;ctx!.textAlign="center";ctx!.fillText(t,x,y)}
    let progress=0; const max=300; let rafId=0;
    function draw(){
      ctx!.clearRect(0,0,w(),h()); const cx=w()/2,cy=h()/2; const t=Math.min(progress/max,1);
      if(t>.05){const a=Math.min((t-.05)/.15,1);ctx!.globalAlpha=a;rrect(cx-260,cy-45,120,50,6,"#818cf8","rgba(129,140,248,0.06)");lbl("Student",cx-200,cy-15,"rgba(255,255,255,0.7)",13);ctx!.globalAlpha=1}
      if(t>.25){const a=Math.min((t-.25)/.15,1);ctx!.globalAlpha=a;rrect(cx+140,cy-45,120,50,6,"#818cf8","rgba(129,140,248,0.06)");lbl("Course",cx+200,cy-15,"rgba(255,255,255,0.7)",13);ctx!.globalAlpha=1}
      if(t>.4){const a=Math.min((t-.4)/.15,1);ctx!.globalAlpha=a;diam(cx,cy-20,50,30,"#ec4899");lbl("Enrolls",cx,cy-15,"rgba(255,255,255,0.6)",11);ctx!.globalAlpha=1}
      if(t>.55){const a=Math.min((t-.55)/.1,1);ctx!.globalAlpha=a;ln(cx-140,cy-20,cx-50,cy-20,"rgba(255,255,255,0.2)");ln(cx+50,cy-20,cx+140,cy-20,"rgba(255,255,255,0.2)");ctx!.globalAlpha=1}
      if(t>.65){const a=Math.min((t-.65)/.15,1);ctx!.globalAlpha=a;ell(cx-260,cy+50,40,18,"#10b981");lbl("name",cx-260,cy+55,"rgba(255,255,255,0.5)",10);ell(cx-140,cy+50,40,18,"#10b981");lbl("id",cx-140,cy+55,"rgba(255,255,255,0.5)",10);ln(cx-260,cy+32,cx-240,cy+5,"rgba(255,255,255,0.12)");ln(cx-140,cy+32,cx-180,cy+5,"rgba(255,255,255,0.12)");ctx!.globalAlpha=1}
      if(t>.78){const a=Math.min((t-.78)/.15,1);ctx!.globalAlpha=a;ell(cx+200,cy+50,45,18,"#10b981");lbl("title",cx+200,cy+55,"rgba(255,255,255,0.5)",10);ln(cx+200,cy+32,cx+200,cy+5,"rgba(255,255,255,0.12)");ell(cx+90,cy+60,40,18,"#10b981");lbl("credits",cx+90,cy+65,"rgba(255,255,255,0.5)",10);ln(cx+90,cy+42,cx+155,cy+5,"rgba(255,255,255,0.12)");ctx!.globalAlpha=1}
      if(progress<max){progress++;rafId=requestAnimationFrame(draw)}
    }
    const cObs=new IntersectionObserver(e=>{if(e[0].isIntersecting){progress=0;draw();cObs.unobserve(canvas!)}},{threshold:.2});
    cObs.observe(canvas);
    return ()=>{cancelAnimationFrame(rafId);cObs.disconnect();window.removeEventListener("resize",resize)};
  },[]);

  // ── AI typing ──
  useEffect(()=>{
    const msgs=["I see two entities connected by a relationship diamond. This follows Chen notation for ER diagrams.","Consider adding cardinality labels (1:N) to clarify the relationship."];
    let cancelled=false;
    async function type(el:HTMLElement|null,text:string){if(!el)return;el.textContent="";for(let i=0;i<text.length&&!cancelled;i++){el.textContent+=text[i];await new Promise(r=>setTimeout(r,22))}}
    (async()=>{await new Promise(r=>setTimeout(r,1500));await type(document.getElementById("lp-ai-msg-1"),msgs[0]);await new Promise(r=>setTimeout(r,600));await type(document.getElementById("lp-ai-msg-2"),msgs[1])})();
    return ()=>{cancelled=true};
  },[]);

  const diagrams = [
    { icon: GitBranch, label: "Flowcharts" },
    { icon: Diamond, label: "ER Diagrams" },
    { icon: Layers, label: "UML Class" },
    { icon: Cpu, label: "Circuit Diagrams" },
    { icon: Network, label: "State Machines" },
    { icon: Binary, label: "Logic Gates" },
    { icon: BrainCircuit, label: "Mind Maps" },
  ];

  const features = [
    { icon: Pen, title: "Infinite Canvas", desc: "Pan, zoom, and draw without limits. Full shape library for flowcharts, ER, UML, circuits, and more." },
    { icon: ScanSearch, title: "AI Identification", desc: "Automatically recognizes diagram types and components with confidence scoring." },
    { icon: Zap, title: "Smart Corrections", desc: "AI flags notation errors and inconsistencies with actionable fix suggestions." },
    { icon: Lightbulb, title: "Contextual Explanations", desc: "Plain-language explanations of every component, tuned to your proficiency level." },
    { icon: Users, title: "Real-Time Collaboration", desc: "Up to 25 participants with live cursors, named colors, and CRDT-powered sync." },
    { icon: GraduationCap, title: "Instructor Mode", desc: "Monitor all student boards in a live grid. Annotate, spotlight, and guide." },
  ];

  return (
    <div className="lp-root">
      {/* ── NAV ── */}
      <nav className="lp-nav">
        <div className="lp-nav-inner">
          <a href="#" className="lp-logo">
            <svg viewBox="0 0 32 32" fill="none" width="28" height="28"><path d="M16 2L28 8V24L16 30L4 24V8L16 2Z" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="16" r="4" fill="currentColor" opacity=".6"/></svg>
            <span>Daedalus</span>
          </a>
          <div className="lp-nav-links">
            <a href="#lp-features">Features</a>
            <a href="#lp-ai">AI Engine</a>
            <a href="#lp-collab">Collaboration</a>
          </div>
          <div className="lp-nav-actions">
            <button className="lp-btn-ghost lp-btn-sm" onClick={onSignIn}>Sign In</button>
            <button className="lp-btn-primary lp-btn-sm" onClick={onGetStarted}>Start Free <ChevronRight size={14}/></button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="lp-hero" ref={heroRef}>
        <div className="lp-hero-bg">
          <div className="lp-grid-overlay"/>
          <div className="lp-orb lp-orb1" style={{transform:"translate(var(--px,0),var(--py,0))"}}/>
          <div className="lp-orb lp-orb2" style={{transform:"translate(calc(var(--px,0) * -1),var(--py,0))"}}/>
          <div className="lp-orb lp-orb3"/>
        </div>
        <div className="lp-hero-content">
          <div className="lp-badge"><span className="lp-badge-dot"/><Sparkles size={13}/> Now in Public Beta</div>
          <h1><span className="lp-line">Draw together.</span><span className="lp-line lp-gradient">Think together.</span><span className="lp-line">Learn together.</span></h1>
          <p className="lp-hero-sub">A real-time collaborative whiteboard with an AI co-pilot that identifies your diagrams, explains concepts, and catches mistakes — before your instructor does.</p>
          <div className="lp-hero-cta">
            <button className="lp-btn-primary lp-btn-lg" onClick={onGetStarted}>Open a Board <ArrowRight size={18}/></button>
            <a href="#lp-features" className="lp-btn-ghost lp-btn-lg"><Play size={15}/> See How It Works</a>
          </div>
          <div className="lp-metrics">
            <div className="lp-metric"><span className="lp-counter" data-count="88">0</span><span className="lp-msuf">%</span><span className="lp-mlbl">AI Accuracy</span></div>
            <div className="lp-mdiv"/>
            <div className="lp-metric"><span className="lp-counter" data-count="100">0</span><span className="lp-msuf">ms</span><span className="lp-mlbl">Sync Latency</span></div>
            <div className="lp-mdiv"/>
            <div className="lp-metric"><span className="lp-counter" data-count="25">0</span><span className="lp-msuf">+</span><span className="lp-mlbl">Users / Board</span></div>
          </div>
        </div>

        {/* ── Canvas Preview ── */}
        <div className="lp-canvas-wrap lp-reveal">
          <div className="lp-chrome">
            <div className="lp-chrome-dots"><span/><span/><span/></div>
            <span className="lp-chrome-title">Daedalus — ER Diagram Session</span>
            <div className="lp-avatars"><div className="lp-av" style={{background:"#6366f1"}}>P</div><div className="lp-av" style={{background:"#ec4899"}}>S</div><div className="lp-av" style={{background:"#10b981"}}>A</div></div>
          </div>
          <div className="lp-canvas-body">
            {/* Interactive mini toolbar */}
            <div className="lp-mini-toolbar">
              {[MousePointer2,Pen,Square,Circle,Type,ArrowRight].map((Icon,i)=>(
                <button key={i} className={`lp-tool-btn${i===1?" active":""}`}><Icon size={16}/></button>
              ))}
            </div>
            <canvas ref={canvasRef}/>
            <div className="lp-ai-panel">
              <div className="lp-ai-header"><div className="lp-ai-icon"><Bot size={14}/></div><span>AI Explainer</span><span className="lp-ai-dot"/></div>
              <div className="lp-ai-body">
                <div className="lp-ai-badge"><Check size={12}/> ER Diagram — Chen Notation <span className="lp-confidence">92%</span></div>
                <p className="lp-ai-msg" id="lp-ai-msg-1"/>
                <p className="lp-ai-msg" id="lp-ai-msg-2"/>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="lp-features" className="lp-section">
        <div className="lp-sec-header">
          <span className="lp-tag"><Layers size={13}/> Core Capabilities</span>
          <h2>Everything you need on <span className="lp-gradient">one infinite canvas</span></h2>
          <p className="lp-sec-sub">Drawing tools, AI intelligence, and real-time collaboration — unified in a single experience.</p>
        </div>
        <div className="lp-feat-grid">
          {features.map((f) => (
            <GlowCard key={f.title} className="lp-reveal">
              <div className="lp-feat-icon-wrap"><f.icon size={22}/></div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </GlowCard>
          ))}
        </div>
      </section>

      {/* ── AI ENGINE ── */}
      <section id="lp-ai" className="lp-section">
        <div className="lp-sec-header">
          <span className="lp-tag"><BrainCircuit size={13}/> AI-Powered</span>
          <h2>An always-on tutor <span className="lp-gradient">watching your canvas</span></h2>
          <p className="lp-sec-sub">Powered by vision-capable multimodal AI. It sees what you draw, understands context, and responds in real-time.</p>
        </div>

        {/* Interactive AI demo tabs */}
        <div className="lp-ai-demo lp-reveal">
          <div className="lp-ai-tabs">
            {([["explain","Explain",Lightbulb],["correct","Correct",AlertTriangle],["chat","Chat",MessageSquare]] as const).map(([key,label,Icon])=>(
              <button key={key} className={`lp-ai-tab${activeAiTab===key?" active":""}`} onClick={()=>setActiveAiTab(key)}>
                <Icon size={15}/> {label}
              </button>
            ))}
          </div>
          <div className="lp-ai-demo-body">
            {activeAiTab==="explain" && (
              <div className="lp-ai-demo-content">
                <div className="lp-ai-demo-badge"><Check size={14}/> <strong>ER Diagram — Chen Notation</strong> <span>92% confidence</span></div>
                <div className="lp-ai-demo-item"><Info size={14} className="lp-icon-accent"/> <span>The <strong>rectangle</strong> labeled "Student" represents an <strong>entity</strong> — a real-world object being modeled.</span></div>
                <div className="lp-ai-demo-item"><Info size={14} className="lp-icon-accent"/> <span>The <strong>diamond</strong> shape represents a <strong>relationship</strong> between the Student and Course entities.</span></div>
                <div className="lp-ai-demo-item"><Info size={14} className="lp-icon-green"/> <span>The <strong>ellipses</strong> attached to entities are <strong>attributes</strong> — properties like name, id, title.</span></div>
              </div>
            )}
            {activeAiTab==="correct" && (
              <div className="lp-ai-demo-content">
                <div className="lp-correction-item lp-err"><AlertTriangle size={14}/> <div><strong>Mixed notation styles</strong><p>You're using both Chen and Crow's Foot notation in the same diagram. Pick one for consistency.</p></div></div>
                <div className="lp-correction-item lp-warn"><AlertTriangle size={14}/> <div><strong>Missing cardinality</strong><p>The "Enrolls" relationship has no cardinality labels. Add 1:N or M:N notation.</p></div></div>
                <div className="lp-correction-item lp-tip"><Lightbulb size={14}/> <div><strong>Add primary key</strong><p>Consider underlining "id" to indicate it's the primary key attribute.</p></div></div>
              </div>
            )}
            {activeAiTab==="chat" && (
              <div className="lp-ai-demo-content lp-chat-demo">
                <div className="lp-chat-msg lp-chat-user"><span>What's the difference between Chen and Crow's Foot notation?</span></div>
                <div className="lp-chat-msg lp-chat-ai"><Bot size={14}/><span>Chen notation uses <strong>diamonds for relationships</strong> and <strong>ovals for attributes</strong>. Crow's Foot uses <strong>fork symbols</strong> at line ends to show cardinality. Chen is more common in academic settings, while Crow's Foot is preferred in industry.</span></div>
              </div>
            )}
          </div>
        </div>

        {/* Interactive diagram type selector */}
        <div className="lp-dtags-wrap lp-reveal">
          <h4>Supported Diagram Types</h4>
          <div className="lp-dtags">
            {diagrams.map((d, i) => (
              <button key={d.label} className={`lp-dtag${activeDiagram===i?" active":""}`} onClick={()=>setActiveDiagram(i)} onMouseEnter={()=>setActiveDiagram(i)}>
                <d.icon size={16}/> {d.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── COLLABORATION ── */}
      <section id="lp-collab" className="lp-section">
        <div className="lp-sec-header">
          <span className="lp-tag"><Users size={13}/> Multiplayer</span>
          <h2>Built for teams that <span className="lp-gradient">think visually</span></h2>
          <p className="lp-sec-sub">Share a link, start sketching. No installs, no friction.</p>
        </div>
        <div className="lp-collab-grid">
          {[
            { icon: Link, title: "Instant Sharing", desc: "One link, no account needed for guests. Jump right in." },
            { icon: MousePointer2, title: "Live Cursors", desc: "See everyone's position and tools in real time." },
            { icon: Shield, title: "Conflict-Free", desc: "CRDT-powered sync — no edits are ever lost." },
            { icon: Monitor, title: "Instructor Mode", desc: "Monitor all student boards in a live grid." },
          ].map((f) => (
            <GlowCard key={f.title} className="lp-reveal">
              <div className="lp-collab-icon-wrap"><f.icon size={22}/></div>
              <h4>{f.title}</h4>
              <p>{f.desc}</p>
            </GlowCard>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta">
        <div className="lp-orb lp-orb-cta1"/><div className="lp-orb lp-orb-cta2"/>
        <div className="lp-cta-inner">
          <h2>Ready to sketch <span className="lp-gradient">something brilliant?</span></h2>
          <p>Open a board in seconds. No account required. Free during beta.</p>
          <button className="lp-btn-primary lp-btn-lg lp-btn-glow" onClick={onGetStarted}>Open a Board <ArrowRight size={18}/></button>
          <p className="lp-cta-note">No credit card · No signup · Instant access</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-logo"><svg viewBox="0 0 32 32" fill="none" width="24" height="24"><path d="M16 2L28 8V24L16 30L4 24V8L16 2Z" stroke="currentColor" strokeWidth="2"/><circle cx="16" cy="16" r="4" fill="currentColor" opacity=".6"/></svg> Daedalus</span>
            <p>Collaborative AI Whiteboard for visual thinkers.</p>
          </div>
        </div>
        <div className="lp-footer-bottom"><p>© 2026 Daedalus. All rights reserved.</p></div>
      </footer>
    </div>
  );
}
