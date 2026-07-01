import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { AppProvider } from './AppContext'
import { CookiesProvider } from "react-cookie"
import App from './App'
import Login from "./Login"

createRoot(document.getElementById("root")!).render(
	<BrowserRouter>
		<Routes>
			<Route path="/login" element={<CookiesProvider><Login /></CookiesProvider>} />
			<Route path="/app" element={<AppProvider><App /></AppProvider>} />
		</Routes>
	</BrowserRouter>
)
