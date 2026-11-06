import { lowerTier, type QualityTier } from '../data/qualityTiers';

export interface DeviceInfo {
  mobile: boolean;
  gpu: string;
  dpr: number;
  memoryGb: number | null;
  cores: number | null;
  webgl2: boolean;
}

export function gatherDeviceInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): DeviceInfo {
  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch { gpu = ''; }
  // nur beim Entwickeln: ?gpu=… simuliert einen anderen (oder verborgenen) Grafikkartennamen
  if (import.meta.env?.DEV) { const o = new URLSearchParams(location.search).get('gpu'); if (o !== null) gpu = o; }
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { mobile?: boolean } };
  const ua = navigator.userAgent;
  const mobile = nav.userAgentData?.mobile
    ?? (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
  return {
    mobile,
    gpu,
    dpr: window.devicePixelRatio || 1,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: navigator.hardwareConcurrency || null,
    webgl2: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext,
  };
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i;
const WEAK_MOBILE = /mali-(4\d\d|t\d+)|adreno[^\d]*[2-5]\d\d|powervr|sgx|videocore|mali-g(31|51|52|57)\b/i;
const STRONG_MOBILE = /adreno[^\d]*(7[4-9]\d|8\d\d)|immortalis|mali-g7[1-9]\d|xclipse/i;
const WEAK_DESKTOP = /intel.*(hd graphics|uhd graphics( [56]\d\d)?\b)|gma|radeon\(tm\) r[2-5]/i;
// sehr starke Grafikkarten: Ultra
const ULTRA_DESKTOP = /rtx\s*(3090|4070\s*ti|4080|4090|50[6-9]0)|rx\s*(79\d\d|9070)|apple m\d+ (max|ultra)/i;
const STRONG_DESKTOP = /rtx\s*[2-9]0[6-9]0|rx\s*[6-9][7-9]\d\d|apple m\d+ (pro|max|ultra)|radeon pro w/i;

/** Macht aus "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x9A49) Direct3D11 …)" ein lesbares "Intel Iris Xe Graphics". */
export function prettyGpu(raw: string): string {
  let s = raw;
  const angle = /^ANGLE \([^,]+,\s*(.+?)(\s*\(0x[0-9a-f]+\))?\s*(Direct3D|OpenGL|Vulkan|Metal|,|\)\s*$)/i.exec(s);
  if (angle) s = angle[1];
  return s.replace(/\((R|TM)\)/gi, '').replace(/\s+/g, ' ').trim() || 'unbekannte Grafik';
}

const KNOWN_VENDOR = /nvidia|geforce|rtx|gtx|quadro|radeon|amd|intel|iris|uhd|arc|apple|adreno|mali|powervr|xclipse|immortalis/i;

/**
 * Verbirgt der Browser den echten Namen der Grafikkarte? Firefox meldet z. B. „GeForce GTX 980, or similar“,
 * Brave und Datenschutz-Einstellungen geben gar keinen oder einen erfundenen Namen heraus.
 */
export function gpuMasked(raw: string): boolean {
  return !raw || /or similar|webkit webgl|^mozilla|generic|unknown|disabled/i.test(raw) || !KNOWN_VENDOR.test(raw);
}

/** Stufe aus dem Leistungstest (Millisekunden je Durchgang, siehe benchmarkGpu; RTX 5070 Ti ≈ 0,1 ms) */
export function tierFromBench(ms: number, mobile: boolean): QualityTier {
  const t: QualityTier = ms <= 0.14 ? 'ultra' : ms <= 0.45 ? 'max' : ms <= 1.6 ? 'high' : ms <= 12 ? 'mid' : 'low';
  // Handys werden heiß und drosseln: höchstens „Hoch“
  if (mobile && (t === 'ultra' || t === 'max')) return 'high';
  return t;
}

const BENCH_WORD: Record<QualityTier, string> = { ultra: 'sehr stark', max: 'stark', high: 'gut', mid: 'mittel', low: 'schwach' };

export interface Detected { tier: QualityTier; reason: string; software?: boolean; measured?: boolean }

/**
 * Wählt beim ersten Start eine passende Grafikstufe. Ist der Name der Grafikkarte verborgen oder unbekannt,
 * entscheidet ein kurzer Leistungstest (bench = Millisekunden je Durchgang).
 */
export function detectTier(info: DeviceInfo, bench: number | null = null): Detected {
  const gpu = prettyGpu(info.gpu);
  if (!info.webgl2) return { tier: 'low', reason: 'Älteres WebGL – Stufe Niedrig' };
  if (SOFTWARE.test(info.gpu)) return { tier: 'low', reason: `Keine Grafikkarte in Benutzung – im Browser ist die Hardwarebeschleunigung aus (${gpu})`, software: true };
  // Erkennung über den Leistungstest, wenn der Name nichts taugt oder in keiner Liste steht
  const listed = info.mobile
    ? WEAK_MOBILE.test(info.gpu) || STRONG_MOBILE.test(info.gpu)
    : ULTRA_DESKTOP.test(info.gpu) || STRONG_DESKTOP.test(info.gpu) || WEAK_DESKTOP.test(info.gpu);
  if (bench !== null && (gpuMasked(info.gpu) || !listed)) {
    // eine Messung über 60 ms je Durchgang heißt: Software-Grafik, auch wenn der Name etwas anderes sagt
    if (bench > 60) return { tier: 'low', reason: 'Keine Grafikkarte in Benutzung – im Browser ist die Hardwarebeschleunigung aus', software: true };
    const tier = tierFromBench(bench, info.mobile);
    const name = gpuMasked(info.gpu) ? 'Grafikkarte (Name vom Browser verborgen)' : gpu;
    return { tier, reason: `${info.mobile ? 'Handy/Tablet' : 'PC'} mit ${name} – gemessen: ${BENCH_WORD[tier]}`, measured: true };
  }

  let tier: QualityTier;
  if (info.mobile) {
    if ((info.memoryGb !== null && info.memoryGb <= 2) || WEAK_MOBILE.test(info.gpu)) tier = 'low';
    else if (STRONG_MOBILE.test(info.gpu) && (info.memoryGb ?? 8) >= 8) tier = 'high';
    else tier = 'mid';
  } else {
    if (ULTRA_DESKTOP.test(info.gpu)) tier = 'ultra';
    else if (STRONG_DESKTOP.test(info.gpu)) tier = 'max';
    else if (WEAK_DESKTOP.test(info.gpu)) tier = 'mid';
    else tier = 'high';
  }
  if (info.cores !== null && info.cores <= 2) tier = lowerTier(tier) ?? tier;
  return { tier, reason: `${info.mobile ? 'Handy/Tablet' : 'PC'} mit ${gpu}` };
}

/** Braucht diese Erkennung den Leistungstest? (Name verborgen, unbekannt oder nicht in den Listen) */
export function needsBench(info: DeviceInfo): boolean {
  if (!info.webgl2 || SOFTWARE.test(info.gpu)) return false;
  if (gpuMasked(info.gpu)) return true;
  return info.mobile
    ? !(WEAK_MOBILE.test(info.gpu) || STRONG_MOBILE.test(info.gpu))
    : !(ULTRA_DESKTOP.test(info.gpu) || STRONG_DESKTOP.test(info.gpu) || WEAK_DESKTOP.test(info.gpu));
}

/**
 * Beobachtet die Bildrate im Spiel. Bleibt sie über mehrere Sekunden unter ~42 fps,
 * schlägt sie eine niedrigere Stufe vor (nur bei „Automatisch“).
 */
export class AutoQuality {
  private warmup = 0;
  private total = 0;
  private frames = 0;

  reset() { this.warmup = 0; this.total = 0; this.frames = 0; }

  /** true = Stufe senken */
  sample(frameDt: number): boolean {
    // Sehr lange Frames kommen von gedrosselten Hintergrund-Tabs, nicht von zu hoher Grafiklast
    if (frameDt <= 0 || frameDt > 0.2 || document.hidden) return false;
    this.warmup += frameDt;
    if (this.warmup < 4) return false; // Shader-Kompilierung und Laden abwarten
    this.total += frameDt;
    this.frames++;
    if (this.total < 6) return false;
    const avg = this.total / this.frames;
    this.total = 0;
    this.frames = 0;
    if (avg > 1 / 42) { this.warmup = 0; return true; }
    return false;
  }
}

/**
 * Kurzer Leistungstest der Grafikkarte (~0,1–0,3 s): rechnet einen aufwendigen Shader über eine 1024×1024-Fläche
 * und misst die Zeit. Liefert Millisekunden je Durchgang (kleiner = schneller) oder null, wenn der Test nicht geht.
 * Wird gebraucht, wenn der Browser den Namen der Grafikkarte verbirgt (Firefox, Brave, Datenschutz-Einstellungen).
 */
export function benchmarkGpu(gl: WebGL2RenderingContext): number | null {
  try {
    const vs = `#version 300 es
      in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
    const fs = `#version 300 es
      precision highp float; uniform float uT; out vec4 o;
      void main(){
        vec2 q = gl_FragCoord.xy * 0.013 + uT;
        float a = 0.0;
        for (int i = 0; i < 128; i++) { q = vec2(sin(q.y * 1.7 + a), cos(q.x * 1.3 - a)) * 1.1 + q.yx * 0.3; a += dot(q, q) * 0.01; }
        o = vec4(fract(a), q, 1.0);
      }`;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    const size = 1024;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog);
    gl.viewport(0, 0, size, size);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    const uT = gl.getUniformLocation(prog, 'uT');
    const px = new Uint8Array(4);
    const run = (n: number) => { for (let i = 0; i < n; i++) { gl.uniform1f(uT, i * 0.37); gl.drawArrays(gl.TRIANGLES, 0, 3); } gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
    run(1); // Aufwärmen (Shader fertig übersetzen)
    let n = 1, ms = 0;
    // so lange verdoppeln, bis die Messung lang genug für eine verlässliche Zeit ist; sehr langsame
    // (Software-)Grafik bricht nach dem ersten Durchgang ab, damit der Start nicht hängt
    for (;;) {
      const t0 = performance.now();
      run(n);
      ms = performance.now() - t0;
      if (ms > 30 || n >= 128) break;
      n *= 2;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.deleteVertexArray(vao); gl.deleteBuffer(buf); gl.deleteFramebuffer(fb); gl.deleteTexture(tex);
    gl.deleteProgram(prog); gl.deleteShader(v); gl.deleteShader(f);
    return ms / n;
  } catch {
    return null;
  }
}
