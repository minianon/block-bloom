import { defineConfig } from 'vite';

// Relative paths so the same build works on web portals (sub-folders) and inside the Android app.
export default defineConfig({ base: './' });
