import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { homeScreen } from './tools/home-screen.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), homeScreen()],
})
