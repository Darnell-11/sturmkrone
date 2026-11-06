const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text sicher in HTML einsetzen (z. B. selbst gewählte Namen). */
export function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function formatPlayTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} Std. ${m % 60} Min.` : `${m} Min.`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function downloadText(filename: string, text: string) {
  // In der Android-App kann die Webansicht keine Dateien laden – dort speichert Android selbst
  const bridge = (window as Window & { SturmApp?: { saveFile?(n: string, t: string): void } }).SturmApp;
  if (bridge?.saveFile) { bridge.saveFile(filename, text); return; }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    });
    input.click();
  });
}
