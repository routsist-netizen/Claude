/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import netlify from '@netlify/vite-plugin'

export default defineConfig({
  plugins: [react(), netlify()],
  test: {
    // Scheduling flags "night" steps by local wall-clock hour, so tests pin a time zone.
    env: { TZ: 'Europe/Athens' },
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
