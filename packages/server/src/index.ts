import http from "http"
import express from "express"
import { parseCookie } from "cookie"
import { WebSocketServer } from "ws"
import { Pool } from "pg"
import jwt from "jsonwebtoken"
import "dotenv/config"

import * as Bot from "./Bot"
import * as Viewer from "./Viewer"
import * as Shared from "@overlaybot/shared"
import * as Types from "./Types"
import * as Database from "./Database"

const DB_ClientPool = new Pool({
	host: process.env.DB_HOST!,
	port: parseInt(process.env.DB_PORT!),
	user: process.env.DB_USER!,
	password: process.env.DB_PASSWORD!,
	database: process.env.DB_NAME!
})

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
		const StoredSessionVersion = await Database.GetTokenVersion(DB_ClientPool, Payload.ID)
		if (StoredSessionVersion !== Payload.Version) {throw "version mismatch"}
		let TwitchID = Payload.ID as string

		await Database.IncrementTokenVersion(DB_ClientPool, TwitchID)
		ViewerClients.forEach((Client) => {
			if (Client.TwitchID == TwitchID) {
				let BadLoginMessage: Shared.Message.ServerToViewer.BadLogin = {
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
				"Client-Id": process.env.TWITCH_CLIENT_ID!,
			}
		})
		const UserData = await UserResponse.json()
		console.log(UserData)
		const UserID = UserData.data[0].id as string
		const TokenVersion = await Database.GetTokenVersion(DB_ClientPool, UserID)
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

const BotClients: Types.BotClientsMap = new Map()
const ViewerClients: Types.ViewerClientsMap = new Map()
const ViewerClientsByUser: Types.ViewerClientsByUserMap = new Map()
const ViewerClientsByID: Types.ViewerClientsByID_Map = new Map()
const State = new Types.AppState()

WS_Server.on("connection", async (Connection, Request) => {
	const Path = new URL(Request.url!, "http://localhost").pathname
	if (Path === "/bot") {
		await Bot.HandleConnection(State, Connection, BotClients, ViewerClients, ViewerClientsByID)
	} else if (Path === "/viewer") {
		const Origin = Request.headers.origin
		if (Origin === undefined || Origin !== process.env.ALLOWED_ORIGIN) {
			console.log(`origin '${Origin}' not allowed, expected '${process.env.ALLOWED_ORIGIN}'`)
			Connection.terminate()
		} else {
			await Viewer.HandleConnection(DB_ClientPool, State, Connection, Request, ViewerClients, ViewerClientsByUser, ViewerClientsByID)
		}
	} else {
		Connection.terminate()
	}
})

HTTP_Server.listen(3131, '0.0.0.0', () => {
	console.log("listening on port 3131")
})

function CheckLiveness(Client: Types.WS_Client) {
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
