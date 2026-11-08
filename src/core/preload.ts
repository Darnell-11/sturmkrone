import { LoadingManager, type WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Zentrale Lade-Pipeline.
 *
 * - Ein LoadingManager überwacht alle Dateien (Modelle, Texturen); dazu kommen eigene Aufgaben
 *   (Figuren aufbereiten, Shader vorkompilieren) mit Gewicht. Daraus entsteht ein Fortschritt 0 … 1.
 * - Alle glTF-Modelle laden über denselben GLTFLoader mit:
 *   - DRACOLoader (Geometrie-Kompression; Decoder liegt lokal unter libs/draco, offline verfügbar)
 *   - KTX2Loader (Basis Universal; Texturen bleiben auf der Grafikkarte komprimiert – weniger Grafikspeicher.
 *     Der Transcoder unter libs/basis wird erst geladen, wenn ein Modell wirklich KTX2 enthält)
 *   - MeshoptDecoder (kompakte Animations- und Netzdaten)
 *   Hinweis: Den früheren BasisTextureLoader gibt es in three.js nicht mehr – KTX2Loader ist sein Nachfolger.
 * - Audio: Musik und Klänge werden im Spiel erzeugt (Web Audio), es gibt keine Audiodateien zu laden.
 */
const BASE = import.meta.env.BASE_URL;

interface Task { weight: number; done: number }

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
    this.draco = new DRACOLoader(this.manager);
    this.draco.setDecoderPath(`${BASE}libs/draco/`);
    this.draco.setDecoderConfig({ type: 'wasm' });
    this.ktx2 = new KTX2Loader(this.manager);
    this.ktx2.setTranscoderPath(`${BASE}libs/basis/`);
    this.ktx2.detectSupport(renderer);
    this.gltf = new GLTFLoader(this.manager);
    this.gltf.setDRACOLoader(this.draco);
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
  }

  /** Gemeinsamer glTF-Loader (mit Draco/KTX2/Meshopt) */
  get loader(): GLTFLoader {
    if (!this.gltf) {
      // ohne Renderer (z. B. in Tests): ohne KTX2
      this.gltf = new GLTFLoader(this.manager);
      this.draco ??= new DRACOLoader(this.manager);
      this.draco.setDecoderPath(`${BASE}libs/draco/`);
      this.gltf.setDRACOLoader(this.draco);
      this.gltf.setMeshoptDecoder(MeshoptDecoder);
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

  get progress(): number {
    let loaded = 0, total = 0;
    for (const b of this.bytes.values()) { loaded += b.loaded; total += b.total || 1; }
    // Dateien ohne Größenangabe zählen erst beim Abschluss
    let p = total > 0 ? (loaded / total) * this.fileWeight : 0;
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
