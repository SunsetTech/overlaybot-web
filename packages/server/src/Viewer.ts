import http from "http"
import { parseCookie } from "cookie"
import {  WebSocket, RawData } from "ws"
import jwt from "jsonwebtoken"
import "dotenv/config"

import * as Shared from "@overlaybot/shared"
import * as Types from "./Types"
import * as Database from "./Database"
import { Pool } from "pg"

export async function HandleLogin(DatabasePool: Pool, Request: http.IncomingMessage, ViewerClientsByUser: Types.ViewerClientsByUserMap) {
	const Cookies = Request.headers.cookie
	if (!Cookies) {throw "no cookies"}
	const SessionToken = parseCookie(Cookies)?.session
	if (!SessionToken) {throw "no session token"}
	const Payload = jwt.verify(SessionToken, process.env.JWT_SECRET!, {algorithms:["HS256"]}) as {ID: string; Version: number}
	const StoredSessionVersion = await Database.GetTokenVersion(DatabasePool, Payload.ID)
	if (StoredSessionVersion !== Payload.Version) {throw "version mismatch"}
	let TwitchID = Payload.ID as string
	if (ViewerClientsByUser.has(TwitchID)) {
		const ActiveConnections = ViewerClientsByUser.get(TwitchID)!
		if (ActiveConnections.size >= 5) {throw "too many connections"}
	}
	return TwitchID
}

export function HandleMessage(State: Types.AppState, Client: Types.WS_ViewerClient, Data: RawData) {
	let Message
	try {
		Message = JSON.parse(Data.toString())
	} catch (Error) {
		 console.log("Malformed message received from viewer", Message, Error)
		return
	}
	const Result = Shared.Message.ViewerToBot.RootSchema.safeParse(Message)
	if (!Result.success) {
		console.log("Malformed message received from viewer", Message, Result)
		return
	}
	const Response = Result.data
	if (State.CurrentBot !== null) {
		const Viewer = Client
		const ServerRequest: Shared.Message.ServerToBot.MailFromViewer = {
			Type: "MailFromViewer",
			TwitchID: Viewer.TwitchID,
			ConnectionID: Viewer.ConnectionID,
			Enclosed: Response
		}
		State.CurrentBot.Socket.send(JSON.stringify(ServerRequest))
	}
}

export function HandleDisconnect(Client: Types.WS_ViewerClient, ViewerClients: Types.ViewerClientsMap, ViewerClientsByUser: Types.ViewerClientsByUserMap, ViewerClientsByID: Types.ViewerClientsByID_Map) {
	console.log("Viewer disconnected")
	ViewerClients.delete(Client.Socket)
	ViewerClientsByID.delete(Client.ConnectionID)
	ViewerClientsByUser.get(Client.TwitchID)!.delete(Client.ConnectionID)
	if (ViewerClientsByUser.get(Client.TwitchID)!.size == 0) {
		ViewerClientsByUser.delete(Client.TwitchID)
	}
}

export function RegisterConnection(State: Types.AppState, Connection: Types.WebSocketLike, TwitchID: string, ViewerClients: Types.ViewerClientsMap, ViewerClientsByUser: Types.ViewerClientsByUserMap, ViewerClientsByID: Types.ViewerClientsByID_Map) {
	const Client = new Types.WS_ViewerClient(Connection, TwitchID)
	
	ViewerClients.set(Connection, Client)
	if (!ViewerClientsByUser.has(TwitchID)) {
		ViewerClientsByUser.set(TwitchID, new Map())
	}
	ViewerClientsByUser.get(TwitchID)!.set(Client.ConnectionID, Client)
	ViewerClientsByID.set(Client.ConnectionID, Client)
	
	if (State.CurrentControls) {
		const IntrospectionMessage: Shared.Message.BotToServer.Introspection = {
			Type: "Introspection",
			Controls: State.CurrentControls
		}
		Connection.send(JSON.stringify(IntrospectionMessage))
	}
	
	return Client
}

export async function HandleConnection(DatabasePool: Pool, State: Types.AppState, Connection: WebSocket, Request: http.IncomingMessage, ViewerClients: Types.ViewerClientsMap, ViewerClientsByUser: Types.ViewerClientsByUserMap, ViewerClientsByID: Types.ViewerClientsByID_Map ) {
	console.log("Viewer connected")
	let TwitchID: string
	try {
		TwitchID = await HandleLogin(DatabasePool, Request, ViewerClientsByUser)
	} catch(Error) {
		console.log(Error)
		let BadLoginMessage: Shared.Message.ServerToViewer.BadLogin = {
			Type: "BadLogin",
			Error: "Login failed"
		}
		Connection.send(JSON.stringify(BadLoginMessage))
		Connection.terminate()
		return
	}
	
	const Client = RegisterConnection(State, Connection, TwitchID, ViewerClients, ViewerClientsByUser, ViewerClientsByID)
	
	Connection.on("message", (Data) => {
		HandleMessage(State, Client, Data)
	})
	
	Connection.on("close", () => {
		HandleDisconnect(Client, ViewerClients, ViewerClientsByUser, ViewerClientsByID)
	})
	
	Connection.on("pong", () => {
		ViewerClients.get(Connection)!.IsAlive = true;
	})
}
