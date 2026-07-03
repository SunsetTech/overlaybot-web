import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { UseViewerSocket } from "./AppContext"
import type { OverlayBot } from "@overlaybot/shared"
import { ControlsDisplay } from "./Component/ControlsDisplay"
import { toast, Toaster } from "react-hot-toast"
import { Button } from "./components/ui/button"

function App() {
	const Connection = UseViewerSocket()
	const [Controls, setControls] = useState<OverlayBot.Controls | null>(null)
	const [Balance, setBalance] = useState<number>(0)
	const [Costs, setCosts] = useState<Record<string, number>>({})
	const Navigate = useNavigate()

	useEffect(() => {
		if (!Connection) {return}
		const HandleMessage = (Event: MessageEvent) => {
			const Message = JSON.parse(Event.data)
			if (Message.Type == "Controls") {
				console.log("updating controls")
				setControls(Message.Controls)
				const BalanceRequest = {
					Type: "Balance"
				}
				Connection.send(JSON.stringify(BalanceRequest))
			} else if (Message.Type == "BotDisconnected") {
				console.log("bot disconnected")
				setControls(null)
			} else if (Message.Type == "BadLogin") {
				Navigate("/login")
			} else if (Message.Type == "Activated") {
				setBalance(Message.Balance as number)
				toast.success("Redeem successful")
			} else if (Message.Type == "Rejected") {
				const Reason = Message.Reason as string
				toast.error(`Redeem rejected - ${Reason}`)
			} else if (Message.Type == "Balance") {
				setBalance(Message.Balance as number)
			} else if (Message.Type == "Cost") {
				setCosts(Previous => ({ ...Previous, [Message.Command]: Message.Cost }))
			}
		}
		Connection.addEventListener("message", HandleMessage)
		return () => Connection.removeEventListener("message", HandleMessage)
	}, [Connection])
	return (<div>
		<Toaster position="bottom-right" reverseOrder={false}/>
		{
			Controls 
			? (<div>
				<p className="text-center">Balance: {Balance} SP</p>
				<ControlsDisplay controls={Controls} costs={Costs}/> 
			</div>)
			: (<div>Bot offline!</div>)
		}
		<Button asChild>
			<a href="/logout">Logout</a>
		</Button>
		<Button asChild>
			<a href="/logout_everywhere">Logout Everywhere</a>
		</Button>
	</div>)
}

export default App
