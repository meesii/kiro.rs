import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import Inspector from 'vite-plugin-code-inspector';

export default defineConfig(({ command }) => ({
    base: command === 'build' ? '/admin/' : '/',
    plugins: [
        react(),
        tailwindcss(),
        Inspector({
            launchEditor: 'qoder',
        }),
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:8990',
                changeOrigin: true,
            },
        },
    },
}));
