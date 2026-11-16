/**
 * DAEDALUS 2.0 — LUXURY MONOCHROME EDITION
 * Masterpiece Script: GSAP, Lenis, Three.js, Anime.js, Trig.js & React Spring
 */

(async function initDaedalusMonochrome() {
  'use strict';

  // =========================================================================
  // 0. DEPENDENCY RESOLUTION & RESILIENT FALLBACKS
  // =========================================================================
  let THREE = window.THREE;
  let gsap = window.gsap;
  let ScrollTrigger = window.ScrollTrigger;
  let Lenis = window.Lenis;
  let anime = window.anime;

  if (!THREE) {
    try { THREE = await import('three'); } catch (e) { console.warn('Three.js fallback', e); }
  }
  if (!gsap) {
    try {
      const gsapMod = await import('gsap');
      gsap = gsapMod.default || gsapMod.gsap;
    } catch (e) { console.warn('GSAP fallback', e); }
  }
  if (!ScrollTrigger && gsap) {
    try {
      const stMod = await import('gsap/ScrollTrigger');
      ScrollTrigger = stMod.ScrollTrigger;
    } catch (e) { console.warn('ScrollTrigger fallback', e); }
  }
  if (!Lenis) {
    try {
      const lenisMod = await import('lenis');
      Lenis = lenisMod.default || lenisMod;
    } catch (e) { console.warn('Lenis fallback', e); }
  }
  if (!anime) {
    try {
      const animeMod = await import('animejs');
      anime = animeMod.default || animeMod;
    } catch (e) { console.warn('Anime.js fallback', e); }
  }

  if (gsap && ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  // =========================================================================
  // 1. WEB AUDIO SYNTHESIZER (Micro-Haptic Acoustic Synth)
  // =========================================================================
  const AudioEngine = {
    ctx: null,
    enabled: false,

    init() {
      const toggleBtn = document.getElementById('sound-toggle');
      const label = document.getElementById('sound-label');
      if (!toggleBtn) return;

      toggleBtn.addEventListener('click', () => {
        if (!this.ctx) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) this.ctx = new AudioContextClass();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        this.enabled = !this.enabled;
        toggleBtn.classList.toggle('active', this.enabled);
        if (label) label.textContent = this.enabled ? 'Audio: On' : 'Audio: Off';
        if (this.enabled) this.playTone(520, 'sine', 0.15, 0.08);
      });
    },

    playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.05) {
      if (!this.enabled || !this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (err) {
        // Audio error ignored
      }
    },

    playClick() { this.playTone(850, 'triangle', 0.05, 0.035); },
    playSuccess() {
      this.playTone(600, 'sine', 0.16, 0.05);
      setTimeout(() => this.playTone(900, 'sine', 0.22, 0.05), 70);
    },
    playScan() { this.playTone(480, 'sine', 0.2, 0.03); }
  };
  AudioEngine.init();

  // =========================================================================
  // 2. LENIS SMOOTH INERTIAL SCROLLING (lenis.dev)
  // =========================================================================
  let lenisInstance = null;
  if (typeof Lenis !== 'undefined') {
    lenisInstance = new Lenis({
      duration: 1.25,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.5,
    });

    const progressEl = document.getElementById('scroll-progress');
    const velocityEl = document.getElementById('scroll-velocity-indicator');
    const navEl = document.getElementById('main-nav');

    lenisInstance.on('scroll', (e) => {
      if (ScrollTrigger) ScrollTrigger.update();

      // Top progress bar
      if (progressEl) {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const pct = maxScroll > 0 ? (window.scrollY / maxScroll) * 100 : 0;
        progressEl.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      }

      // Nav glassmorphic scroll background
      if (navEl) {
        if (window.scrollY > 40) {
          navEl.classList.add('scrolled');
        } else {
          navEl.classList.remove('scrolled');
        }
      }

      // Velocity indicator in footer
      if (velocityEl) {
        velocityEl.textContent = `Scroll Velocity: ${Math.round(Math.abs(e.velocity || 0))} px/s`;
      }
    });

    if (gsap) {
      gsap.ticker.add((time) => {
        lenisInstance.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
    } else {
      function raf(time) {
        lenisInstance.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    }

    // Anchor link smooth scrolling
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId && targetId !== '#') {
          const target = document.querySelector(targetId);
          if (target) {
            e.preventDefault();
            lenisInstance.scrollTo(target, { offset: -60, duration: 1.4 });
          }
        }
      });
    });
  }

  // =========================================================================
  // 3. THREE.JS 3D MONOCHROME WEBGL MATRIX (threejs.org)
  // Silver & White Star Particle Field & Geometric Wireframes
  // =========================================================================
  (function initThreeMonochrome() {
    const canvas = document.getElementById('threejs-bg');
    if (!canvas || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.0009);

    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 3000);
    camera.position.z = 900;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Particle Stars in Pure Monochrome Platinum/Silver/White
    const particleCount = 1200;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const cWhite = new THREE.Color('#ffffff');
    const cSilver = new THREE.Color('#d4d4d8');
    const cDarkSilver = new THREE.Color('#71717a');

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 2200;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 2200;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;

      const pick = Math.random();
      const col = pick < 0.45 ? cWhite : (pick < 0.8 ? cSilver : cDarkSilver);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pMaterial = new THREE.PointsMaterial({
      size: 3.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });
    const particleSystem = new THREE.Points(geometry, pMaterial);
    scene.add(particleSystem);

    // Minimalist Silver Wireframes
    const wireGroup = new THREE.Group();

    // Central Icosahedron Wireframe
    const icoGeo = new THREE.IcosahedronGeometry(180, 1);
    const icoMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.16
    });
    const icoMesh = new THREE.Mesh(icoGeo, icoMat);
    icoMesh.position.set(280, 50, -100);
    wireGroup.add(icoMesh);

    // Torus Knot Wireframe
    const torusGeo = new THREE.TorusKnotGeometry(120, 30, 80, 16);
    const torusMat = new THREE.MeshBasicMaterial({
      color: 0xd4d4d8,
      wireframe: true,
      transparent: true,
      opacity: 0.12
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);
    torusMesh.position.set(-360, -120, -250);
    wireGroup.add(torusMesh);

    // Octahedron Wireframe
    const octGeo = new THREE.OctahedronGeometry(140, 0);
    const octMat = new THREE.MeshBasicMaterial({
      color: 0xa1a1aa,
      wireframe: true,
      transparent: true,
      opacity: 0.14
    });
    const octMesh = new THREE.Mesh(octGeo, octMat);
    octMesh.position.set(0, -320, -180);
    wireGroup.add(octMesh);

    scene.add(wireGroup);

    // Mouse Parallax coordinates
    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 0;

    window.addEventListener('mousemove', (e) => {
      mouseX = (e.clientX - window.innerWidth / 2) * 0.35;
      mouseY = (e.clientY - window.innerHeight / 2) * 0.35;
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    let clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      targetX += (mouseX - targetX) * 0.05;
      targetY += (mouseY - targetY) * 0.05;

      const scrollY = window.scrollY || 0;

      camera.position.x = targetX * 0.6;
      camera.position.y = -targetY * 0.6 - (scrollY * 0.35);
      camera.position.z = 900 - (scrollY * 0.15);
      camera.lookAt(0, -scrollY * 0.35, 0);

      icoMesh.rotation.x = elapsedTime * 0.14;
      icoMesh.rotation.y = elapsedTime * 0.18;
      torusMesh.rotation.x = elapsedTime * 0.11;
      torusMesh.rotation.z = elapsedTime * 0.15;
      octMesh.rotation.y = elapsedTime * 0.2;

      particleSystem.rotation.y = elapsedTime * 0.025;
      particleSystem.rotation.x = Math.sin(elapsedTime * 0.05) * 0.04;

      renderer.render(scene, camera);
    }
    animate();
  })();

  // =========================================================================
  // 4. GSAP & SCROLLTRIGGER CINEMATIC EFFECTS (gsap.com)
  // =========================================================================
  if (typeof gsap !== 'undefined') {
    // A. Hero Headline SplitText 3D Cascade
    const words = document.querySelectorAll('.word-reveal');
    if (words.length > 0) {
      gsap.fromTo(words, 
        {
          opacity: 0,
          y: 55,
          rotationX: 40,
          transformOrigin: '0% 50% -50'
        },
        {
          opacity: 1,
          y: 0,
          rotationX: 0,
          duration: 1.1,
          stagger: 0.08,
          ease: 'power3.out',
          delay: 0.2
        }
      );
    }

    // B. Hero Subtitle & CTA Entrance
    gsap.fromTo(['#hero-lead', '.hero-cta-group', '.hero-metrics-pill-bar'],
      { opacity: 0, y: 35 },
      { opacity: 1, y: 0, duration: 1, stagger: 0.14, ease: 'power2.out', delay: 0.65 }
    );

    // C. Hero Board 3D Perspective Pop
    const heroCard = document.getElementById('hero-board-card') || document.getElementById('hero-canvas-card');
    if (heroCard) {
      gsap.fromTo(heroCard,
        { opacity: 0, y: 80, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 1.3, ease: 'power3.out', delay: 0.85 }
      );
    }

    // D. PINNED CINEMATIC AI STORYLINE SECTION
    if (ScrollTrigger) {
      const storyContainer = document.getElementById('story-container');
      const storyLaser = document.getElementById('story-laser');
      const storyOverlay = document.getElementById('svg-ai-overlay');
      const steps = [
        document.getElementById('story-step-1'),
        document.getElementById('story-step-2'),
        document.getElementById('story-step-3'),
        document.getElementById('story-step-4')
      ];

      if (storyContainer && steps[0]) {
        ScrollTrigger.create({
          trigger: '#cinematic-story',
          start: 'top top',
          end: '+=2400',
          pin: true,
          scrub: 0.8,
          onUpdate: (self) => {
            const p = self.progress;

            let activeIdx = 0;
            if (p < 0.25) activeIdx = 0;
            else if (p < 0.50) activeIdx = 1;
            else if (p < 0.75) activeIdx = 2;
            else activeIdx = 3;

            steps.forEach((step, idx) => {
              if (step) {
                step.classList.toggle('active', idx === activeIdx);
              }
            });

            // Holographic Laser Scanner
            if (storyLaser) {
              if (p >= 0.25 && p <= 0.75) {
                storyLaser.style.opacity = '1';
                const laserTop = ((p - 0.25) / 0.50) * 100;
                storyLaser.style.top = `${laserTop}%`;
              } else {
                storyLaser.style.opacity = '0';
              }
            }

            // AI schema overlay
            if (storyOverlay) {
              if (p > 0.72) {
                const op = Math.min(1, (p - 0.72) * 4);
                storyOverlay.setAttribute('opacity', op.toFixed(2));
              } else {
                storyOverlay.setAttribute('opacity', '0');
              }
            }
          }
        });
      }

      // E. PINNED HORIZONTAL SCROLL SHOWCASE
      const hSection = document.getElementById('horizontal-scroll-section');
      const hTrack = document.getElementById('horizontal-track');
      if (hSection && hTrack) {
        const totalScroll = hTrack.scrollWidth - window.innerWidth + 120;
        gsap.to(hTrack, {
          x: () => -totalScroll,
          ease: 'none',
          scrollTrigger: {
            trigger: hSection,
            start: 'top top',
            end: () => `+=${totalScroll + 600}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true
          }
        });
      }

      // F. Feature Cards 3D Perspective Roll
      gsap.utils.toArray('.spotlight-glass-card, .conic-laser-card, .persona-target-card, .pipeline-card').forEach((card) => {
        gsap.fromTo(card,
          { opacity: 0, y: 50, rotationX: 10 },
          {
            opacity: 1,
            y: 0,
            rotationX: 0,
            duration: 0.9,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: card,
              start: 'top 85%',
              toggleActions: 'play none none reverse'
            }
          }
        );
      });
    }
  }

  // =========================================================================
  // 5. TRIG.JS HARMONIC WAVE ENGINE (github.com/iDev-Games/Trig-JS)
  // Silver & Platinum Monochrome Sine Wave Oscillations
  // =========================================================================
  (function initTrigMonochromeWaves() {
    const p1 = document.getElementById('trig-wave-path-1');
    const p2 = document.getElementById('trig-wave-path-2');
    const p3 = document.getElementById('trig-wave-path-3');
    if (!p1) return;

    let startTime = performance.now();
    const width = 1200;
    const pointsCount = 48;
    const step = width / (pointsCount - 1);

    function updateTrigPaths() {
      const elapsed = (performance.now() - startTime) * 0.002;
      const scrollOffset = (window.scrollY || 0) * 0.003;

      let d1 = 'M 0 40 ';
      let d2 = 'M 0 40 ';
      let d3 = 'M 0 40 ';

      for (let i = 0; i < pointsCount; i++) {
        const x = i * step;
        const y1 = 40 + Math.sin(x * 0.015 + elapsed * 2.5 + scrollOffset) * 22;
        const y2 = 40 + Math.cos(x * 0.020 + elapsed * 3.2 - scrollOffset * 1.5) * 18;
        const y3 = 40 + Math.sin(x * 0.010 + elapsed * 1.8 + scrollOffset * 0.8) * 26;

        d1 += `L ${x.toFixed(1)} ${y1.toFixed(1)} `;
        d2 += `L ${x.toFixed(1)} ${y2.toFixed(1)} `;
        d3 += `L ${x.toFixed(1)} ${y3.toFixed(1)} `;
      }

      p1.setAttribute('d', d1);
      if (p2) p2.setAttribute('d', d2);
      if (p3) p3.setAttribute('d', d3);

      requestAnimationFrame(updateTrigPaths);
    }
    requestAnimationFrame(updateTrigPaths);
  })();

  // =========================================================================
  // 6. REACT SPRING & MOTION (Physics-based 3D Tilt & Magnetic Buttons)
  // =========================================================================
  (function initSpringPhysics() {
    const tiltCards = document.querySelectorAll('.tilt-card, .horizontal-slide-card, .spotlight-glass-card');

    tiltCards.forEach((card) => {
      let isHovered = false;
      let rotX = 0, rotY = 0;
      let targetRotX = 0, targetRotY = 0;
      let vx = 0, vy = 0;
      const stiffness = 280;
      const damping = 24;

      card.addEventListener('mouseenter', () => { isHovered = true; });
      card.addEventListener('mouseleave', () => {
        isHovered = false;
        targetRotX = 0;
        targetRotY = 0;
      });

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        card.style.setProperty('--mouse-x', `${mouseX}px`);
        card.style.setProperty('--mouse-y', `${mouseY}px`);

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        targetRotX = ((mouseY - centerY) / centerY) * -9;
        targetRotY = ((mouseX - centerX) / centerX) * 9;
      });

      let lastTime = performance.now();
      function updateTilt() {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const ax = -stiffness * (rotX - targetRotX) - damping * vx;
        const ay = -stiffness * (rotY - targetRotY) - damping * vy;

        vx += ax * dt;
        vy += ay * dt;
        rotX += vx * dt;
        rotY += vy * dt;

        if (Math.abs(rotX) > 0.001 || Math.abs(rotY) > 0.001 || isHovered) {
          card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) ${isHovered ? 'scale3d(1.02, 1.02, 1.02)' : 'scale3d(1, 1, 1)'}`;
        }

        requestAnimationFrame(updateTilt);
      }
      requestAnimationFrame(updateTilt);
    });

    // Magnetic Rubber-Band Buttons
    const magneticItems = document.querySelectorAll('.magnetic-btn, .magnetic-item');
    magneticItems.forEach((btn) => {
      let currentX = 0, currentY = 0;
      let targetX = 0, targetY = 0;
      let velX = 0, velY = 0;
      const k = 320, d = 20;

      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const btnCenterX = rect.left + rect.width / 2;
        const btnCenterY = rect.top + rect.height / 2;
        const dist = Math.hypot(e.clientX - btnCenterX, e.clientY - btnCenterY);

        if (dist < 80) {
          targetX = (e.clientX - btnCenterX) * 0.35;
          targetY = (e.clientY - btnCenterY) * 0.35;
        }
      });

      btn.addEventListener('mouseleave', () => {
        targetX = 0;
        targetY = 0;
      });

      let lastTime = performance.now();
      function springStep() {
        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const ax = -k * (currentX - targetX) - d * velX;
        const ay = -k * (currentY - targetY) - d * velY;

        velX += ax * dt;
        velY += ay * dt;
        currentX += velX * dt;
        currentY += velY * dt;

        btn.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
        requestAnimationFrame(springStep);
      }
      requestAnimationFrame(springStep);
    });
  })();

  // =========================================================================
  // 7. ANIME.JS DETAILS (Monochrome Numerical Counters & Vector Lines)
  // =========================================================================
  (function initAnimeDetails() {
    // A. Animated Numerical Metrics
    const metrics = document.querySelectorAll('.metric-val[data-target]');
    if (metrics.length > 0) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const targetEl = entry.target;
            const targetVal = parseInt(targetEl.getAttribute('data-target'), 10);

            if (typeof anime !== 'undefined') {
              anime({
                targets: targetEl,
                innerHTML: [0, targetVal],
                round: 1,
                easing: 'easeOutExpo',
                duration: 2200,
                delay: 200
              });
            } else {
              let count = 0;
              const step = Math.ceil(targetVal / 50);
              const timer = setInterval(() => {
                count = Math.min(count + step, targetVal);
                targetEl.textContent = count;
                if (count >= targetVal) clearInterval(timer);
              }, 30);
            }
            observer.unobserve(targetEl);
          }
        });
      }, { threshold: 0.3 });

      metrics.forEach((m) => observer.observe(m));
    }

    // B. Floating Canvas Cursor Animations
    const c1 = document.getElementById('cursor-priya');
    const c2 = document.getElementById('cursor-sofia');
    const heroCanvasArea = document.getElementById('hero-canvas-container');

    if (c1 && c2 && heroCanvasArea) {
      function moveCollaborator(cursor, minX, maxX, minY, maxY, delay) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);

        if (typeof anime !== 'undefined') {
          anime({
            targets: cursor,
            left: `${x}px`,
            top: `${y}px`,
            duration: 2400 + Math.random() * 1200,
            easing: 'easeInOutCubic',
            delay: delay,
            complete: () => moveCollaborator(cursor, minX, maxX, minY, maxY, 400 + Math.random() * 600)
          });
        } else {
          cursor.style.left = `${x}px`;
          cursor.style.top = `${y}px`;
          setTimeout(() => moveCollaborator(cursor, minX, maxX, minY, maxY, 1000), 2500);
        }
      }

      moveCollaborator(c1, 80, 360, 80, 380, 500);
      moveCollaborator(c2, 280, 580, 100, 420, 1200);
    }

    // C. SVG Dash-Offset Drawing on Connectors
    const svgConnectors = document.querySelectorAll('#story-svg path[stroke-dasharray]');
    if (svgConnectors.length > 0 && typeof anime !== 'undefined') {
      anime({
        targets: svgConnectors,
        strokeDashoffset: [anime.setDashoffset, 0],
        easing: 'easeInOutSine',
        duration: 2400,
        delay: (el, i) => i * 350,
        loop: true,
        direction: 'alternate'
      });
    }

    // D. Hero Monochrome Canvas Demo Drawing
    const heroCanvas = document.getElementById('hero-interactive-canvas') || document.getElementById('hero-canvas');
    if (heroCanvas) {
      const ctx = heroCanvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;

      function resizeHeroCanvas() {
        const rect = heroCanvas.parentElement.getBoundingClientRect();
        heroCanvas.width = rect.width * dpr;
        heroCanvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }
      resizeHeroCanvas();
      window.addEventListener('resize', resizeHeroCanvas);

      let animPhase = 0;
      function renderHeroCanvas() {
        animPhase += 0.02;
        const w = heroCanvas.width / dpr;
        const h = heroCanvas.height / dpr;
        ctx.clearRect(0, 0, w, h);

        // Draw Entity Box: USER (Monochrome Pure White outline)
        ctx.fillStyle = '#111111';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(100, 180, 120, 70, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillText('USER', 140, 218);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '10px sans-serif';
        ctx.fillText('«Entity»', 138, 235);

        // Draw Relationship Diamond: PLACES (Silver Outline)
        const dx = 330, dy = 215;
        ctx.fillStyle = '#111111';
        ctx.strokeStyle = '#d4d4d8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(dx, dy - 35);
        ctx.lineTo(dx + 45, dy);
        ctx.lineTo(dx, dy + 35);
        ctx.lineTo(dx - 45, dy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.fillText('PLACES', dx - 22, dy + 4);

        // Draw Entity Box: ORDER (Monochrome Pure White outline)
        ctx.fillStyle = '#111111';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(440, 180, 120, 70, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px "JetBrains Mono", monospace';
        ctx.fillText('ORDER', 478, 218);
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '10px sans-serif';
        ctx.fillText('«Entity»', 478, 235);

        // Draw Connectors (Dashed Silver Lines)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.setLineDash([5, 5]);
        ctx.lineDashOffset = -animPhase * 20;
        ctx.beginPath();
        ctx.moveTo(220, 215);
        ctx.lineTo(285, 215);
        ctx.moveTo(375, 215);
        ctx.lineTo(440, 215);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pulsing AI Target Scanner Ring (White / Platinum)
        const ringRadius = 18 + Math.sin(animPhase * 3) * 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(330, 215, ringRadius + 30, 0, Math.PI * 2);
        ctx.stroke();

        requestAnimationFrame(renderHeroCanvas);
      }
      requestAnimationFrame(renderHeroCanvas);
    }
  })();

  // =========================================================================
  // 8. INTERACTIVE WHITEBOARD PLAYGROUND MINI-SANDBOX (Monochrome Edition)
  // =========================================================================
  (function initPlaygroundSandbox() {
    const pgCanvas = document.getElementById('playground-live-canvas') || document.getElementById('playground-canvas');
    if (!pgCanvas) return;

    const ctx = pgCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resizePg() {
      const rect = pgCanvas.parentElement.getBoundingClientRect();
      pgCanvas.width = rect.width * dpr;
      pgCanvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    }
    resizePg();
    window.addEventListener('resize', resizePg);

    // Initial Monochrome Sandbox Nodes
    let nodes = [
      { id: 1, type: 'entity', text: 'CUSTOMER', x: 120, y: 180, w: 110, h: 60, color: '#ffffff' },
      { id: 2, type: 'relation', text: 'HAS', x: 320, y: 180, w: 70, h: 70, color: '#d4d4d8' },
      { id: 3, type: 'entity', text: 'ACCOUNT', x: 500, y: 180, w: 110, h: 60, color: '#a1a1aa' }
    ];

    let draggedNode = null;
    let dragOffset = { x: 0, y: 0 };

    function drawPlayground() {
      const w = pgCanvas.width / dpr;
      const h = pgCanvas.height / dpr;
      ctx.clearRect(0, 0, w, h);

      // Connection lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < nodes.length - 1; i++) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x + (nodes[i].w / 2), nodes[i].y + (nodes[i].h / 2));
        ctx.lineTo(nodes[i + 1].x + (nodes[i + 1].w / 2), nodes[i + 1].y + (nodes[i + 1].h / 2));
        ctx.stroke();
      }

      // Draw each node
      nodes.forEach((node) => {
        ctx.save();
        ctx.translate(node.x, node.y);

        if (node.type === 'entity') {
          ctx.fillStyle = '#141414';
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(0, 0, node.w, node.h, 8);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(node.text, node.w / 2, node.h / 2 + 5);
        } else if (node.type === 'relation') {
          const hw = node.w / 2;
          const hh = node.h / 2;
          ctx.fillStyle = '#141414';
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(hw, 0);
          ctx.lineTo(node.w, hh);
          ctx.lineTo(hw, node.h);
          ctx.lineTo(0, hh);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(node.text, hw, hh + 4);
        } else if (node.type === 'attribute') {
          ctx.fillStyle = '#141414';
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(node.w / 2, node.h / 2, node.w / 2, node.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '11px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(node.text, node.w / 2, node.h / 2 + 4);
        }
        ctx.restore();
      });

      requestAnimationFrame(drawPlayground);
    }
    requestAnimationFrame(drawPlayground);

    // Mouse Interaction for Dragging
    pgCanvas.addEventListener('mousedown', (e) => {
      const rect = pgCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
          draggedNode = n;
          dragOffset.x = mx - n.x;
          dragOffset.y = my - n.y;
          AudioEngine.playClick();
          break;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (draggedNode) {
        const rect = pgCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        draggedNode.x = mx - dragOffset.x;
        draggedNode.y = my - dragOffset.y;
      }
    });

    window.addEventListener('mouseup', () => {
      draggedNode = null;
    });

    // Toolbar Buttons
    const btnEntity = document.getElementById('pg-add-entity');
    const btnRel = document.getElementById('pg-add-rel');
    const btnAttr = document.getElementById('pg-add-attr');
    const btnClear = document.getElementById('pg-clear');
    const btnAnalyze = document.getElementById('pg-ai-analyze');
    const toast = document.getElementById('pg-toast');

    if (btnEntity) {
      btnEntity.addEventListener('click', () => {
        AudioEngine.playClick();
        nodes.push({
          id: Date.now(),
          type: 'entity',
          text: `ENTITY_${nodes.length + 1}`,
          x: 80 + Math.random() * 200,
          y: 80 + Math.random() * 150,
          w: 110,
          h: 60,
          color: '#ffffff'
        });
      });
    }

    if (btnRel) {
      btnRel.addEventListener('click', () => {
        AudioEngine.playClick();
        nodes.push({
          id: Date.now(),
          type: 'relation',
          text: 'LINKS',
          x: 200 + Math.random() * 200,
          y: 100 + Math.random() * 150,
          w: 70,
          h: 70,
          color: '#d4d4d8'
        });
      });
    }

    if (btnAttr) {
      btnAttr.addEventListener('click', () => {
        AudioEngine.playClick();
        nodes.push({
          id: Date.now(),
          type: 'attribute',
          text: 'attr_name',
          x: 150 + Math.random() * 250,
          y: 50 + Math.random() * 80,
          w: 90,
          h: 45,
          color: '#a1a1aa'
        });
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        AudioEngine.playClick();
        nodes = [];
      });
    }

    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', () => {
        AudioEngine.playScan();
        if (toast) {
          toast.style.transform = 'translateY(0) scale(1.04)';
          toast.style.borderColor = 'rgba(255, 255, 255, 0.6)';
          const titleEl = document.getElementById('pg-toast-title');
          const descEl = document.getElementById('pg-toast-desc');
          if (titleEl) titleEl.textContent = `Scanning ${nodes.length} Schema Elements...`;

          setTimeout(() => {
            AudioEngine.playSuccess();
            if (titleEl) titleEl.textContent = 'Topology Validated (98.2% Confidence)';
            if (descEl) descEl.textContent = 'All candidate keys and cardinalities normalized.';
          }, 700);
        }
      });
    }
  })();

  // =========================================================================
  // 9. MONOCHROME AUTH MODAL CONTROLLER
  // =========================================================================
  (function initAuthModal() {
      const modal = document.getElementById('auth-modal-overlay');
      const closeBtn = document.getElementById('auth-modal-close');
      const tabSignin = document.getElementById('tab-signin');
      const tabSignup = document.getElementById('tab-signup');
      const titleEl = document.getElementById('auth-title');
      const subtitleEl = document.getElementById('auth-subtitle');
      const form = document.getElementById('auth-form');
      const nameWrap = document.getElementById('field-name-wrap');
      const roleWrap = document.getElementById('field-role-wrap');
      const nameInput = document.getElementById('auth-name');
      const emailInput = document.getElementById('auth-email');
      const passwordInput = document.getElementById('auth-password');
      const submitBtn = document.getElementById('auth-submit-btn');
      const errorEl = document.getElementById('auth-error');
      const guestBtn = document.getElementById('auth-guest-btn');
      const roleOptions = document.querySelectorAll('.auth-role-option');

      if (!modal) return;

      let currentMode = 'signin';
      let currentRole = 'owner';

      const getApiUrl = () => {
        const hostname = window.location.hostname || '127.0.0.1';
        return `${window.location.protocol}//${hostname}:3001`;
      };

      const getClientUrl = () => {
        const hostname = window.location.hostname || '127.0.0.1';
        return `${window.location.protocol}//${hostname}:5173`;
      };

      function setMode(mode) {
        currentMode = mode;
        if (errorEl) {
          errorEl.classList.remove('visible');
          errorEl.textContent = '';
        }

        if (mode === 'signup') {
          if (tabSignup) tabSignup.classList.add('active');
          if (tabSignin) tabSignin.classList.remove('active');
          if (nameWrap) nameWrap.style.display = 'flex';
          if (roleWrap) roleWrap.style.display = 'flex';
          if (titleEl) titleEl.textContent = 'Create Your Account';
          if (subtitleEl) subtitleEl.textContent = 'Join the living neural collaborative whiteboard';
          if (submitBtn) {
            const span = submitBtn.querySelector('span');
            if (span) span.textContent = 'Create Account & Launch';
          }
          if (nameInput) nameInput.setAttribute('required', 'true');
        } else {
          if (tabSignin) tabSignin.classList.add('active');
          if (tabSignup) tabSignup.classList.remove('active');
          if (nameWrap) nameWrap.style.display = 'none';
          if (roleWrap) roleWrap.style.display = 'none';
          if (titleEl) titleEl.textContent = 'Welcome to Daedalus';
          if (subtitleEl) subtitleEl.textContent = 'Sign in to sync your collaborative whiteboard';
          if (submitBtn) {
            const span = submitBtn.querySelector('span');
            if (span) span.textContent = 'Sign In';
          }
          if (nameInput) nameInput.removeAttribute('required');
        }
      }

      function openModal(mode = 'signin') {
        setMode(mode);
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        AudioEngine.playClick();
        setTimeout(() => {
          if (currentMode === 'signup' && nameInput) {
            nameInput.focus();
          } else if (emailInput) {
            emailInput.focus();
          }
        }, 100);
      }

      function closeModal() {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
        AudioEngine.playClick();
      }

      roleOptions.forEach(opt => {
        opt.addEventListener('click', () => {
          roleOptions.forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          currentRole = opt.dataset.role || 'owner';
          AudioEngine.playClick();
        });
      });

      if (tabSignin) tabSignin.addEventListener('click', () => setMode('signin'));
      if (tabSignup) tabSignup.addEventListener('click', () => setMode('signup'));

      if (closeBtn) closeBtn.addEventListener('click', closeModal);
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
          closeModal();
        }
      });

      document.querySelectorAll('.auth-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          const mode = trigger.getAttribute('data-auth-mode') || 'signin';
          openModal(mode);
        });
      });

      function showError(msg) {
        if (!errorEl) return;
        errorEl.textContent = msg;
        errorEl.classList.add('visible');
      }

      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (errorEl) {
            errorEl.classList.remove('visible');
            errorEl.textContent = '';
          }

          const email = emailInput ? emailInput.value.trim() : '';
          const password = passwordInput ? passwordInput.value : '';
          const name = nameInput ? nameInput.value.trim() : '';

          if (currentMode === 'signup') {
            if (!name) {
              showError('Full name is required');
              return;
            }
            if (!email) {
              showError('Valid email is required');
              return;
            }
            if (password.length < 12) {
              showError('Password must be at least 12 characters');
              return;
            }
          } else {
            if (!email) {
              showError('Email is required');
              return;
            }
            if (!password) {
              showError('Password is required');
              return;
            }
          }

          const span = submitBtn ? submitBtn.querySelector('span') : null;
          const prevText = span ? span.textContent : '';
          if (submitBtn) submitBtn.disabled = true;
          if (span) span.textContent = currentMode === 'signup' ? 'Creating Account...' : 'Authenticating...';

          try {
            const endpoint = currentMode === 'signup' ? '/api/auth/register' : '/api/auth/login';
            const payload = currentMode === 'signup'
              ? { email, name, password, role: currentRole }
              : { email, password };

            const res = await fetch(`${getApiUrl()}${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
              let msg = 'Authentication failed';
              if (typeof data.error === 'string') {
                msg = data.error;
              } else if (data.error && data.error.fieldErrors) {
                const firstField = Object.keys(data.error.fieldErrors)[0];
                msg = `${firstField}: ${data.error.fieldErrors[firstField].join(', ')}`;
              }
              throw new Error(msg);
            }

            if (data.token) {
              AudioEngine.playSuccess();
              localStorage.setItem('daedalus.authToken', data.token);
              if (span) span.textContent = 'Launching Whiteboard...';
              setTimeout(() => {
                window.location.href = `${getClientUrl()}/?token=${encodeURIComponent(data.token)}`;
              }, 300);
            } else {
              throw new Error('No authentication token returned by server');
            }
          } catch (err) {
            AudioEngine.playTone(320, 'sawtooth', 0.15, 0.05);
            showError(err.message || 'Unable to connect to authentication server');
          } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (span) span.textContent = prevText;
          }
        });
      }

      if (guestBtn) {
        guestBtn.addEventListener('click', async () => {
          guestBtn.disabled = true;
          const prevContent = guestBtn.innerHTML;
          guestBtn.innerHTML = '<span>Launching guest session...</span>';
          AudioEngine.playClick();

          try {
            const roomId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10)).slice(0, 8);
            const res = await fetch(`${getApiUrl()}/api/auth/guest-token`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ roomId, name: 'Guest Explorer', role: 'editor' })
            });
            const data = await res.json().catch(() => ({}));
            AudioEngine.playSuccess();
            if (data.token) {
              localStorage.setItem('daedalus.authToken', data.token);
              window.location.href = `${getClientUrl()}/?token=${encodeURIComponent(data.token)}&room=${roomId}`;
            } else {
              window.location.href = `${getClientUrl()}/?room=${roomId}`;
            }
          } catch {
            window.location.href = `${getClientUrl()}/`;
          } finally {
            guestBtn.disabled = false;
            guestBtn.innerHTML = prevContent;
          }
        });
      }
    })();

  console.log('⚡ Daedalus Luxury Monochrome Edition Initialized.');
})();
