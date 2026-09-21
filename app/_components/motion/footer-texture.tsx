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
    vec2 sampleUV = (uv + offset - 0.5) * crop + 0.5;
    gl_FragColor = texture2D(fabric, sampleUV);
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
      const clock = { phase: 0 };

      const draw = () => {
        if (!ready || failed || !onScreen || document.hidden) return;
        gl.uniform1f(phaseLocation, clock.phase);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      };
      const tween = gsap.to(clock, {
        phase: Math.PI * 2, duration: PERIOD, repeat: -1,
        ease: "none", paused: true, onUpdate: draw,
      });
      const sync = () => {
        tween.paused(!ready || failed || !onScreen || document.hidden);
      };
      const fail = () => {
        failed = true;
        canvas.style.visibility = "hidden";
        tween.pause();
      };
      const resize = () => {
        if (!ready || failed) return;
        const { width, height } = image.getBoundingClientRect();
        if (!width || !height) return;
        const ratio = Math.min(window.devicePixelRatio, MAX_DPR, MAX_WIDTH / width);
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
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
      const onVisibility = () => { draw(); sync(); };
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
