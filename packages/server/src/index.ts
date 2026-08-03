import http from "http"
import express from "express"
import { parseCookie } from "cookie"
import { WebSocketServer, WebSocket } from "ws"
import { Pool } from "pg"
import jwt from "jsonwebtoken"
import { timingSafeEqual } from "crypto"
import "dotenv/config"

import { Controls } from "@overlaybot/shared"
import { ServerRequest, ServerChallengeRequest } from "@overlaybot/shared"
import { BotResponseSchema } from "@overlaybot/shared"
import { ServerBadLoginResponse, ServerBotDisconnectedResponse, ServerIntrospectionResponse, ServerBotNotAuthorizedResponse } from "@overlaybot/shared"
import { ViewerRequestSchema } from "@overlaybot/shared"

const DB_ConnectionPool = new Pool({
	host: process.env.DB_HOST!,
	port: parseInt(process.env.DB_PORT!),
	user: process.env.DB_USER!,
	password: process.env.DB_PASSWORD!,
	database: process.env.DB_NAME!
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
		const Payload = jwt.verify(SessionToken, process.env.JWT_SECRET!, {algorithms:["HS256"]}) as {ID: string; Version: number}
		const StoredSessionVersion = await GetTokenVersion(Payload.ID)
		if (StoredSessionVersion !== Payload.Version) {throw "version mismatch"}
		let TwitchID = Payload.ID as string

		await IncrementTokenVersion(TwitchID)
		ViewerClients.forEach((Connection) => {
			if (Connection.TwitchID == TwitchID) {
				let BadLoginMessage: ServerBadLoginResponse = {
					Type: "BadLogin",
					Error: "Forcibly logged out"
				}
				Connection.Socket.send(JSON.stringify(BadLoginMessage))
				Connection.Socket.terminate()
			}
		})
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
	try {
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
			"Set-Cookie": `session=${SessionToken}; HttpOnly; Path=/; Max-Age=604800; Secure; SameSite=Lax`
		})
		Response.end()
	} catch (Error) {
		console.log(Error)
		Response.writeHead(302, {
			location: `/login`,
		})
		Response.end()
	}
})

const HTTP_Server = http.createServer(App)

const WS_Server = new WebSocketServer({ server: HTTP_Server })

class WS_Connection {
	IsAlive = true
	constructor(public Socket: WebSocket) {}
}

class WS_BotConnection extends WS_Connection {
}

class WS_ViewerConnection extends WS_Connection {
	public ConnectionID: string
	constructor(Socket: WebSocket, public TwitchID: string) {
		super(Socket)
		this.ConnectionID = crypto.randomUUID()
	}
}

let CurrentBot: WS_BotConnection | null = null
let CurrentControls: Controls | null = null
const BotClients = new Map<WebSocket, WS_BotConnection>()
const ViewerClients = new Map<WebSocket, WS_ViewerConnection>()
const ViewerClientsByUser = new Map<string, Map<string, WS_ViewerConnection>>()
const ViewerClientsByID = new Map<string, WS_ViewerConnection>()

function ComparePasswords(Provided: string, Against: string): boolean {
	const ProvidedBuffer = Buffer.from(Provided, "utf8")
	const AgainstBuffer = Buffer.from(Against, "utf8")
	const IsEqualLength = ProvidedBuffer.length === AgainstBuffer.length
	const CompareBuffer = IsEqualLength ? ProvidedBuffer : AgainstBuffer
	const IsEqual = timingSafeEqual(CompareBuffer, AgainstBuffer)
	return IsEqualLength && IsEqual
}

async function HandleBotConnection(Client: WebSocket) {
	console.log("Bot connected")
	BotClients.set(Client, new WS_BotConnection(Client))
	const ChallengeMessage: ServerChallengeRequest = {
		Type: "Challenge",
	}
	Client.send(JSON.stringify(ChallengeMessage))

	Client.on("message", (Data) => {
		let Message
		try {
			Message = JSON.parse(Data.toString())
		} catch (Exception) {
			console.log("Malformed message received from bot")
			return
		}
		const Result = BotResponseSchema.safeParse(Message)
		if (!Result.success) {
			console.log("Malformed message received from bot")
			return
		}
		const Response = Result.data
		if (Response.Type === "Authorization") {
			if (ComparePasswords(Response.Token, process.env.BOT_PASSWORD!)) {
				console.log("Bot authorized")
				CurrentBot = BotClients.get(Client)!
				const Response = {
					Type: "Introspect",
				}
				Client.send(JSON.stringify(Response))
			}
		} else if (BotClients.get(Client) === CurrentBot) {
			if (Response.Type == "Introspection") {
				CurrentControls = Response.Controls
				ViewerClients.forEach((Connection) => {
					const ControlsResponse = {
						Type: "Introspection",
						Controls: CurrentControls
					}
					Connection.Socket.send(JSON.stringify(ControlsResponse))
				})
			} else if (Response.Type == "Rejected" || Response.Type == "Activated" || Response.Type == "Balance" || Response.Type == "Cost") {
				const TargetConnection = ViewerClientsByID.get(Response.ConnectionID)!
				const { ConnectionID, ...ServerResponse } = Response
				TargetConnection.Socket.send(JSON.stringify(ServerResponse))
			} 
		} else {
			const Response: ServerBotNotAuthorizedResponse = {
				Type: "NotAuthorized"
			}
			Client.send(JSON.stringify(Response))
			Client.terminate()
		}
	})
	
	Client.on("close", () => {
		console.log("Bot disconnected")
		CurrentControls = null
		CurrentBot = null
		BotClients.delete(Client)
		ViewerClients.forEach((Connection) => {
			const BotDisconnectedMessage: ServerBotDisconnectedResponse = {
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
		const Payload = jwt.verify(SessionToken, process.env.JWT_SECRET!, {algorithms:["HS256"]}) as {ID: string; Version: number}
		const StoredSessionVersion = await GetTokenVersion(Payload.ID)
		if (StoredSessionVersion !== Payload.Version) {throw "version mismatch"}
		let TwitchID = Payload.ID as string
		if (ViewerClientsByUser.has(TwitchID)) {
			const ActiveClients = ViewerClientsByUser.get(TwitchID)!
			if (ActiveClients.size >= 5) {throw "too many connections"}
		}

		const Viewer = new WS_ViewerConnection(Client, TwitchID)
		ViewerClients.set(Client, Viewer)
		if (!ViewerClientsByUser.has(TwitchID)) {
			ViewerClientsByUser.set(TwitchID, new Map())
		}
		ViewerClientsByUser.get(TwitchID)!.set(Viewer.ConnectionID, Viewer)
		ViewerClientsByID.set(Viewer.ConnectionID, Viewer)
		
		if (CurrentControls) {
			const IntrospectionMessage: ServerIntrospectionResponse = {
				Type: "Introspection",
				Controls: CurrentControls
			}
			Client.send(JSON.stringify(IntrospectionMessage))
		}
		
		Client.on("message", (Data) => {
			let Message
			try {
				Message = JSON.parse(Data.toString())
			} catch (_) {
				 console.log("Malformed message received from viewer")
				return
			}
			const Result = ViewerRequestSchema.safeParse(Message)
			if (!Result.success) {
				console.log("Malformed message received from viewer")
				return
			}
			const Response = Result.data
			if ((Response.Type == "Activate" || Response.Type == "Balance" || Response.Type == "Cost") && CurrentBot !== null) {
				const Viewer = ViewerClients.get(Client)!
				const ServerRequest = {
					...Response,
					TwitchID: Viewer.TwitchID,
					ConnectionID: Viewer.ConnectionID,
				} as ServerRequest
				CurrentBot.Socket.send(JSON.stringify(ServerRequest))
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
		let BadLoginMessage: ServerBadLoginResponse = {
			Type: "BadLogin",
			Error: "Login failed"
		}
		Client.send(JSON.stringify(BadLoginMessage))
		Client.terminate()
	}
}

WS_Server.on("connection", async (Client, Request) => {
	const Path = new URL(Request.url!, "http://localhost").pathname
	if (Path === "/bot") {
		await HandleBotConnection(Client)
	} else if (Path === "/viewer") {
		const Origin = Request.headers.origin
		if (Origin === undefined || Origin !== process.env.ALLOWED_ORIGIN) {
			console.log(`origin '${Origin}' not allowed, expected '${process.env.ALLOWED_ORIGIN}'`)
			Client.terminate()
		} else {
			await HandleViewerConnection(Client, Request)
		}
	} else {
		Client.terminate()
	}
})

HTTP_Server.listen(3131, '0.0.0.0', () => {
	console.log("listening on port 3131")
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
