import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Erzeugt die App-Symbole (PNG) aus public/favicon.svg: `npm run icons`
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#190D08' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#190D08' } },
  },
  images: ['public/favicon.svg'],
});
