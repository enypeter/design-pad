import { blurRadiusPx } from './cpu';
import type { ProcessParams } from './presets';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const BLUR_FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_dir;
uniform float u_w[7];
varying vec2 v_uv;
void main() {
  vec4 sum = texture2D(u_tex, v_uv) * u_w[0];
  for (int i = 1; i < 7; i++) {
    vec2 off = u_dir * float(i);
    sum += texture2D(u_tex, v_uv + off) * u_w[i];
    sum += texture2D(u_tex, v_uv - off) * u_w[i];
  }
  gl_FragColor = sum;
}`;

// Must stay in sync with colorOp() in cpu.ts.
const COLOR_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D u_tex;
uniform sampler2D u_blur;
uniform float u_useBlur;
uniform vec2 u_texel;
uniform float u_brightness, u_contrast, u_saturation, u_vibrance, u_temperature, u_tint;
uniform float u_highlights, u_shadows, u_whites, u_blacks, u_fade, u_vignette, u_sharpness;
uniform float u_grayscale, u_sepia;
uniform vec4 u_shadowTint, u_highlightTint;
varying vec2 v_uv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main() {
  vec4 src = u_useBlur > 0.5 ? texture2D(u_blur, v_uv) : texture2D(u_tex, v_uv);
  vec3 c = src.rgb;
  if (u_useBlur < 0.5 && u_sharpness > 0.0) {
    vec3 n = texture2D(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb;
    vec3 s = texture2D(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb;
    vec3 e = texture2D(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb;
    vec3 w = texture2D(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb;
    c = c + u_sharpness * 0.6 * (4.0 * c - n - s - e - w);
  }

  c.r += u_temperature * 0.12 + u_tint * 0.04;
  c.g -= u_tint * 0.1;
  c.b += -u_temperature * 0.12 + u_tint * 0.04;

  if (u_brightness != 0.0) {
    float gamma = exp2(-u_brightness * 0.9);
    c = pow(max(c, vec3(0.0)), vec3(gamma));
  }

  float cf = u_contrast > 0.0 ? 1.0 + u_contrast * 1.2 : 1.0 + u_contrast * 0.85;
  c = (c - 0.5) * cf + 0.5;

  float l = luma(c);
  float d = u_shadows * 0.28 * (1.0 - smoothstep(0.0, 0.55, l))
          + u_highlights * 0.28 * smoothstep(0.45, 1.0, l)
          + u_whites * 0.18 * smoothstep(0.7, 1.0, l)
          + u_blacks * 0.18 * (1.0 - smoothstep(0.0, 0.3, l));
  c += d;

  l = luma(c);
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  float s = (1.0 + u_saturation) * (1.0 + u_vibrance * (1.0 - min(1.0, sat)));
  c = vec3(l) + (c - vec3(l)) * s;

  if (u_sepia > 0.0) {
    vec3 sp = vec3(
      dot(c, vec3(0.393, 0.769, 0.189)),
      dot(c, vec3(0.349, 0.686, 0.168)),
      dot(c, vec3(0.272, 0.534, 0.131)));
    c += (sp - c) * u_sepia;
  }
  if (u_grayscale > 0.0) {
    l = luma(c);
    c += (vec3(l) - c) * u_grayscale;
  }
  if (u_shadowTint.a > 0.0 || u_highlightTint.a > 0.0) {
    l = clamp(luma(c), 0.0, 1.0);
    float ws = (1.0 - l) * u_shadowTint.a * 2.0;
    float wh = l * u_highlightTint.a * 2.0;
    c += (u_shadowTint.rgb - 0.5) * ws + (u_highlightTint.rgb - 0.5) * wh;
  }
  if (u_fade > 0.0) {
    c = c * (1.0 - u_fade * 0.3) + u_fade * 0.15;
  }
  if (u_vignette > 0.0) {
    // v_uv.y is flipped relative to image rows; the vignette is symmetric so it does not matter.
    float dist = length(v_uv - 0.5) * 1.41421356;
    c *= 1.0 - u_vignette * 0.85 * smoothstep(0.3, 1.0, dist);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}`;

function createCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function gaussianWeights(): number[] {
  const sigma = 3;
  const raw = Array.from({ length: 7 }, (_, i) => Math.exp(-(i * i) / (2 * sigma * sigma)));
  const total = raw[0]! + 2 * raw.slice(1).reduce((a, b) => a + b, 0);
  return raw.map((w) => w / total);
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

export class GLImageProcessor {
  private canvas: AnyCanvas;
  private gl: WebGLRenderingContext;
  private colorProgram: WebGLProgram;
  private blurProgram: WebGLProgram;
  private buffer: WebGLBuffer;
  private lost = false;
  readonly maxSize: number;
  private weights = gaussianWeights();

  private constructor(canvas: AnyCanvas, gl: WebGLRenderingContext) {
    this.canvas = canvas;
    this.gl = gl;
    this.colorProgram = this.program(VERT, COLOR_FRAG);
    this.blurProgram = this.program(VERT, BLUR_FRAG);
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.maxSize = Math.min(8192, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
    (canvas as HTMLCanvasElement).addEventListener?.('webglcontextlost', () => {
      this.lost = true;
    });
  }

  static create(): GLImageProcessor | null {
    try {
      const canvas = createCanvas(1, 1);
      const gl = canvas.getContext('webgl', {
        premultipliedAlpha: false,
        preserveDrawingBuffer: true,
        antialias: false,
      }) as WebGLRenderingContext | null;
      if (!gl) return null;
      return new GLImageProcessor(canvas, gl);
    } catch {
      return null;
    }
  }

  get usable(): boolean {
    return !this.lost && !this.gl.isContextLost();
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(sh)}`);
      }
      return sh;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
    }
    return p;
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  private drawQuad(program: WebGLProgram): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private blurPass(input: WebGLTexture, output: Target, dir: [number, number]): void {
    const gl = this.gl;
    gl.useProgram(this.blurProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, output.fbo);
    gl.viewport(0, 0, output.w, output.h);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.uniform1i(gl.getUniformLocation(this.blurProgram, 'u_tex'), 0);
    gl.uniform2f(gl.getUniformLocation(this.blurProgram, 'u_dir'), dir[0], dir[1]);
    gl.uniform1fv(gl.getUniformLocation(this.blurProgram, 'u_w'), this.weights);
    this.drawQuad(this.blurProgram);
  }

  /**
   * Render `source` at `outW`×`outH` with the given parameters into a new
   * 2D canvas. Returns null if the source cannot be read (cross-origin).
   */
  process(
    source: CanvasImageSource,
    outW: number,
    outH: number,
    p: ProcessParams,
  ): AnyCanvas | null {
    const gl = this.gl;
    outW = Math.max(1, Math.min(this.maxSize, Math.round(outW)));
    outH = Math.max(1, Math.min(this.maxSize, Math.round(outH)));
    this.canvas.width = outW;
    this.canvas.height = outH;

    const created: { textures: WebGLTexture[]; fbos: WebGLFramebuffer[] } = {
      textures: [],
      fbos: [],
    };
    try {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      const srcTex = this.texture();
      created.textures.push(srcTex);
      // Downscale the source to output size first so the GPU samples a matching texture.
      const scaled = createCanvas(outW, outH);
      const sctx = scaled.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(source, 0, 0, outW, outH);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scaled as TexImageSource);

      let blurTex: WebGLTexture | null = null;
      if (p.blur > 0) {
        // Blur at reduced resolution so large radii stay cheap; the colour pass upsamples.
        const radius = blurRadiusPx(p.blur, outW, outH);
        const factor = Math.max(1, radius / 6);
        const bw = Math.max(1, Math.round(outW / factor));
        const bh = Math.max(1, Math.round(outH / factor));
        const small = createCanvas(bw, bh);
        const smallCtx = small.getContext('2d') as
          | CanvasRenderingContext2D
          | OffscreenCanvasRenderingContext2D;
        smallCtx.imageSmoothingQuality = 'high';
        smallCtx.drawImage(scaled, 0, 0, bw, bh);
        const smallTex = this.texture();
        created.textures.push(smallTex);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          small as TexImageSource,
        );
        const a = this.target(bw, bh);
        const b = this.target(bw, bh);
        created.textures.push(a.tex, b.tex);
        created.fbos.push(a.fbo, b.fbo);
        const step = Math.min(radius / factor / 6, 2);
        this.blurPass(smallTex, a, [step / bw, 0]);
        this.blurPass(a.tex, b, [0, step / bh]);
        this.blurPass(b.tex, a, [step / bw, 0]);
        this.blurPass(a.tex, b, [0, step / bh]);
        blurTex = b.tex;
      }

      const prog = this.colorProgram;
      gl.useProgram(prog);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, outW, outH);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, srcTex);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_tex'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, blurTex ?? srcTex);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_blur'), 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_useBlur'), blurTex ? 1 : 0);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_texel'), 1 / outW, 1 / outH);
      const f = (name: string, v: number) => gl.uniform1f(gl.getUniformLocation(prog, name), v);
      f('u_brightness', p.brightness);
      f('u_contrast', p.contrast);
      f('u_saturation', p.saturation);
      f('u_vibrance', p.vibrance);
      f('u_temperature', p.temperature);
      f('u_tint', p.tint);
      f('u_highlights', p.highlights);
      f('u_shadows', p.shadows);
      f('u_whites', p.whites);
      f('u_blacks', p.blacks);
      f('u_fade', p.fade);
      f('u_vignette', p.vignette);
      f('u_sharpness', p.sharpness);
      f('u_grayscale', p.grayscale);
      f('u_sepia', p.sepia);
      gl.uniform4fv(gl.getUniformLocation(prog, 'u_shadowTint'), p.shadowTint);
      gl.uniform4fv(gl.getUniformLocation(prog, 'u_highlightTint'), p.highlightTint);
      this.drawQuad(prog);

      const out = createCanvas(outW, outH);
      const octx = out.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D;
      octx.drawImage(this.canvas, 0, 0);
      return out;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SecurityError') return null;
      throw err;
    } finally {
      gl.activeTexture(gl.TEXTURE0);
      for (const t of created.textures) gl.deleteTexture(t);
      for (const f of created.fbos) gl.deleteFramebuffer(f);
    }
  }
}
