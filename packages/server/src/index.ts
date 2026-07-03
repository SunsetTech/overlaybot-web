import http from "http"
import express from "express"
import { parseCookie } from "cookie"
import { WebSocketServer, WebSocket } from "ws"
import { OverlayBot } from "@overlaybot/shared"
import { Pool } from "pg"
import jwt from "jsonwebtoken"
import "dotenv/config"

const DB_ConnectionPool = new Pool({
	host: "localhost",
	port: 5432,
	user: "overlaybot_web_server",
	password: process.env.DB_PASSWORD!,
	database: "OverlayBot_Web"
})

const TokenVersionCache = new Map<string, number>()

async function GetTokenVersion(TwitchID: string): Promise<number> {
	if (TokenVersionCache.has(TwitchID)) {
		return TokenVersionCache.get(TwitchID)!
	} else {
		const QueryResult = await DB_ConnectionPool.query(
			`SELECT token_version FROM users WHERE twitch_id = $1`,
			[TwitchID]
		)
		
		const TokenVersion = QueryResult.rows[0]?.token_version ?? 0
		TokenVersionCache.set(TwitchID, TokenVersion)
		
		return TokenVersion
	}
}

async function IncrementTokenVersion(TwitchID: string) {
	console.log("Incrementing token version", TwitchID)
	await DB_ConnectionPool.query(
		`INSERT INTO users (twitch_id, token_version) VALUES ($1, 1) ON CONFLICT (twitch_id) DO UPDATE SET token_version = users.token_version + 1`,
		[TwitchID]
	)
	
	TokenVersionCache.delete(TwitchID)
}

const App = express()

App.get("/logout", (_, Response) => {
	Response.writeHead(302, {
		location: "/login",
		"set-cookie": "session=; HttpOnly; Path=/; Max-Age=0"
	})
	Response.end()
})

App.get("/logout_everywhere", async (Request, Response) => {
	try {
		const Cookies = Request.headers.cookie
		if (!Cookies) {throw "no cookies"}
		const SessionToken = parseCookie(Cookies)?.session
		if (!SessionToken) {throw "no session token"}
		const Payload = jwt.verify(SessionToken, process.env.JWT_SECRET!) as {ID: string; Version: number}
		const StoredSessionVersion = await GetTokenVersion(Payload.ID)
		if (StoredSessionVersion !== Payload.Version) {throw "version mismatch"}
		let TwitchID = Payload.ID as string

		IncrementTokenVersion(TwitchID)
		Response.writeHead(302, {
			location: "/login",
			"set-cookie": "session=; HttpOnly; Path=/; Max-Age=0"
		})
		Response.end()
	} catch(Error) {
		console.log(Error)
		Response.writeHead(401)
		Response.end()
	}
})

App.get("/auth", async (Request, Response) => {
	console.log("auth endpoint hit")
	const Location = new URL(Request.url!, "http://localhost")
	const Cookies = parseCookie(Request.headers.cookie ?? "")
	
	const StoredState = Cookies.OAuthState
	const PassedState = Location.searchParams.get("state")
	
	if (!StoredState || !PassedState || PassedState != StoredState) {
		Response.writeHead(403)
		Response.end("Possible CSRF detected")
		return
	}
	

	const AuthorizationCode = Location.searchParams.get("code")
	if (!AuthorizationCode) {
		Response.writeHead(400)
		Response.end("missing code")
		return
	}
	
	const TokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: process.env.TWITCH_CLIENT_ID!,
			client_secret: process.env.TWITCH_CLIENT_SECRET!,
			code: AuthorizationCode!,
			grant_type: "authorization_code",
			redirect_uri: process.env.TWITCH_REDIRECT_URI!
		})
	})
	const TokenData = await TokenResponse.json()
	const AccessToken = TokenData.access_token
	
	const UserResponse = await fetch("https://api.twitch.tv/helix/users", {
		method: "GET",
		headers: {
			Authorization: "Bearer " + AccessToken,
			"Client-ID": process.env.TWITCH_CLIENT_ID!,
		}
	})
	const UserData = await UserResponse.json()
	const UserID = UserData.data[0].id as string
	const TokenVersion = await GetTokenVersion(UserID)
	const SessionToken = jwt.sign(
		{
			ID: UserID, 
			Version: TokenVersion
		},
		process.env.JWT_SECRET!,
		{ expiresIn: "1w" }
	)
	
	console.log("User logged in", UserID)
	
	Response.writeHead(302, {
		location: `/app`,
		"Set-Cookie": `session=${SessionToken}; HttpOnly; Path=/; Max-Age=604800`
	})
	Response.end()
})

const HTTP_Server = http.createServer(App)

const WS_Server = new WebSocketServer({ server: HTTP_Server })

class WS_Connection {
	IsAlive = true
	constructor(public Socket: WebSocket) {}
}

class WS_BotConnection extends WS_Connection {
	Authorized = false
}

class WS_ViewerConnection extends WS_Connection {
	public ConnectionID: string
	constructor(Socket: WebSocket, public TwitchID: string) {
		super(Socket)
		this.ConnectionID = crypto.randomUUID()
	}
}

let CurrentBot: WS_BotConnection
let CurrentControls: OverlayBot.Controls | null = null
const BotClients = new Map<WebSocket, WS_BotConnection>()
const ViewerClients = new Map<WebSocket, WS_ViewerConnection>()
const ViewerClientsByUser = new Map<string, Map<string, WS_ViewerConnection>>()
const ViewerClientsByID = new Map<string, WS_ViewerConnection>()

async function HandleBotConnection(Client: WebSocket) {
	console.log("Bot connected")
	BotClients.set(Client, new WS_BotConnection(Client))
	const ChallengeMessage = {
		Type: "Challenge",
	}
	Client.send(JSON.stringify(ChallengeMessage))

	Client.on("message", (Data) => {
		const Message = JSON.parse(Data.toString())
		console.log("Received from bot:", Data.toString())
		if (Message.Type === "Authorization") {
			if (Message.Token === process.env.BOT_PASSWORD!) {
				console.log("Bot authorized")
				CurrentBot = BotClients.get(Client)!
				BotClients.get(Client)!.Authorized = true
				const Response = {
					Type: "Introspect",
				}
				Client.send(JSON.stringify(Response))
			}
		} else if (Message.Type == "Introspection") {
			CurrentControls = Message.Controls
			ViewerClients.forEach((Connection) => {
				const ControlsMessage = {
					Type: "Controls",
					Controls: CurrentControls
				}
				Connection.Socket.send(JSON.stringify(ControlsMessage))
			})
		} else if (Message.Type == "Rejected" || Message.Type == "Activated" || Message.Type == "Balance") {
			const TargetConnection = ViewerClientsByID.get(Message.ConnectionID)!
			TargetConnection.Socket.send(Data.toString())
		}
	})
	
	Client.on("close", () => {
		console.log("Bot disconnected")
		CurrentControls = null
		BotClients.delete(Client)
		ViewerClients.forEach((Connection) => {
			const BotDisconnectedMessage = {
				Type: "BotDisconnected"
			}
			Connection.Socket.send(JSON.stringify(BotDisconnectedMessage))
		})
	})
	
	Client.on("pong", () => {
		BotClients.get(Client)!.IsAlive = true;
	})
}

async function HandleViewerConnection(Client: WebSocket, Request: http.IncomingMessage) {
	console.log("Viewer connected")
	try {
		const Cookies = Request.headers.cookie
		if (!Cookies) {throw "no cookies"}
		const SessionToken = parseCookie(Cookies)?.session
		if (!SessionToken) {throw "no session token"}
		const Payload = jwt.verify(SessionToken, process.env.JWT_SECRET!) as {ID: string; Version: number}
		const StoredSessionVersion = await GetTokenVersion(Payload.ID)
		if (StoredSessionVersion !== Payload.Version) {throw "version mismatch"}
		let TwitchID = Payload.ID as string
		console.log("TwitchID", TwitchID)
		if (ViewerClientsByUser.has(TwitchID)) {
			const ActiveClients = ViewerClientsByUser.get(TwitchID)!
			if (ActiveClients.size == 5) {throw "too many connections"}
		}

		const Viewer = new WS_ViewerConnection(Client, TwitchID)
		ViewerClients.set(Client, Viewer)
		if (!ViewerClientsByUser.has(TwitchID)) {
			ViewerClientsByUser.set(TwitchID, new Map())
		}
		ViewerClientsByUser.get(TwitchID)!.set(Viewer.ConnectionID, Viewer)
		ViewerClientsByID.set(Viewer.ConnectionID, Viewer)
		
		if (CurrentControls) {
			console.log("Sending viewer current controls")
			const ControlsMessage = {
				Type: "Controls",
				Controls: CurrentControls
			}
			Client.send(JSON.stringify(ControlsMessage))
		}
		
		Client.on("message", (Data) => {
			console.log("Received from viewer:", Data.toString())
			const Message = JSON.parse(Data.toString())
			if (Message.Type == "Activate" || Message.Type == "Balance") {
				const Viewer = ViewerClients.get(Client)!
				Message.TwitchID = Viewer.TwitchID
				Message.ConnectionID = Viewer.ConnectionID
				CurrentBot.Socket.send(JSON.stringify(Message))
			}
		})
		
		Client.on("close", () => {
			console.log("Viewer disconnected")
			ViewerClients.delete(Client)
			ViewerClientsByID.delete(Viewer.ConnectionID)
			ViewerClientsByUser.get(Viewer.TwitchID)!.delete(Viewer.ConnectionID)
			if (ViewerClientsByUser.get(Viewer.TwitchID)!.size == 0) {
				ViewerClientsByUser.delete(Viewer.TwitchID)
			}
		})
		
		Client.on("pong", () => {
			ViewerClients.get(Client)!.IsAlive = true;
		})
	} catch(Error) {
		console.log(Error)
		let BadLoginMessage = {
			Type: "BadLogin",
			Error
		}
		Client.send(JSON.stringify(BadLoginMessage))
		Client.terminate()
	}
}

WS_Server.on("connection", async (Client, Request) => {
	const Path = new URL(Request.url!, "http://localhost").pathname
	console.log("websocket access", Path)
	if (Path === "/bot") {
		await HandleBotConnection(Client)
	} else if (Path === "/viewer") {
		await HandleViewerConnection(Client, Request)
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
