import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

export default defineConfig({
  server: {
    host: true,            // เท่ากับ 0.0.0.0
    port: 5173,
    strictPort: true,
    cors: true,
    // กันกรณี HMR งอแงเวลาเข้าผ่าน IP
    // hmr: {
    //   host: '192.168.1.39',   // ใส่ IP ของ Pi
    //   clientPort: 5173,
    //   protocol: 'ws'
    // },
    // ถ้า Vite เวอร์ชันใหม่มี allowedHosts ให้เปิดด้วย:
    // allowedHosts: ['192.168.1.39']
  },
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
