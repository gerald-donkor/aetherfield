"use client";

import { useRef, type ReactNode } from "react";
import { gsap, useGSAP } from "./register";

// Judged for this continuous surface, not fitted from a static reference.
// Linear phase is intentional; the shared reveal duration/ease do not apply.
const PERIOD = 12;
const MAX_DPR = 1.5;
const MAX_WIDTH = 1920;

const VERTEX = `
  attribute vec2 position;
  varying vec2 uv;
  void main() {
    uv = vec2(position.x * 0.5 + 0.5, 0.5 - position.y * 0.5);
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT = `
  precision highp float;
  uniform sampler2D fabric;
  uniform vec2 crop;
  uniform float phase;
  uniform vec2 size;
  uniform vec4 wake[3];
  varying vec2 uv;
  void main() {
    // Interleaved travelling folds, with the edges pinned to avoid seams.
    // Integer phase harmonics make both position and velocity periodic.
    float wave = 6.2831853 * (uv.x * 2.0 + uv.y * 0.35) - phase;
    vec2 envelope = sin(uv * 3.14159265);
    vec2 offset = vec2(
      0.045 * sin(wave) + 0.018 * sin(wave * 2.0 + uv.y * 3.0),
      0.115 * cos(wave) + 0.035 * sin(wave * 2.0)
    ) * envelope;
    // Distances and velocity are in band-height units, independent of aspect.
    vec2 aspect = vec2(size.x / size.y, 1.0);
    vec2 disturbance = vec2(0.0);
    for (int i = 0; i < 3; i++) {
      vec2 delta = (uv - wake[i].xy) * aspect;
      float falloff = 1.0 - smoothstep(0.0, 0.65, length(delta));
      vec2 velocity = wake[i].zw;
      float turn = velocity.x * delta.y - velocity.y * delta.x;
      disturbance += falloff * falloff *
        (velocity + vec2(-delta.y, delta.x) * turn * 2.0) / aspect;
    }
    vec2 flow = uv + offset + disturbance * envelope;
    vec2 sampleUV = (flow - 0.5) * crop + 0.5;
    // Sample the material at a small neighbourhood to recover fold density
    // without screening its original printed dots a second time.
    vec2 spread = crop * vec2(3.0) / size;
    vec3 material = (texture2D(fabric, sampleUV + spread).rgb +
      texture2D(fabric, sampleUV - spread).rgb +
      texture2D(fabric, sampleUV + vec2(spread.x, -spread.y)).rgb +
      texture2D(fabric, sampleUV + vec2(-spread.x, spread.y)).rgb) * 0.25;
    float density = clamp((1.0 - material.r) / 0.6, 0.0, 1.0);
    // A staggered screen carried by the same folds; periodic fine drift means
    // dots reorganise continuously without a phase reset or random particles.
    vec2 screen = (uv + offset * 0.24 + disturbance * envelope) * size / 3.8;
    screen += vec2(sin(wave), cos(wave * 2.0)) * 0.32;
    screen.x += mod(floor(screen.y), 2.0) * 0.5;
    float radius = mix(0.12, 0.66, density);
    float dotInk = 1.0 - smoothstep(radius - 0.10, radius + 0.10,
      length(fract(screen) - 0.5));
    vec3 paper = vec3(1.0, 0.9608, 0.2745);
    vec3 ink = vec3(0.4, 0.3922, 0.0588);
    gl_FragColor = vec4(mix(mix(paper, ink, dotInk), material, 0.24), 1.0);
  }
`;

/** The original image owns layout and remains the failure/no-JS fallback. */
export function FooterTexture({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const host = root.current;
    const image = host?.querySelector("img");
    if (!host || !image) return;
    const mm = gsap.matchMedia();

    mm.add({
      fullMotion: "(prefers-reduced-motion: no-preference)",
      reduceMotion: "(prefers-reduced-motion: reduce)",
    }, (context) => {
      if (context.conditions?.reduceMotion) return;

      // A fresh canvas per media lifecycle also releases the context on cleanup.
      const canvas = document.createElement("canvas");
      canvas.setAttribute("aria-hidden", "true");
      canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;visibility:hidden";
      host.appendChild(canvas);
      const gl = canvas.getContext("webgl", {
        alpha: false, antialias: false, depth: false, stencil: false,
        powerPreference: "low-power",
      });
      if (!gl) {
        canvas.remove();
        return;
      }

      const shaders: WebGLShader[] = [];
      const program = gl.createProgram();
      const buffer = gl.createBuffer();
      const texture = gl.createTexture();
      let disposed = false;
      let ready = false;
      let onScreen = false;
      let failed = false;
      let uploadedSource = "";
      let phaseLocation: WebGLUniformLocation | null = null;
      let cropLocation: WebGLUniformLocation | null = null;
      let sizeLocation: WebGLUniformLocation | null = null;
      let wakeLocation: WebGLUniformLocation | null = null;
      const wakes = new Float32Array(12);
      const pointer = { x: 0.5, y: 0.5, vx: 0, vy: 0, time: 0 };
      let bounds = { left: 0, top: 0, width: 1, height: 1 };
      let lastDraw = 0;
      const resetInput = () => {
        pointer.time = 0;
        pointer.vx = pointer.vy = 0;
        wakes.fill(0);
        lastDraw = 0;
      };
      const leave = () => { pointer.time = 0; };
      const move = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || !onScreen || document.hidden || failed) return;
        const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
        const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
        const elapsed = (event.timeStamp - pointer.time) / 1000;
        if (pointer.time && elapsed > 0 && elapsed < 0.15) {
          const vx = (x - pointer.x) * bounds.width / bounds.height / elapsed;
          const vy = (y - pointer.y) / elapsed;
          const scale = 0.055 / Math.max(1, Math.hypot(vx, vy) / 2);
          pointer.vx = vx * scale;
          pointer.vy = vy * scale;
        }
        pointer.x = x;
        pointer.y = y;
        pointer.time = event.timeStamp;
      };
      // Read geometry on layout/scroll changes, never on pointermove or draw.
      const measure = () => { bounds = image.getBoundingClientRect(); resetInput(); };
      const clock = { phase: 0 };

      const draw = () => {
        if (!ready || failed || !onScreen || document.hidden) return;
        const now = performance.now();
        const dt = lastDraw ? Math.min((now - lastDraw) / 1000, 0.05) : 0;
        lastDraw = now;
        const follow = 1 - Math.exp(-dt / 0.08);
        pointer.vx *= Math.exp(-dt / 0.18);
        pointer.vy *= Math.exp(-dt / 0.18);
        for (let i = 2; i >= 0; i--) {
          const index = i * 4;
          const x = i ? wakes[index - 4] : pointer.x;
          const y = i ? wakes[index - 3] : pointer.y;
          if (Math.hypot(wakes[index + 2], wakes[index + 3]) < 0.0001) {
            wakes[index] = x;
            wakes[index + 1] = y;
          } else {
            wakes[index] += (x - wakes[index]) * follow;
            wakes[index + 1] += (y - wakes[index + 1]) * follow;
          }
          const vx = i ? wakes[index - 2] * 0.65 : pointer.vx;
          const vy = i ? wakes[index - 1] * 0.65 : pointer.vy;
          wakes[index + 2] += (vx - wakes[index + 2]) * follow;
          wakes[index + 3] += (vy - wakes[index + 3]) * follow;
        }
        gl.uniform4fv(wakeLocation, wakes);
        gl.uniform1f(phaseLocation, clock.phase);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      const tween = gsap.to(clock, {
        phase: Math.PI * 2, duration: PERIOD, repeat: -1,
        ease: "none", paused: true, onUpdate: draw,
      });
      const sync = () => {
        const paused = !ready || failed || !onScreen || document.hidden;
        if (paused) resetInput();
        tween.paused(paused);
      };
      const fail = () => {
        failed = true;
        canvas.style.visibility = "hidden";
        tween.pause();
      };
      const resize = () => {
        if (!ready || failed) return;
        measure();
        const { width, height } = bounds;
        if (!width || !height) return;
        const ratio = Math.min(window.devicePixelRatio, MAX_DPR, MAX_WIDTH / width);
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(sizeLocation, width, height);
        const cover = Math.max(width / image.naturalWidth, height / image.naturalHeight);
        gl.uniform2f(cropLocation,
          width / (image.naturalWidth * cover),
          height / (image.naturalHeight * cover));
        draw();
      };
      const upload = () => {
        if (disposed || failed || !image.complete || !image.naturalWidth) return;
        if (uploadedSource === image.currentSrc) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          if (gl.getError() !== gl.NO_ERROR) { fail(); return; }
          uploadedSource = image.currentSrc;
          ready = true;
          resize();
          sync();
        } catch {
          fail();
        }
      };
      const visibility = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        if (onScreen) {
          upload();
          resize();
          // Reveal only a successfully rendered frame, never an empty canvas.
          if (ready && !failed) {
            draw();
            if (gl.getError() === gl.NO_ERROR) canvas.style.visibility = "visible";
            else fail();
          }
        }
        sync();
      });
      const sizing = new ResizeObserver(resize);
      const onLoad = () => {
        upload();
        if (onScreen && ready && !failed) {
          draw();
          if (gl.getError() === gl.NO_ERROR) canvas.style.visibility = "visible";
          else fail();
        }
      };
      const onVisibility = () => { resetInput(); draw(); sync(); };
      // Keep the fallback after context loss; a later mount can try afresh.
      const onContextLost = () => fail();

      const compile = (kind: number, source: string) => {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error("Footer shader unavailable");
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          throw new Error("Footer shader compilation failed");
        }
        gl.attachShader(program, shader);
      };
      try {
        compile(gl.VERTEX_SHADER, VERTEX);
        compile(gl.FRAGMENT_SHADER, FRAGMENT);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error("Footer shader linking failed");
        }
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        phaseLocation = gl.getUniformLocation(program, "phase");
        cropLocation = gl.getUniformLocation(program, "crop");
        sizeLocation = gl.getUniformLocation(program, "size");
        wakeLocation = gl.getUniformLocation(program, "wake[0]");
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1i(gl.getUniformLocation(program, "fabric"), 0);
        image.addEventListener("load", onLoad);
        image.addEventListener("error", fail);
        canvas.addEventListener("webglcontextlost", onContextLost);
        document.addEventListener("visibilitychange", onVisibility);
        host.addEventListener("pointermove", move, { passive: true });
        host.addEventListener("pointerleave", leave);
        host.addEventListener("pointercancel", leave);
        window.addEventListener("scroll", measure, { passive: true });
        sizing.observe(image);
        visibility.observe(host);
      } catch {
        fail();
      }

      return () => {
        disposed = true;
        tween.kill();
        visibility.disconnect();
        sizing.disconnect();
        image.removeEventListener("load", onLoad);
        image.removeEventListener("error", fail);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        document.removeEventListener("visibilitychange", onVisibility);
        host.removeEventListener("pointermove", move);
        host.removeEventListener("pointerleave", leave);
        host.removeEventListener("pointercancel", leave);
        window.removeEventListener("scroll", measure);
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        shaders.forEach(shader => gl.deleteShader(shader));
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        canvas.remove();
      };
    }, root);
    return () => mm.revert();
  }, { scope: root });

  return <div ref={root} style={{ position: "relative" }}>{children}</div>;
}
