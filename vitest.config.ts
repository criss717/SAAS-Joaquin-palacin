import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true, // Esto te permite usar 'describe' e 'it' sin importarlos en cada archivo
    },
})