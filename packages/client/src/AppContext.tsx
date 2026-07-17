import { createContext, useState, useEffect, useContext } from "react"
import type { ReactNode } from "react"

const AppContext = createContext<WebSocket | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
	const [ViewerSocket, SetViewerSocket] = useState<WebSocket | null>(null)
	
	useEffect(() => {
		const Connection = new WebSocket("wss://overlaybot-web-client.storm.internal/viewer")
		SetViewerSocket(Connection)
		return () => Connection.close()
	}, [])
	
	return <AppContext.Provider value={ViewerSocket}>{children}</AppContext.Provider>
}

export const UseViewerSocket = () => useContext(AppContext)
