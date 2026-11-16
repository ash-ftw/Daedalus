/**
 * DAEDALUS [ΔΑΙΔΑΛΟΣ] — STUDIO MACACO STYLE SCRIPT
 * Swiss Brutalism · 3D Greek Labyrinth · Lenis · Three.js · Anime.js · GSAP
 */

(async function initDaedalusStudioMacaco() {
  'use strict';

  // =========================================================================
  // 0. DEPENDENCY RESOLUTION
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
      const g = await import('gsap');
      gsap = g.default || g.gsap;
    } catch (e) { console.warn('GSAP fallback', e); }
  }
  if (!ScrollTrigger && gsap) {
    try {
      const st = await import('gsap/ScrollTrigger');
      ScrollTrigger = st.ScrollTrigger;
      gsap.registerPlugin(ScrollTrigger);
    } catch (e) { console.warn('ScrollTrigger fallback', e); }
  }
  if (!Lenis) {
    try {
      const l = await import('lenis');
      Lenis = l.default || l;
    } catch (e) { console.warn('Lenis fallback', e); }
  }
  if (!anime) {
    try {
      const a = await import('animejs');
      anime = a.default || a;
    } catch (e) { console.warn('Anime fallback', e); }
  }

  // =========================================================================
  // 1. STUDIO MACACO CUSTOM CURSOR
  // =========================================================================
  const cursor = document.getElementById('mc-cursor');
  if (cursor) {
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let ringX = mouseX;
    let ringY = mouseY;

    window.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      cursor.style.left = `${mouseX}px`;
      cursor.style.top = `${mouseY}px`;
    });

    const interactiveSelectors = 'a, button, input, .mc-tool-btn, .mc-action-btn, .auth-tab-btn, .auth-role-option';
    document.querySelectorAll(interactiveSelectors).forEach((el) => {
      el.addEventListener('mouseenter', () => cursor.classList.add('active'));
      el.addEventListener('mouseleave', () => cursor.classList.remove('active'));
    });
  }

  // =========================================================================
  // 2. MOBILE DRAWER TOGGLE
  // =========================================================================
  const toggleBtn = document.getElementById('mobile-toggle');
  const drawer = document.getElementById('mobile-drawer');
  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', () => {
      toggleBtn.classList.toggle('is-active');
      drawer.classList.toggle('is-active');
    });

    drawer.querySelectorAll('[data-close-drawer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleBtn.classList.remove('is-active');
        drawer.classList.remove('is-active');
      });
    });
  }

  // =========================================================================
  // 3. LENIS SMOOTH SCROLL & VELOCITY TELEMETRY
  // =========================================================================
  let lenisInstance = null;
  const progressEl = document.getElementById('scroll-progress');
  const velocityEl = document.getElementById('scroll-velocity-indicator');

  if (Lenis) {
    try {
      lenisInstance = new Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true
      });

      function raf(time) {
        lenisInstance.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);

      lenisInstance.on('scroll', (e) => {
        if (progressEl) {
          const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
          const progress = maxScroll > 0 ? (e.scroll / maxScroll) * 100 : 0;
          progressEl.style.width = `${progress}%`;
        }
        if (velocityEl) {
          velocityEl.textContent = `SCROLL: ${Math.round(Math.abs(e.velocity || 0))} PX/S`;
        }
      });
    } catch (e) {
      console.warn('Lenis init failed', e);
    }
  }

  // =========================================================================
  // 4. THREE.JS 3D GREEK LABYRINTH WIREFRAME (threejs.org)
  // =========================================================================
  (function initThreeLabyrinth() {
    const canvas = document.getElementById('threejs-bg');
    if (!canvas || !THREE) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 35);
    camera.lookAt(0, 0, 0);

    // Group for the Greek Labyrinth Architecture
    const labyrinthGroup = new THREE.Group();
    scene.add(labyrinthGroup);

    // Construct Concentric Geometric Greek Labyrinth Rings
    const ringCount = 14;
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      linewidth: 1
    });

    for (let r = 2; r <= ringCount; r++) {
      const size = r * 2.2;
      const points = [];
      const half = size / 2;

      // Square labyrinth path with open gap
      points.push(new THREE.Vector3(-half, 0, -half));
      points.push(new THREE.Vector3(half, 0, -half));
      points.push(new THREE.Vector3(half, 0, half));
      points.push(new THREE.Vector3(-half + 1.2, 0, half));
      points.push(new THREE.Vector3(-half + 1.2, 0, -half + 1.2));

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, lineMaterial);
      labyrinthGroup.add(line);
    }

    // Add Radial Grid Crosshairs
    const crosshairGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-35, 0, 0), new THREE.Vector3(35, 0, 0),
      new THREE.Vector3(0, 0, -35), new THREE.Vector3(0, 0, 35)
    ]);
    const crosshairMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 });
    const crosshairs = new THREE.LineSegments(crosshairGeo, crosshairMat);
    labyrinthGroup.add(crosshairs);

    // Add Ambient Floating Star / Dust Particles
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 80;
      positions[i + 1] = (Math.random() - 0.5) * 40;
      positions[i + 2] = (Math.random() - 0.5) * 80;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.2,
      transparent: true,
      opacity: 0.45
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse Parallax
    let targetRotX = 0.45;
    let targetRotY = 0;
    window.addEventListener('mousemove', (e) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1;
      const ny = (e.clientY / window.innerHeight) * 2 - 1;
      targetRotY = nx * 0.35;
      targetRotX = 0.45 + ny * 0.15;
    });

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);

      labyrinthGroup.rotation.y += 0.0012;
      labyrinthGroup.rotation.x += (targetRotX - labyrinthGroup.rotation.x) * 0.05;
      labyrinthGroup.rotation.z += (targetRotY - labyrinthGroup.rotation.z) * 0.05;

      particles.rotation.y -= 0.0004;

      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  })();

  // =========================================================================
  // 5. ANIME.JS STATS COUNTER
  // =========================================================================
  (function initMetricCounters() {
    const counterElements = document.querySelectorAll('.mc-metric-num');
    if (!counterElements.length) return;

    let animated = false;
    function triggerCounters() {
      if (animated) return;
      animated = true;

      counterElements.forEach((el) => {
        const target = parseInt(el.getAttribute('data-target') || '0', 10);
        if (anime) {
          anime({
            targets: el,
            innerHTML: [0, target],
            round: 1,
            easing: 'easeOutExpo',
            duration: 2000
          });
        } else {
          el.textContent = String(target);
        }
      });
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          triggerCounters();
          observer.disconnect();
        }
      });
    }, { threshold: 0.3 });

    const heroSection = document.getElementById('hero');
    if (heroSection) observer.observe(heroSection);
  })();

  // =========================================================================
  // 6. HERO INTERACTIVE BOARD CANVAS (Live Blueprint Animation)
  // =========================================================================
  (function initHeroBoardCanvas() {
    const canvas = document.getElementById('hero-interactive-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener('resize', resize);

    // Blueprint Architecture Nodes
    const nodes = [
      { id: 1, x: 0.2, y: 0.35, label: 'ARCHITECT (Δ)', sub: 'PRIMARY_KEY // ID', w: 160, h: 70 },
      { id: 2, x: 0.5, y: 0.35, label: 'CREATES', sub: 'CARDINALITY // 1:N', w: 120, h: 55, isRel: true },
      { id: 3, x: 0.8, y: 0.35, label: 'BLUEPRINT', sub: 'FOREIGN_KEY // SCHEMA', w: 170, h: 70 },
      { id: 4, x: 0.5, y: 0.75, label: 'NEURAL_TALOS', sub: 'AI VISION SCANNER', w: 180, h: 65 }
    ];

    let t = 0;
    function renderBoard() {
      t += 0.02;
      ctx.clearRect(0, 0, width, height);

      // Hairline Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      const gridSize = 32;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Connecting Vector Lines
      const p1 = { x: nodes[0].x * width, y: nodes[0].y * height };
      const p2 = { x: nodes[1].x * width, y: nodes[1].y * height };
      const p3 = { x: nodes[2].x * width, y: nodes[2].y * height };
      const p4 = { x: nodes[3].x * width, y: nodes[3].y * height };

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Animated Pulse Along Vector
      const pulseX = p1.x + (p3.x - p1.x) * ((Math.sin(t) + 1) / 2);
      const pulseY = p1.y + (p3.y - p1.y) * ((Math.sin(t) + 1) / 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pulseX, pulseY, 4, 0, Math.PI * 2);
      ctx.fill();

      // Render Architecture Blocks
      nodes.forEach((node) => {
        const nx = node.x * width - node.w / 2;
        const ny = node.y * height - node.h / 2;

        ctx.fillStyle = '#0a0a0a';
        ctx.strokeStyle = node.isRel ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.35)';
        ctx.lineWidth = 1.2;

        if (node.isRel) {
          // Diamond Relation
          const cx = node.x * width;
          const cy = node.y * height;
          const hw = node.w / 2;
          const hh = node.h / 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy - hh);
          ctx.lineTo(cx + hw, cy);
          ctx.lineTo(cx, cy + hh);
          ctx.lineTo(cx - hw, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // Sharp Box
          ctx.beginPath();
          ctx.rect(nx, ny, node.w, node.h);
          ctx.fill();
          ctx.stroke();
        }

        // Labels
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 11px "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x * width, node.y * height - 4);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.font = '400 9px "Roboto Mono", monospace';
        ctx.fillText(node.sub, node.x * width, node.y * height + 12);
      });

      requestAnimationFrame(renderBoard);
    }
    renderBoard();
  })();

  // =========================================================================
  // 7. SANDBOX WORKBENCH (Interactive Mini-Whiteboard)
  // =========================================================================
  (function initSandboxWorkbench() {
    const canvas = document.getElementById('playground-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener('resize', resize);

    let items = [
      { id: 1, type: 'entity', text: 'ARCHITECT', x: 120, y: 100, w: 130, h: 55 },
      { id: 2, type: 'relation', text: 'BUILDS', x: 320, y: 100, w: 80, h: 55 },
      { id: 3, type: 'entity', text: 'LABYRINTH', x: 500, y: 100, w: 140, h: 55 }
    ];

    let draggedItem = null;
    let dragOffset = { x: 0, y: 0 };

    function drawSandbox() {
      ctx.clearRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Connecting lines between sequential items
      if (items.length > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        for (let i = 0; i < items.length - 1; i++) {
          ctx.moveTo(items[i].x + items[i].w / 2, items[i].y + items[i].h / 2);
          ctx.lineTo(items[i + 1].x + items[i + 1].w / 2, items[i + 1].y + items[i + 1].h / 2);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw items
      items.forEach((item) => {
        ctx.fillStyle = '#080808';
        ctx.strokeStyle = item.type === 'relation' ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1.2;

        if (item.type === 'relation') {
          const cx = item.x + item.w / 2;
          const cy = item.y + item.h / 2;
          const hw = item.w / 2;
          const hh = item.h / 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy - hh);
          ctx.lineTo(cx + hw, cy);
          ctx.lineTo(cx, cy + hh);
          ctx.lineTo(cx - hw, cy);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (item.type === 'attribute') {
          ctx.beginPath();
          ctx.ellipse(item.x + item.w / 2, item.y + item.h / 2, item.w / 2, item.h / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.rect(item.x, item.y, item.w, item.h);
          ctx.fill();
          ctx.stroke();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = '700 11px "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(item.text, item.x + item.w / 2, item.y + item.h / 2 + 4);
      });

      requestAnimationFrame(drawSandbox);
    }
    drawSandbox();

    // Mouse Interaction
    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (mx >= it.x && mx <= it.x + it.w && my >= it.y && my <= it.y + it.h) {
          draggedItem = it;
          dragOffset.x = mx - it.x;
          dragOffset.y = my - it.y;
          break;
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (draggedItem) {
        const rect = canvas.getBoundingClientRect();
        draggedItem.x = e.clientX - rect.left - dragOffset.x;
        draggedItem.y = e.clientY - rect.top - dragOffset.y;
      }
    });

    window.addEventListener('mouseup', () => {
      draggedItem = null;
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
        items.push({
          id: Date.now(),
          type: 'entity',
          text: `NODE_${items.length + 1}`,
          x: 60 + Math.random() * 200,
          y: 60 + Math.random() * 150,
          w: 120,
          h: 50
        });
      });
    }

    if (btnRel) {
      btnRel.addEventListener('click', () => {
        items.push({
          id: Date.now(),
          type: 'relation',
          text: 'LINKS',
          x: 180 + Math.random() * 200,
          y: 80 + Math.random() * 120,
          w: 80,
          h: 50
        });
      });
    }

    if (btnAttr) {
      btnAttr.addEventListener('click', () => {
        items.push({
          id: Date.now(),
          type: 'attribute',
          text: 'attr_val',
          x: 140 + Math.random() * 200,
          y: 40 + Math.random() * 80,
          w: 90,
          h: 40
        });
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        items = [];
      });
    }

    if (btnAnalyze) {
      btnAnalyze.addEventListener('click', () => {
        const titleEl = document.getElementById('pg-toast-title');
        const descEl = document.getElementById('pg-toast-desc');
        if (titleEl) titleEl.textContent = `AUDITING ${items.length} ARCHITECTURAL NODES...`;
        if (descEl) descEl.textContent = 'Daedalus neural parser validating topology against relational calculus...';

        setTimeout(() => {
          if (titleEl) titleEl.textContent = 'SCHEMA CERTIFIED (100% SOUND)';
          if (descEl) descEl.textContent = 'Relational cardinalities verified. All entities mapped to primary keys.';
        }, 650);
      });
    }
  })();

  // =========================================================================
  // 8. MONOCHROME AUTH MODAL CONTROLLER
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
      if (window.location.port === '3333') {
        const hostname = window.location.hostname || '127.0.0.1';
        return `${window.location.protocol}//${hostname}:3001`;
      }
      return window.location.origin;
    };

    const getClientUrl = () => {
      if (window.location.port === '3333') {
        const hostname = window.location.hostname || '127.0.0.1';
        return `${window.location.protocol}//${hostname}:5173`;
      }
      return window.location.origin;
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
        if (titleEl) titleEl.textContent = 'FORGE AN ACCOUNT';
        if (subtitleEl) subtitleEl.textContent = 'Enter the living collaborative whiteboard';
        if (submitBtn) {
          const span = submitBtn.querySelector('span');
          if (span) span.textContent = 'CREATE ACCOUNT & LAUNCH →';
        }
        if (nameInput) nameInput.setAttribute('required', 'true');
      } else {
        if (tabSignin) tabSignin.classList.add('active');
        if (tabSignup) tabSignup.classList.remove('active');
        if (nameWrap) nameWrap.style.display = 'none';
        if (roleWrap) roleWrap.style.display = 'none';
        if (titleEl) titleEl.textContent = 'ENTER THE LABYRINTH';
        if (subtitleEl) subtitleEl.textContent = 'Sign in to sync your collaborative whiteboard';
        if (submitBtn) {
          const span = submitBtn.querySelector('span');
          if (span) span.textContent = 'SIGN IN →';
        }
        if (nameInput) nameInput.removeAttribute('required');
      }
    }

    function openModal(mode = 'signin') {
      setMode(mode);
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
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
    }

    roleOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        roleOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        currentRole = opt.dataset.role || 'owner';
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
          if (!name) { showError('Full name is required'); return; }
          if (!email) { showError('Valid email is required'); return; }
          if (password.length < 12) { showError('Password must be at least 12 characters'); return; }
        } else {
          if (!email) { showError('Email is required'); return; }
          if (!password) { showError('Password is required'); return; }
        }

        const span = submitBtn ? submitBtn.querySelector('span') : null;
        const prevText = span ? span.textContent : '';
        if (submitBtn) submitBtn.disabled = true;
        if (span) span.textContent = 'AUTHENTICATING...';

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
            localStorage.setItem('daedalus.authToken', data.token);
            if (span) span.textContent = 'LAUNCHING CANVAS...';
            setTimeout(() => {
              window.location.href = `${getClientUrl()}/?token=${encodeURIComponent(data.token)}`;
            }, 300);
          } else {
            throw new Error('No authentication token returned by server');
          }
        } catch (err) {
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
        guestBtn.innerHTML = '<span>LAUNCHING GUEST SESSION...</span>';

        try {
          const roomId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 10)).slice(0, 8);
          const res = await fetch(`${getApiUrl()}/api/auth/guest-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, name: 'Guest Architect', role: 'editor' })
          });
          const data = await res.json().catch(() => ({}));
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

  console.log('⚡ DAEDALUS Studio MACACO Edition Initialized.');
})();
