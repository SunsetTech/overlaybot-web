import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	server: {
		allowedHosts: ["overlaybot-web-client.tungstenbattlearmor.duckdns.org"],
		proxy: {
			"/auth": "http://localhost:3131",
			"/viewer": {
				target: "ws://localhost:3131",
				ws: true
			},
			"/logout": "http://localhost:3131",
			"/logout_everywhere": "http://localhost:3131"
		}
	}
})
