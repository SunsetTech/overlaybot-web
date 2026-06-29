import http from "http"
import { WebSocketServer, WebSocket } from "ws"

const HTTP_Server = http.createServer((_, Response) => {
	Response.writeHead(200)
	Response.end("hello")
})

const WS_Server = new WebSocketServer({ server: HTTP_Server })

class WS_Connection {
	IsAlive = true
	constructor(public Socket: WebSocket) {}
}

class WS_BotConnection extends WS_Connection {
	Authenticated = false
}

class WS_ViewerConnection extends WS_Connection {
	constructor(Socket: WebSocket, public TwitchID: string) {
		super(Socket)
	}
}

const BotClients = new Map<WebSocket, WS_BotConnection>()
const ViewerClients = new Map<WebSocket, WS_ViewerConnection>()

function HandleBotConnection(Client: WebSocket) {
	console.log("Bot connected")
	BotClients.set(Client, new WS_BotConnection(Client))
	
	Client.on("message", (Data) => {
		console.log("Received from bot:", Data)
	})
	
	Client.on("close", () => {
		console.log("Bot disconnected")
		BotClients.delete(Client)
	})
	
	Client.on("pong", () => {
		BotClients.get(Client)!.IsAlive = true;
	})
}

function HandleViewerConnection(Client: WebSocket) {
	console.log("Viewer connected")
	ViewerClients.set(Client, new WS_ViewerConnection(Client, ""))
	
	Client.on("message", (Data) => {
		console.log("Received from viewer:", Data)
	})
	
	Client.on("close", () => {
		console.log("Viewer disconnected")
		ViewerClients.delete(Client)
	})
	
	Client.on("pong", () => {
		ViewerClients.get(Client)!.IsAlive = true;
	})
}

WS_Server.on("connection", (Client, Request) => {
	const Path = new URL(Request.url!, "http://localhost").pathname
	if (Path === "/bot") {
		HandleBotConnection(Client)
	} else if (Path === "/viewer") {
		HandleViewerConnection(Client)
	} else {
		Client.terminate()
	}
})

HTTP_Server.listen(3131, () => {
	console.log("listening on http://localhost:3131")
})

function CheckLiveness(Client: WS_Connection) {
	if (Client.IsAlive === false) {
		Client.Socket.terminate()
		return
	}
	Client.IsAlive = false
	Client.Socket.ping()
}

setInterval(() => {
	BotClients.forEach(CheckLiveness)
	ViewerClients.forEach(CheckLiveness)
}, 30000)

