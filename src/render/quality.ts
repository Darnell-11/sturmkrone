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
const STRONG_DESKTOP = /rtx\s*[2-9]0[6-9]0|rx\s*[6-9][7-9]\d\d|apple m\d+ (pro|max|ultra)|radeon pro w/i;

/** Macht aus "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x9A49) Direct3D11 …)" ein lesbares "Intel Iris Xe Graphics". */
export function prettyGpu(raw: string): string {
  let s = raw;
  const angle = /^ANGLE \([^,]+,\s*(.+?)(\s*\(0x[0-9a-f]+\))?\s*(Direct3D|OpenGL|Vulkan|Metal|,|\)\s*$)/i.exec(s);
  if (angle) s = angle[1];
  return s.replace(/\((R|TM)\)/gi, '').replace(/\s+/g, ' ').trim() || 'unbekannte Grafik';
}

/** Wählt beim ersten Start eine passende Grafikstufe. */
export function detectTier(info: DeviceInfo): { tier: QualityTier; reason: string } {
  const gpu = prettyGpu(info.gpu);
  if (!info.webgl2) return { tier: 'low', reason: 'Älteres WebGL – Stufe Niedrig' };
  if (SOFTWARE.test(info.gpu)) return { tier: 'low', reason: `Software-Grafik (${gpu})` };

  let tier: QualityTier;
  if (info.mobile) {
    if ((info.memoryGb !== null && info.memoryGb <= 2) || WEAK_MOBILE.test(info.gpu)) tier = 'low';
    else if (STRONG_MOBILE.test(info.gpu) && (info.memoryGb ?? 8) >= 8) tier = 'high';
    else tier = 'mid';
  } else {
    if (STRONG_DESKTOP.test(info.gpu)) tier = 'max';
    else if (WEAK_DESKTOP.test(info.gpu)) tier = 'mid';
    else tier = 'high';
  }
  if (info.cores !== null && info.cores <= 2) tier = lowerTier(tier) ?? tier;
  return { tier, reason: `${info.mobile ? 'Handy/Tablet' : 'PC'} mit ${gpu}` };
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
    if (frameDt <= 0 || frameDt > 0.5) return false;
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
