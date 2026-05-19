// ===== Scroll Reveal =====
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => entry.target.classList.add('visible'), i * 80);
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.feature-card, .persona-card, .collab-feat, .flow-step')
  .forEach(el => observer.observe(el));

// ===== Animated Counters =====
const counterObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    const el = entry.target;
    const target = parseInt(el.dataset.count, 10);
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 40));
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current;
      if (current >= target) clearInterval(interval);
    }, 30);
    counterObserver.unobserve(el);
  });
}, { threshold: 0.5 });

document.querySelectorAll('.metric-value[data-count]').forEach(el => counterObserver.observe(el));

// ===== Floating Cursor Animation =====
function animateCursors() {
  const c1 = document.getElementById('cursor-1');
  const c2 = document.getElementById('cursor-2');
  if (!c1 || !c2) return;
  const wrapper = document.querySelector('.canvas-body');
  if (!wrapper) return;
  const w = wrapper.offsetWidth;
  const h = wrapper.offsetHeight;

  function moveCursor(cursor, bounds) {
    const x = bounds.minX + Math.random() * (bounds.maxX - bounds.minX);
    const y = bounds.minY + Math.random() * (bounds.maxY - bounds.minY);
    cursor.style.left = x + 'px';
    cursor.style.top = y + 'px';
  }

  setInterval(() => moveCursor(c1, { minX: 60, maxX: w * 0.45, minY: 60, maxY: h - 60 }), 3000);
  setInterval(() => moveCursor(c2, { minX: w * 0.35, maxX: w - 100, minY: 60, maxY: h - 60 }), 3500);
}
animateCursors();

// ===== AI Typing Effect =====
const aiMessages = [
  "I see two entities connected by a relationship diamond. This follows Chen notation for ER diagrams.",
  "Consider adding cardinality labels (1:N) to clarify the relationship between these entities."
];

function typeMessage(el, text, speed = 25) {
  return new Promise(resolve => {
    let i = 0;
    el.textContent = '';
    const interval = setInterval(() => {
      el.textContent += text[i];
      i++;
      if (i >= text.length) { clearInterval(interval); resolve(); }
    }, speed);
  });
}

async function runAiTyping() {
  const msg1 = document.getElementById('ai-msg-1');
  const msg2 = document.getElementById('ai-msg-2');
  if (!msg1 || !msg2) return;

  await new Promise(r => setTimeout(r, 1500));
  await typeMessage(msg1, aiMessages[0]);
  await new Promise(r => setTimeout(r, 600));
  await typeMessage(msg2, aiMessages[1]);
}
runAiTyping();

// ===== Canvas Drawing Animation =====
function animateCanvas() {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const w = () => canvas.width / dpr;
  const h = () => canvas.height / dpr;

  // Draw ER diagram shapes
  const shapes = [];
  const accentColor = '#818cf8';
  const pinkColor = '#ec4899';
  const greenColor = '#10b981';
  const dimColor = 'rgba(255,255,255,0.06)';

  function drawRoundedRect(x, y, width, height, radius, stroke, fill) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function drawDiamond(cx, cy, rw, rh, stroke) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - rh);
    ctx.lineTo(cx + rw, cy);
    ctx.lineTo(cx, cy + rh);
    ctx.lineTo(cx - rw, cy);
    ctx.closePath();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(236,72,153,0.06)'; ctx.fill();
  }

  function drawEllipse(cx, cy, rx, ry, stroke) {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(16,185,129,0.06)'; ctx.fill();
  }

  function drawLine(x1, y1, x2, y2, color = 'rgba(255,255,255,0.15)') {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawLabel(text, x, y, color = 'rgba(255,255,255,0.5)', size = 12) {
    ctx.font = `500 ${size}px Inter, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y);
  }

  let progress = 0;
  const maxProgress = 300;

  function draw() {
    ctx.clearRect(0, 0, w(), h());
    const cx = w() / 2;
    const cy = h() / 2;
    const t = Math.min(progress / maxProgress, 1);

    // Entity 1 - Student
    if (t > 0.05) {
      const a = Math.min((t - 0.05) / 0.15, 1);
      ctx.globalAlpha = a;
      drawRoundedRect(cx - 260, cy - 45, 120, 50, 6, accentColor, 'rgba(129,140,248,0.06)');
      drawLabel('Student', cx - 200, cy - 15, 'rgba(255,255,255,0.7)', 13);
      ctx.globalAlpha = 1;
    }
    // Entity 2 - Course
    if (t > 0.25) {
      const a = Math.min((t - 0.25) / 0.15, 1);
      ctx.globalAlpha = a;
      drawRoundedRect(cx + 140, cy - 45, 120, 50, 6, accentColor, 'rgba(129,140,248,0.06)');
      drawLabel('Course', cx + 200, cy - 15, 'rgba(255,255,255,0.7)', 13);
      ctx.globalAlpha = 1;
    }
    // Relationship Diamond
    if (t > 0.4) {
      const a = Math.min((t - 0.4) / 0.15, 1);
      ctx.globalAlpha = a;
      drawDiamond(cx, cy - 20, 50, 30, pinkColor);
      drawLabel('Enrolls', cx, cy - 15, 'rgba(255,255,255,0.6)', 11);
      ctx.globalAlpha = 1;
    }
    // Connectors
    if (t > 0.55) {
      const a = Math.min((t - 0.55) / 0.1, 1);
      ctx.globalAlpha = a;
      drawLine(cx - 140, cy - 20, cx - 50, cy - 20, 'rgba(255,255,255,0.2)');
      drawLine(cx + 50, cy - 20, cx + 140, cy - 20, 'rgba(255,255,255,0.2)');
      ctx.globalAlpha = 1;
    }
    // Attributes
    if (t > 0.65) {
      const a = Math.min((t - 0.65) / 0.15, 1);
      ctx.globalAlpha = a;
      drawEllipse(cx - 260, cy + 50, 40, 18, greenColor);
      drawLabel('name', cx - 260, cy + 55, 'rgba(255,255,255,0.5)', 10);
      drawEllipse(cx - 140, cy + 50, 40, 18, greenColor);
      drawLabel('id', cx - 140, cy + 55, 'rgba(255,255,255,0.5)', 10);
      drawLine(cx - 260, cy + 32, cx - 240, cy + 5, 'rgba(255,255,255,0.12)');
      drawLine(cx - 140, cy + 32, cx - 180, cy + 5, 'rgba(255,255,255,0.12)');
      ctx.globalAlpha = 1;
    }
    if (t > 0.78) {
      const a = Math.min((t - 0.78) / 0.15, 1);
      ctx.globalAlpha = a;
      drawEllipse(cx + 200, cy + 50, 45, 18, greenColor);
      drawLabel('title', cx + 200, cy + 55, 'rgba(255,255,255,0.5)', 10);
      drawLine(cx + 200, cy + 32, cx + 200, cy + 5, 'rgba(255,255,255,0.12)');
      drawEllipse(cx + 90, cy + 60, 40, 18, greenColor);
      drawLabel('credits', cx + 90, cy + 65, 'rgba(255,255,255,0.5)', 10);
      drawLine(cx + 90, cy + 42, cx + 155, cy + 5, 'rgba(255,255,255,0.12)');
      ctx.globalAlpha = 1;
    }

    if (progress < maxProgress) {
      progress++;
      requestAnimationFrame(draw);
    }
  }

  // Start on scroll into view
  const canvasObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      progress = 0;
      draw();
      canvasObserver.unobserve(canvas);
    }
  }, { threshold: 0.2 });
  canvasObserver.observe(canvas);
}
animateCanvas();

// ===== Nav scroll effect =====
const nav = document.getElementById('main-nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    nav.style.background = 'rgba(9,9,11,0.92)';
  } else {
    nav.style.background = 'rgba(9,9,11,0.7)';
  }
});

// ===== Smooth scroll for anchor links =====
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id === '#') return;
    e.preventDefault();
    document.querySelector(id)?.scrollIntoView({ behavior: 'smooth' });
  });
});
