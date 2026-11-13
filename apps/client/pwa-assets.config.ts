import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const brand = '#0f5132';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // Maskable and Apple icons get cropped or rounded by the OS, so fill them with the brand colour.
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: brand } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: brand } },
  },
  images: ['public/favicon.svg'],
});
