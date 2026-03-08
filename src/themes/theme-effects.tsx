// src/themes/theme-effects.tsx — Ambient animated visual effects per theme

import { useEffect, useRef } from 'react';
import { themeEngine } from './engine.ts';

interface ThemeEffectsProps {
  themeId: string;
  /** Set false to disable animations (e.g. when reducedMotion is on) */
  enabled?: boolean;
}

/** Number of ambient particles rendered */
const PARTICLE_COUNT = 12;

interface Particle {
  x: number;
  y: number;
  size: number;
  speed: number;
  opacity: number;
  color: string;
  drift: number;
}

function createParticles(colors: string[], themeId: string): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const color = colors[i % colors.length];
    const isFireTheme = themeId === 'dragon-forge';
    const isSpaceTheme = themeId === 'star-trail';

    return {
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: isSpaceTheme
        ? 1 + Math.random() * 2.5
        : isFireTheme
          ? 2 + Math.random() * 4
          : 3 + Math.random() * 5,
      speed: 0.15 + Math.random() * 0.35,
      opacity: 0.15 + Math.random() * 0.35,
      color,
      drift: (Math.random() - 0.5) * 0.3,
    };
  });
}

/**
 * Renders theme-specific ambient animated effects:
 * - Dragon Forge: rising ember particles with warm glow
 * - Monster Lab: floating bubbles with electric pulses
 * - Star Trail: twinkling stars with shooting star streaks
 */
export function ThemeEffects({ themeId, enabled = true }: ThemeEffectsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vfx = themeEngine.getVisualEffects(themeId);
    particlesRef.current = createParticles(vfx.particleColors, themeId);

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx!.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    resize();
    window.addEventListener('resize', resize);

    function animate() {
      if (!canvas || !ctx) return;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      ctx.clearRect(0, 0, w, h);

      for (const p of particlesRef.current) {
        // Move particles
        if (themeId === 'dragon-forge') {
          // Embers rise
          p.y -= p.speed;
          p.x += p.drift + Math.sin(p.y * 0.05) * 0.15;
          if (p.y < -5) {
            p.y = 105;
            p.x = Math.random() * 100;
          }
        } else if (themeId === 'monster-lab') {
          // Bubbles float upward with wobble
          p.y -= p.speed * 0.7;
          p.x += Math.sin(p.y * 0.08 + p.drift * 10) * 0.2;
          if (p.y < -5) {
            p.y = 105;
            p.x = Math.random() * 100;
          }
        } else {
          // Stars twinkle in place
          p.opacity = 0.1 + Math.abs(Math.sin(Date.now() * 0.001 * p.speed + p.x)) * 0.4;
        }

        const px = (p.x / 100) * w;
        const py = (p.y / 100) * h;

        ctx.beginPath();

        if (themeId === 'star-trail') {
          // Draw 4-point star shape
          drawStar(ctx, px, py, p.size);
        } else if (themeId === 'dragon-forge') {
          // Draw glowing ember
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
        } else {
          // Draw bubble
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.opacity;
        ctx.fill();

        // Add glow for dragon-forge embers
        if (themeId === 'dragon-forge') {
          ctx.beginPath();
          ctx.arc(px, py, p.size * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.opacity * 0.15;
          ctx.fill();
        }

        // Add ring for monster-lab bubbles
        if (themeId === 'monster-lab') {
          ctx.beginPath();
          ctx.arc(px, py, p.size, 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = p.opacity * 0.5;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }

        ctx.globalAlpha = 1;
      }

      animFrameRef.current = requestAnimationFrame(animate);
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [themeId, enabled]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
      data-testid="theme-effects-canvas"
    />
  );
}

/** Draw a 4-point star at (cx, cy) */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const spikes = 4;
  const outerRadius = size;
  const innerRadius = size * 0.4;
  let rotation = Math.PI / 2;

  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    const outerX = cx + Math.cos(rotation) * outerRadius;
    const outerY = cy + Math.sin(rotation) * outerRadius;
    ctx.lineTo(outerX, outerY);
    rotation += Math.PI / spikes;
    const innerX = cx + Math.cos(rotation) * innerRadius;
    const innerY = cy + Math.sin(rotation) * innerRadius;
    ctx.lineTo(innerX, innerY);
    rotation += Math.PI / spikes;
  }
  ctx.closePath();
}
