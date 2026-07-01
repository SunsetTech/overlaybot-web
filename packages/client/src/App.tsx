import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { UseViewerSocket } from "./AppContext"
import type { OverlayBot } from "@overlaybot/shared"
import { ControlsDisplay } from "./Component/ControlsDisplay"
import { toast, Toaster } from "react-hot-toast"
function App() {
	const Connection = UseViewerSocket()
	const [Controls, SetControls] = useState<OverlayBot.Controls | null>(null)
	const Navigate = useNavigate()

	useEffect(() => {
		if (!Connection) {return}
		const HandleMessage = (Event: MessageEvent) => {
			const Message = JSON.parse(Event.data)
			if (Message.Type == "Controls") {
				console.log("updating controls")
				SetControls(Message.Controls)
			} else if (Message.Type == "BotDisconnected") {
				console.log("bot disconnected")
				SetControls(null)
			} else if (Message.Type == "BadLogin") {
				Navigate("/login")
			} else if (Message.Type == "Activated") {
				toast.success("Redeem successful")
			} else if (Message.Type == "Rejected") {
				toast.error("Redeem rejected")
			}
		}
		Connection.addEventListener("message", HandleMessage)
		return () => Connection.removeEventListener("message", HandleMessage)
	}, [Connection])
	return (<div>
		<Toaster position="bottom-right" reverseOrder={false}/>
		{
			Controls 
			? <ControlsDisplay controls={Controls} /> 
			: <div>Bot offline!</div>
		}
		<p><a href="/logout">Logout</a></p>
		<p><a href="/logout_everywhere">Logout everywhere</a></p>
	</div>)
}

export default App
