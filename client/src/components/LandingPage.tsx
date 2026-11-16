import { useEffect, useRef } from "react";
import * as THREE from "three";

interface LandingPageProps {
  onGetStarted: () => void;
  onSignIn: () => void;
}

export function LandingPage({ onGetStarted, onSignIn }: LandingPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Guarantee smooth page scrolling when LandingPage is mounted
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflowY = "auto";
    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowY = "auto";
    document.documentElement.style.overflowX = "hidden";

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, []);

  // Three.js 3D Greek Labyrinth Wireframe
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 16, 36);
    camera.lookAt(0, 0, 0);

    const labyrinthGroup = new THREE.Group();
    scene.add(labyrinthGroup);

    // Concentric Square Labyrinth Paths
    const ringCount = 12;
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      linewidth: 1
    });

    for (let r = 2; r <= ringCount; r++) {
      const size = r * 2.4;
      const half = size / 2;
      const points = [
        new THREE.Vector3(-half, 0, -half),
        new THREE.Vector3(half, 0, -half),
        new THREE.Vector3(half, 0, half),
        new THREE.Vector3(-half + 1.2, 0, half),
        new THREE.Vector3(-half + 1.2, 0, -half + 1.2)
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, lineMaterial);
      labyrinthGroup.add(line);
    }

    // Floating Starlight Particles
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 70;
      positions[i + 1] = (Math.random() - 0.5) * 35;
      positions[i + 2] = (Math.random() - 0.5) * 70;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.1,
      transparent: true,
      opacity: 0.35
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    let animationFrameId: number;
    let rotX = 0.45;
    let targetRotY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      targetRotY = nx * 0.25;
    };
    window.addEventListener("mousemove", handleMouseMove);

    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      labyrinthGroup.rotation.y += 0.001;
      labyrinthGroup.rotation.x = rotX;
      labyrinthGroup.rotation.z += (targetRotY - labyrinthGroup.rotation.z) * 0.05;
      particles.rotation.y -= 0.0003;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, []);

  return (
    <div className="sm-landing-root">
      <canvas ref={canvasRef} className="sm-canvas-bg" />
      <div className="sm-grain" />

      <div className="sm-content">
        {/* Minimal Studio MACACO Header */}
        <header className="sm-nav">
          <div className="sm-nav-inner">
            <div className="sm-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
              <span className="sm-brand-title">DAEDALUS</span>
              <span className="sm-brand-greek">ΔΑΙΔΑΛΟΣ</span>
            </div>

            <div className="sm-nav-actions">
              <button type="button" className="sm-btn-ghost" onClick={onSignIn}>
                SIGN IN
              </button>
              <button type="button" className="sm-btn-launch" onClick={onGetStarted}>
                [ LAUNCH BOARD → ]
              </button>
            </div>
          </div>
        </header>

        {/* Minimal Hero */}
        <section className="sm-hero">
          <div className="sm-hero-eyebrow">THE GREEK MASTER CRAFTSMAN REBORN IN SILICON</div>
          <h1 className="sm-hero-headline">
            THE LIVING<br />
            NEURAL LABYRINTH
          </h1>
          <p className="sm-hero-lead">
            Daedalus constructed the labyrinth of Knossos to contain the impossible. Today, he returns as an intelligent collaborative canvas — synchronizing architectural thought in real-time with an AI co-pilot.
          </p>

          <div className="sm-hero-cta-row">
            <button type="button" className="sm-btn-cta-main" onClick={onGetStarted}>
              [ ENTER THE WHITEBOARD → ]
            </button>
            <button type="button" className="sm-btn-ghost" onClick={onSignIn}>
              EXISTING ACCOUNT // SIGN IN →
            </button>
          </div>

          <div className="sm-hero-stats">
            <span className="sm-stat-item"><b>98%</b> AI ACCURACY</span>
            <span className="sm-stat-item"><b>8ms</b> SYNC LATENCY</span>
            <span className="sm-stat-item"><b>YJS</b> CRDT PROTOCOL</span>
            <span className="sm-stat-item"><b>OPEN SOURCE</b> MIT</span>
          </div>
        </section>

        {/* The Three Pillars of Craft */}
        <section className="sm-pillars-section">
          <div className="sm-section-label">01 // THE PILLARS OF CRAFT</div>

          <div className="sm-pillar-row">
            <div className="sm-pillar-idx">I</div>
            <div className="sm-pillar-content">
              <h3>THE LABYRINTH // DECENTRALIZED CRDT</h3>
              <p>
                Zero collisions. Conflict-free replicated data types synchronize every vector stroke, node movement, and eraser path across global peers with sub-10ms latency.
              </p>
            </div>
          </div>

          <div className="sm-pillar-row">
            <div className="sm-pillar-idx">II</div>
            <div className="sm-pillar-content">
              <h3>THE WINGS // INFINITE VECTOR EXPORT</h3>
              <p>
                Engineered with mathematical precision. Export full canvases to infinite-resolution SVG vectors, high-DPI PNGs, and encrypted version snapshots preserved across time.
              </p>
            </div>
          </div>

          <div className="sm-pillar-row">
            <div className="sm-pillar-idx">III</div>
            <div className="sm-pillar-content">
              <h3>THE TALOS ENGINE // MULTIMODAL AI</h3>
              <p>
                The ancient bronze guardian reborn as multimodal AI. Identifies system sketches, validates database schemas, and catches logic mistakes before you ship.
              </p>
            </div>
          </div>
        </section>

        {/* Minimalist Manifesto */}
        <section className="sm-manifesto">
          <blockquote className="sm-quote">
            “ART IS NOT IMITATION, BUT INVENTION. TO CONQUER THE IMPOSSIBLE, FIRST SKETCH THE FOUNDATION.”
          </blockquote>
          <div className="sm-quote-author">
            — DAEDALUS [ΔΑΙΔΑΛΟΣ] · MASTER ARCHITECT OF ATHENS
          </div>
          <button type="button" className="sm-btn-cta-main" onClick={onGetStarted}>
            [ LAUNCH WORKSPACE NOW → ]
          </button>
        </section>

        {/* Clean Footer */}
        <footer className="sm-footer">
          <span>© 2026 DAEDALUS · ATHENS // SILICON</span>
          <a href="https://github.com/ash-ftw/Daedalus" target="_blank" rel="noopener noreferrer">
            GITHUB REPO [OPEN SOURCE]
          </a>
        </footer>
      </div>
    </div>
  );
}
