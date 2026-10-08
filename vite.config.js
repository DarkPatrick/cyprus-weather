import { defineConfig } from 'vite';
export default defineConfig({root:'mobile',build:{outDir:'dist',emptyOutDir:true,rollupOptions:{output:{manualChunks:{charts:['echarts/core','echarts/charts','echarts/components','echarts/renderers'],map:['leaflet']}}}},server:{proxy:{'/api':'http://127.0.0.1:8092'}}});
