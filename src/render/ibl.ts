import { Mesh, PMREMGenerator, Scene, SphereGeometry, BackSide, ShaderMaterial, type WebGLRenderer, type WebGLRenderTarget, type Texture } from 'three';

/**
 * Bildbasierte Beleuchtung (IBL): Der gemalte Himmel wird regelmäßig in eine vorgefilterte Umgebungskarte
 * (PMREM) gerendert. Metall und glatte Flächen spiegeln daraus Himmel, Sonne und Abendrot – unscharf je nach Rauheit.
 *
 * Alle Toon-Materialien mit Metall lesen dieselbe Uniform (envShared.map), deshalb genügt ein Austausch der Textur.
 */
export const envShared = {
  map: { value: null as Texture | null },
  /** Stärke der Spiegelungen (nachts/bei Sturm geringer, folgt dem Himmel automatisch) */
  intensity: { value: 1 },
};

/** Größe der Umgebungskarte; legt die Shader-Konstanten für textureCubeUV fest */
export const ENV_CUBE = 128;

/** Konstanten wie in three.js (WebGLPrograms.generateCubeUVSize) für eine PMREM-Karte der Höhe h */
export function cubeUvDefines(): string {
  const imageHeight = ENV_CUBE * 4; // PMREM-Atlas: 4 × Würfelseite hoch
  const maxMip = Math.log2(imageHeight) - 2;
  const texelHeight = 1 / imageHeight;
  const texelWidth = 1 / (3 * Math.max(Math.pow(2, maxMip), 7 * 16));
  return `#define ENVMAP_TYPE_CUBE_UV\n#define CUBEUV_TEXEL_WIDTH ${texelWidth}\n#define CUBEUV_TEXEL_HEIGHT ${texelHeight}\n#define CUBEUV_MAX_MIP ${maxMip}.0\n`;
}

export class SkyProbe {
  private pmrem: PMREMGenerator;
  private scene = new Scene();
  private dome: Mesh;
  private rt: WebGLRenderTarget | null = null;
  private timer = 0;
  enabled = true;

  /** skyMaterial: das Himmels-Material der Welt (gleiche Uniforms → gleicher Himmel) */
  constructor(private gl: WebGLRenderer, skyMaterial: ShaderMaterial, private interval = 5) {
    this.pmrem = new PMREMGenerator(gl);
    // eigene Kugel mit demselben Shader-Material: Himmel, Sonne, Abendrot, Sterne
    const mat = skyMaterial.clone();
    mat.uniforms = skyMaterial.uniforms;
    mat.side = BackSide;
    this.dome = new Mesh(new SphereGeometry(100, 32, 16), mat);
    this.scene.add(this.dome);
  }

  /** Sofort neu aufnehmen (z. B. nach Zeitsprung oder Wetterwechsel) */
  refresh() { this.timer = 0; }

  /** Abstand zwischen zwei Aufnahmen (Grafikstufe); 0 = aus, Karte wird freigegeben */
  setInterval(seconds: number) {
    this.enabled = seconds > 0;
    this.interval = seconds;
    this.timer = 0;
    if (!this.enabled) { this.rt?.dispose(); this.rt = null; envShared.map.value = null; }
  }

  update(dt: number) {
    if (!this.enabled) return;
    this.timer -= dt;
    if (this.timer > 0 && this.rt) return;
    this.timer = this.interval;
    const old = this.rt;
    // Die PMREM-Erzeugung setzt das Renderziel selbst; das Spiel-Bild wird erst danach gezeichnet
    const prevTarget = this.gl.getRenderTarget();
    this.rt = this.pmrem.fromScene(this.scene, 0, 0.1, 500, { size: ENV_CUBE });
    this.gl.setRenderTarget(prevTarget);
    envShared.map.value = this.rt.texture;
    old?.dispose();
  }

  dispose() {
    this.rt?.dispose();
    this.rt = null;
    envShared.map.value = null;
    this.pmrem.dispose();
    this.dome.geometry.dispose();
    (this.dome.material as ShaderMaterial).dispose();
  }
}
