import { useEffect, useRef } from "react";

/**
 * Animated underwater backdrop.
 *
 * One canvas draws every moving layer — light rays, drifting particles, rising
 * bubbles and slow fish silhouettes — so the whole effect costs a single
 * compositor layer instead of dozens of animated DOM nodes.
 *
 * It is purely decorative: `pointer-events-none` and a negative z-index keep it
 * behind and out of the way of every control, and `aria-hidden` keeps it out of
 * the accessibility tree.
 */

interface Particle {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  alpha: number;
  phase: number;
}

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobble: number;
  phase: number;
  alpha: number;
}

interface FishShape {
  x: number;
  y: number;
  scale: number;
  speed: number;
  direction: 1 | -1;
  alpha: number;
  phase: number;
}

// Deterministic PRNG so the scene looks identical between SSR and hydration and
// between reloads — no layout surprises, no Math.random hydration mismatch.
function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function drawFish(context: CanvasRenderingContext2D, fish: FishShape, time: number, color: string) {
  const sway = Math.sin(time * 0.0012 + fish.phase) * 6;
  context.save();
  context.translate(fish.x, fish.y + sway);
  context.scale(fish.scale * fish.direction, fish.scale);
  context.globalAlpha = fish.alpha;
  context.fillStyle = color;

  // Body
  context.beginPath();
  context.moveTo(-30, 0);
  context.bezierCurveTo(-14, -11, 14, -11, 28, 0);
  context.bezierCurveTo(14, 11, -14, 11, -30, 0);
  context.closePath();
  context.fill();

  // Tail — flicks gently with the same phase as the body sway.
  const flick = Math.sin(time * 0.004 + fish.phase) * 3;
  context.beginPath();
  context.moveTo(-28, 0);
  context.lineTo(-42, -9 + flick);
  context.lineTo(-42, 9 + flick);
  context.closePath();
  context.fill();

  context.restore();
}

export function OceanBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let bubbles: Bubble[] = [];
    let fishes: FishShape[] = [];
    let frame = 0;
    let running = true;
    // Parallax offset, eased toward the pointer rather than snapped to it.
    let pointerX = 0;
    let targetPointerX = 0;

    const random = makeRandom(20240517);

    function build() {
      const canvasElement = canvasRef.current;
      if (!canvasElement) return;

      // Cap DPR at 2: beyond that the extra pixels cost real time on phones and
      // buy nothing for soft, blurred shapes.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvasElement.width = Math.floor(width * dpr);
      canvasElement.height = Math.floor(height * dpr);
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      context!.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Scale the scene to viewport area so a phone doesn't render a desktop's
      // worth of sprites.
      const area = width * height;
      const particleCount = Math.round(Math.min(90, Math.max(24, area / 22000)));
      const bubbleCount = Math.round(Math.min(26, Math.max(8, area / 70000)));
      const fishCount = Math.round(Math.min(6, Math.max(2, area / 320000)));

      particles = Array.from({ length: particleCount }, () => ({
        x: random() * width,
        y: random() * height,
        radius: 0.6 + random() * 1.9,
        speed: 0.05 + random() * 0.18,
        drift: (random() - 0.5) * 0.16,
        alpha: 0.1 + random() * 0.28,
        phase: random() * Math.PI * 2,
      }));

      bubbles = Array.from({ length: bubbleCount }, () => ({
        x: random() * width,
        y: random() * height,
        radius: 2 + random() * 6,
        speed: 0.18 + random() * 0.42,
        wobble: 8 + random() * 18,
        phase: random() * Math.PI * 2,
        alpha: 0.08 + random() * 0.16,
      }));

      fishes = Array.from({ length: fishCount }, (_, index) => ({
        x: random() * width,
        y: height * (0.14 + random() * 0.66),
        scale: 0.55 + random() * 0.85,
        speed: 0.1 + random() * 0.22,
        direction: index % 2 === 0 ? 1 : -1,
        alpha: 0.05 + random() * 0.06,
        phase: random() * Math.PI * 2,
      }));
    }

    function drawRays(time: number) {
      const rayCount = 4;
      context!.save();
      context!.globalCompositeOperation = "lighter";
      for (let index = 0; index < rayCount; index += 1) {
        const base = (width / (rayCount + 1)) * (index + 1);
        // Rays lean slowly and shift with the parallax offset.
        const offset = Math.sin(time * 0.00018 + index * 1.7) * 60 + pointerX * (0.6 + index * 0.2);
        const gradient = context!.createLinearGradient(
          base + offset,
          -80,
          base + offset - 150,
          height,
        );
        gradient.addColorStop(0, "rgba(120, 220, 255, 0.085)");
        gradient.addColorStop(0.55, "rgba(90, 200, 245, 0.030)");
        gradient.addColorStop(1, "rgba(60, 160, 220, 0)");
        context!.fillStyle = gradient;
        context!.beginPath();
        context!.moveTo(base + offset - 70, -80);
        context!.lineTo(base + offset + 70, -80);
        context!.lineTo(base + offset - 110, height);
        context!.lineTo(base + offset - 300, height);
        context!.closePath();
        context!.fill();
      }
      context!.restore();
    }

    function render(time: number) {
      if (!running) return;
      context!.clearRect(0, 0, width, height);

      pointerX += (targetPointerX - pointerX) * 0.03;

      drawRays(time);

      // Suspended particulate
      for (const particle of particles) {
        particle.y -= particle.speed;
        particle.x += particle.drift + Math.sin(time * 0.0005 + particle.phase) * 0.12;
        if (particle.y < -10) {
          particle.y = height + 10;
          particle.x = random() * width;
        }
        context!.globalAlpha = particle.alpha;
        context!.fillStyle = "rgb(168, 232, 255)";
        context!.beginPath();
        context!.arc(particle.x + pointerX * 0.3, particle.y, particle.radius, 0, Math.PI * 2);
        context!.fill();
      }

      // Fish silhouettes sit between the particulate and the bubbles.
      for (const fish of fishes) {
        fish.x += fish.speed * fish.direction;
        if (fish.direction === 1 && fish.x > width + 80) fish.x = -80;
        if (fish.direction === -1 && fish.x < -80) fish.x = width + 80;
        drawFish(context!, { ...fish, x: fish.x + pointerX * 0.9 }, time, "rgb(140, 210, 245)");
      }

      // Rising bubbles
      for (const bubble of bubbles) {
        bubble.y -= bubble.speed;
        if (bubble.y < -20) {
          bubble.y = height + 20;
          bubble.x = random() * width;
        }
        const x = bubble.x + Math.sin(time * 0.001 + bubble.phase) * bubble.wobble + pointerX * 0.5;
        context!.globalAlpha = bubble.alpha;
        context!.strokeStyle = "rgb(190, 240, 255)";
        context!.lineWidth = 1;
        context!.beginPath();
        context!.arc(x, bubble.y, bubble.radius, 0, Math.PI * 2);
        context!.stroke();
      }

      context!.globalAlpha = 1;
      frame = window.requestAnimationFrame(render);
    }

    /** A single still frame, for users who asked for reduced motion. */
    function renderStatic() {
      context!.clearRect(0, 0, width, height);
      drawRays(0);
      for (const particle of particles) {
        context!.globalAlpha = particle.alpha;
        context!.fillStyle = "rgb(168, 232, 255)";
        context!.beginPath();
        context!.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context!.fill();
      }
      for (const fish of fishes) drawFish(context!, fish, 0, "rgb(140, 210, 245)");
      context!.globalAlpha = 1;
    }

    function start() {
      window.cancelAnimationFrame(frame);
      build();
      if (reduceMotion.matches) {
        running = false;
        renderStatic();
      } else {
        running = true;
        frame = window.requestAnimationFrame(render);
      }
    }

    // Pause off-screen / on a hidden tab so the background never burns battery
    // while nobody is looking at it.
    function handleVisibility() {
      if (document.hidden) {
        running = false;
        window.cancelAnimationFrame(frame);
      } else if (!reduceMotion.matches) {
        running = true;
        frame = window.requestAnimationFrame(render);
      }
    }

    function handlePointer(event: PointerEvent) {
      if (reduceMotion.matches) return;
      targetPointerX = (event.clientX / window.innerWidth - 0.5) * 26;
    }

    let resizeTimer: number | undefined;
    function handleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(start, 180);
    }

    start();
    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointer, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);
    reduceMotion.addEventListener("change", start);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointer);
      document.removeEventListener("visibilitychange", handleVisibility);
      reduceMotion.removeEventListener("change", start);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* Static depth gradient underneath the canvas: this is what gives the page
          its "looking down into water" falloff, and it survives reduced motion. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_-10%,color-mix(in_oklab,var(--ocean-cyan)_16%,transparent),transparent_60%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,color-mix(in_oklab,var(--ocean-deep)_28%,transparent)_65%,color-mix(in_oklab,var(--ocean-deep)_48%,transparent))]" />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
