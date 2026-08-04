import http from "http"
import express from "express"
import { parseCookie } from "cookie"
import { WebSocketServer, WebSocket } from "ws"
import { Pool } from "pg"
import jwt from "jsonwebtoken"
import "dotenv/config"

import { Controls } from "@overlaybot/shared"
import { ServerRequest } from "@overlaybot/shared"
import { ServerBadLoginResponse, ServerIntrospectionResponse } from "@overlaybot/shared"
import { ViewerRequestSchema } from "@overlaybot/shared"
import * as Bot from "./Bot"
import { AppState } from "./Types"

const DB_ClientPool = new Pool({
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
		const QueryResult = await DB_ClientPool.query(
			`SELECT token_version FROM users WHERE twitch_id = $1`,
			[TwitchID]
		)
		
		const TokenVersion = QueryResult.rows[0]?.token_version ?? 0
		TokenVersionCache.set(TwitchID, TokenVersion)
		
		return TokenVersion
	}
}

async function IncrementTokenVersion(TwitchID: string) {
	await DB_ClientPool.query(
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
		ViewerConnections.forEach((Client) => {
			if (Client.TwitchID == TwitchID) {
				let BadLoginMessage: ServerBadLoginResponse = {
					Type: "BadLogin",
					Error: "Forcibly logged out"
				}
				Client.Socket.send(JSON.stringify(BadLoginMessage))
				Client.Socket.terminate()
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
	console.log("Auth endpoint hit")
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
				"Connection-ID": process.env.TWITCH_CLIENT_ID!,
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

class WS_Client {
	IsAlive = true
	constructor(public Socket: WebSocket) {}
}

class WS_BotClient extends WS_Client {}

class WS_ViewerClient extends WS_Client {
	public ConnectionID: string
	constructor(Socket: WebSocket, public TwitchID: string) {
		super(Socket)
		this.ConnectionID = crypto.randomUUID()
	}
}

const BotConnections = new Map<WebSocket, WS_BotClient>()
let CurrentBot: WS_BotClient | null = null
let CurrentControls: Controls | null = null
const ViewerConnections = new Map<WebSocket, WS_ViewerClient>()
const ViewerConnectionsByUser = new Map<string, Map<string, WS_ViewerClient>>()
const ViewerConnectionsByID = new Map<string, WS_ViewerClient>()
const State = new AppState(CurrentBot, CurrentControls)

async function HandleViewerConnection(Connection: WebSocket, Request: http.IncomingMessage) {
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
		if (ViewerConnectionsByUser.has(TwitchID)) {
			const ActiveConnections = ViewerConnectionsByUser.get(TwitchID)!
			if (ActiveConnections.size >= 5) {throw "too many connections"}
		}

		const Viewer = new WS_ViewerClient(Connection, TwitchID)
		ViewerConnections.set(Connection, Viewer)
		if (!ViewerConnectionsByUser.has(TwitchID)) {
			ViewerConnectionsByUser.set(TwitchID, new Map())
		}
		ViewerConnectionsByUser.get(TwitchID)!.set(Viewer.ConnectionID, Viewer)
		ViewerConnectionsByID.set(Viewer.ConnectionID, Viewer)
		
		if (State.CurrentControls) {
			const IntrospectionMessage: ServerIntrospectionResponse = {
				Type: "Introspection",
				Controls: State.CurrentControls
			}
			Connection.send(JSON.stringify(IntrospectionMessage))
		}
		
		Connection.on("message", (Data) => {
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
			if ((Response.Type == "Activate" || Response.Type == "Balance" || Response.Type == "Cost") && State.CurrentBot !== null) {
				const Viewer = ViewerConnections.get(Connection)!
				const ServerRequest = {
					...Response,
					TwitchID: Viewer.TwitchID,
					ConnectionID: Viewer.ConnectionID,
				} as ServerRequest
				State.CurrentBot.Socket.send(JSON.stringify(ServerRequest))
			}
		})
		
		Connection.on("close", () => {
			console.log("Viewer disconnected")
			ViewerConnections.delete(Connection)
			ViewerConnectionsByID.delete(Viewer.ConnectionID)
			ViewerConnectionsByUser.get(Viewer.TwitchID)!.delete(Viewer.ConnectionID)
			if (ViewerConnectionsByUser.get(Viewer.TwitchID)!.size == 0) {
				ViewerConnectionsByUser.delete(Viewer.TwitchID)
			}
		})
		
		Connection.on("pong", () => {
			ViewerConnections.get(Connection)!.IsAlive = true;
		})
	} catch(Error) {
		console.log(Error)
		let BadLoginMessage: ServerBadLoginResponse = {
			Type: "BadLogin",
			Error: "Login failed"
		}
		Connection.send(JSON.stringify(BadLoginMessage))
		Connection.terminate()
	}
}

WS_Server.on("connection", async (Connection, Request) => {
	const Path = new URL(Request.url!, "http://localhost").pathname
	if (Path === "/bot") {
		await Bot.HandleConnection(State, Connection, BotConnections, ViewerConnections, ViewerConnectionsByID)
	} else if (Path === "/viewer") {
		const Origin = Request.headers.origin
		if (Origin === undefined || Origin !== process.env.ALLOWED_ORIGIN) {
			console.log(`origin '${Origin}' not allowed, expected '${process.env.ALLOWED_ORIGIN}'`)
			Connection.terminate()
		} else {
			await HandleViewerConnection(Connection, Request)
		}
	} else {
		Connection.terminate()
	}
})

HTTP_Server.listen(3131, '0.0.0.0', () => {
	console.log("listening on port 3131")
})

function CheckLiveness(Connection: WS_Client) {
	if (Connection.IsAlive === false) {
		Connection.Socket.terminate()
		return
	}
	Connection.IsAlive = false
	Connection.Socket.ping()
}

setInterval(() => {
	BotConnections.forEach(CheckLiveness)
	ViewerConnections.forEach(CheckLiveness)
}, 30000)
