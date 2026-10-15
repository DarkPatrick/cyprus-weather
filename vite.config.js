import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
// The app version shown in the footer comes from the Android build, so it always matches the release.
const gradle=readFileSync(new URL('./android/app/build.gradle',import.meta.url),'utf8');
const appVersion=gradle.match(/versionName "([^"]+)"/)?.[1]||'dev';
export default defineConfig({define:{__APP_VERSION__:JSON.stringify(appVersion)},root:'mobile',build:{outDir:'dist',emptyOutDir:true,rollupOptions:{output:{manualChunks:{charts:['echarts/core','echarts/charts','echarts/components','echarts/renderers'],map:['leaflet']}}}},server:{proxy:{'/api':'http://127.0.0.1:8092'}}});
