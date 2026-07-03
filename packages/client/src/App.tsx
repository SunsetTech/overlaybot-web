import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { UseViewerSocket } from "./AppContext"
import { ControlsDisplay } from "./Component/ControlsDisplay"
import { toast, Toaster } from "react-hot-toast"
import { Button } from "./components/ui/button"
import type { Controls } from "@overlaybot/shared"
import { ServerResponseSchema } from "@overlaybot/shared"

function App() {
	const Connection = UseViewerSocket()
	const [Controls, setControls] = useState<Controls | null>(null)
	const [Balance, setBalance] = useState<number>(0)
	const [Costs, setCosts] = useState<Record<string, number>>({})
	const Navigate = useNavigate()

	useEffect(() => {
		if (!Connection) {return}
		const HandleMessage = (Event: MessageEvent) => {
			const Message = JSON.parse(Event.data)
			const Result = ServerResponseSchema.safeParse(Message)
			if (!Result.success) {
				console.log(Result.error.issues)
				return
			}
			const Response = Result.data
			if (Response.Type === "Introspection") {
				console.log("updating controls")
				setControls(Response.Controls)
				const BalanceRequest = {
					Type: "Balance"
				}
				Connection.send(JSON.stringify(BalanceRequest))
			} else if (Response.Type === "BotDisconnected") {
				console.log("bot disconnected")
				setControls(null)
			} else if (Response.Type === "BadLogin") {
				Navigate("/login")
			} else if (Response.Type === "Activated") {
				setBalance(Response.Balance as number)
				toast.success("Redeem successful")
			} else if (Response.Type === "Rejected") {
				const Reason = Response.Reason as string
				toast.error(`Redeem rejected - ${Reason}`)
			} else if (Response.Type === "Balance") {
				setBalance(Response.Balance as number)
			} else if (Response.Type === "Cost") {
				setCosts(Previous => ({ ...Previous, [Response.Command]: Response.Cost }))
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
