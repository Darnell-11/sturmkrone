import { LoadingManager, TextureLoader, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

/**
 * Zentrale Lade-Pipeline.
 *
 * - Ein LoadingManager überwacht alle Dateien (Modelle, Texturen); dazu kommen eigene Aufgaben
 *   (Figuren aufbereiten, Shader vorkompilieren) mit Gewicht. Daraus entsteht ein Fortschritt 0 … 1.
 * - Alle glTF-Modelle laden über denselben GLTFLoader mit:
 *   - DRACOLoader (Geometrie-Kompression; Decoder liegt lokal unter libs/draco, offline verfügbar)
 *   - KTX2Loader (Basis Universal; Texturen bleiben auf der Grafikkarte komprimiert – weniger Grafikspeicher.
 *     Der Transcoder unter libs/basis wird erst geladen, wenn ein Modell wirklich KTX2 enthält)
 *   - Kein Meshopt: Meshopt braucht WebAssembly (siehe unten); die KayKit-Animationen sind deshalb unkomprimiert (scripts/decode-meshopt.mjs)
 *   Hinweis: Den früheren BasisTextureLoader gibt es in three.js nicht mehr – KTX2Loader ist sein Nachfolger.
 * - Audio: Musik und Klänge werden im Spiel erzeugt (Web Audio), es gibt keine Audiodateien zu laden.
 */
const BASE = import.meta.env.BASE_URL;

/**
 * Strenge Sicherheitsrichtlinien eingebundener Seiten (z. B. wildhunt.com.de/sturmkrone: `worker-src 'self'`, `script-src` ohne
 * `'wasm-unsafe-eval'`) verbieten WebAssembly und Blob-Worker. Der Standard-DRACOLoader braucht beides; das Spiel blieb dort bei 2 % im
 * Ladebalken stehen. Prüfung ohne Nebenwirkung: winziges Modul übersetzen und einen leeren Blob-Worker starten.
 */
export function wasmAndBlobWorkersAllowed(): boolean {
  try {
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch {
    return false;
  }
  try {
    const u = URL.createObjectURL(new Blob(['']));
    const w = new Worker(u);
    w.terminate();
    URL.revokeObjectURL(u);
  } catch {
    return false;
  }
  return true;
}

/**
 * Eingebettete Texturen der GLB-Dateien lädt der GLTFLoader standardmäßig mit dem ImageBitmapLoader, und der holt sie per fetch von einer
 * Blob-Adresse; das verbietet `connect-src` strenger Sicherheitsrichtlinien (Blob nicht erlaubt), die Texturen blieben leer. Der
 * TextureLoader nimmt ein Bildelement (`img-src` erlaubt blob:) und ist der offizielle Weg für Safari und Firefox. Gilt nur bei strenger Richtlinie.
 */
function useImageElementTextures(gltf: GLTFLoader, manager: LoadingManager) {
  if (wasmAndBlobWorkersAllowed()) return;
  gltf.register((parser) => {
    (parser as unknown as { textureLoader: TextureLoader }).textureLoader = new TextureLoader(manager);
    return { name: 'SK_ImageElementTextures' };
  });
}

/** Draco ohne WebAssembly und ohne Blob-Worker: JavaScript-Decoder in einem Worker aus einer echten Datei (libs/draco/draco-js-worker.js) */
function makeDraco(manager: LoadingManager): DRACOLoader {
  const l = new DRACOLoader(manager);
  l.setDecoderPath(`${BASE}libs/draco/`);
  if (!wasmAndBlobWorkersAllowed()) {
    const any = l as unknown as { _initDecoder: () => Promise<void>; decoderConfig: object; workerSourceURL: string; decoderPending: Promise<void> | null };
    any._initDecoder = () => {
      if (!any.decoderPending) {
        any.decoderConfig = { type: 'js' };
        any.workerSourceURL = `${BASE}libs/draco/draco-js-worker.js`;
        any.decoderPending = Promise.resolve();
      }
      return any.decoderPending;
    };
    console.info('Sturmkrone: strenge Sicherheitsrichtlinie erkannt, Draco läuft ohne WebAssembly.');
  }
  return l;
}

interface Task { weight: number; done: number }

/** Erwartete Gesamtgröße aller Modelle beim Start (Bytes, gemessen: 136 Dateien, rund 10,3 MB); nur für den Ladebalken */
const EXPECTED_BYTES = 10.4e6;

export class Preloader {
  readonly manager = new LoadingManager();
  private tasks = new Map<string, Task>();
  /** Bytes je Datei (aus den Fortschrittsereignissen) – Datei-Fortschritt nach Größe statt nach Anzahl */
  private bytes = new Map<string, { loaded: number; total: number }>();
  private listeners: ((p: number, phase: string) => void)[] = [];
  phase = '';
  /** Anteil der Dateien am Gesamtfortschritt */
  private fileWeight = 0;

  private gltf: GLTFLoader | null = null;
  private draco: DRACOLoader | null = null;
  private ktx2: KTX2Loader | null = null;

  constructor() {
    this.manager.onError = (url) => console.warn('Datei konnte nicht geladen werden:', url);
  }

  /** Einmal mit dem Renderer aufrufen (KTX2 muss wissen, welche Kompressionsformate die Grafikkarte kann) */
  init(renderer: WebGLRenderer) {
    this.draco = makeDraco(this.manager);
    // WebAssembly-Decoder ist Standard (setDecoderConfig ist seit three r186 veraltet und warnt)
    this.ktx2 = new KTX2Loader(this.manager);
    this.ktx2.setTranscoderPath(`${BASE}libs/basis/`);
    this.ktx2.detectSupport(renderer);
    this.gltf = new GLTFLoader(this.manager);
    this.gltf.setDRACOLoader(this.draco);
    this.gltf.setKTX2Loader(this.ktx2);
    useImageElementTextures(this.gltf, this.manager);
  }

  /** Gemeinsamer glTF-Loader (mit Draco/KTX2/Meshopt) */
  get loader(): GLTFLoader {
    if (!this.gltf) {
      // ohne Renderer (z. B. in Tests): ohne KTX2
      this.gltf = new GLTFLoader(this.manager);
      this.draco ??= makeDraco(this.manager);
      this.gltf.setDRACOLoader(this.draco);
      useImageElementTextures(this.gltf, this.manager);
    }
    return this.gltf;
  }

  /** Datei laden und ihren Fortschritt (in Bytes) mitzählen */
  async loadGltf(url: string) {
    this.bytes.set(url, { loaded: 0, total: 0 });
    const g = await this.loader.loadAsync(url, (e) => {
      const b = this.bytes.get(url)!;
      b.loaded = e.loaded;
      if (e.total) b.total = e.total;
      this.emit();
    });
    const b = this.bytes.get(url)!;
    b.loaded = b.total = Math.max(b.loaded, b.total, 1);
    this.emit();
    return g;
  }

  /** Gewichte festlegen: files = Anteil der Dateien, dazu benannte Aufgaben (Summe ≈ 1) */
  get hasPlan() { return this.fileWeight > 0; }

  plan(files: number, tasks: Record<string, number>) {
    this.fileWeight = files;
    for (const [k, w] of Object.entries(tasks)) this.tasks.set(k, { weight: w, done: 0 });
  }

  /** Fortschritt einer Aufgabe (0 … 1) und Text für die Anzeige */
  step(task: string, done: number, phase?: string) {
    const t = this.tasks.get(task);
    if (t) t.done = Math.max(t.done, Math.min(1, done));
    if (phase) this.phase = phase;
    this.emit();
  }

  setPhase(phase: string) { this.phase = phase; this.emit(); }

  private filesComplete = false;
  /** Alle Dateien sind geladen: ab jetzt zählt die tatsächliche Größe, der Dateianteil ist voll */
  completeFiles() { this.filesComplete = true; this.emit(); }

  get progress(): number {
    let loaded = 0, total = 0;
    for (const b of this.bytes.values()) { loaded += b.loaded; total += b.total || 1; }
    // Die Gesamtmenge ist anfangs unbekannt (Dateien melden sich erst beim Laden an): ohne Untergrenze stand der Balken nach den
    // ersten kleinen Dateien schon bei 100 % des Dateianteils. Darum zählt mindestens die erwartete Gesamtgröße (EXPECTED_BYTES).
    let p = loaded > 0 ? (loaded / Math.max(total, this.filesComplete ? 0 : EXPECTED_BYTES)) * this.fileWeight : 0;
    for (const t of this.tasks.values()) p += t.weight * t.done;
    return Math.min(1, p);
  }

  onProgress(fn: (p: number, phase: string) => void) { this.listeners.push(fn); }

  private emit() { const p = this.progress; for (const l of this.listeners) l(p, this.phase); }

  dispose() {
    this.draco?.dispose();
    this.ktx2?.dispose();
    this.listeners = [];
  }
}

/** Die eine Lade-Pipeline des Spiels */
export const preload = new Preloader();
