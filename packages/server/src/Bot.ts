import { RawData } from "ws"
import { timingSafeEqual } from "crypto"
import "dotenv/config"
import { WebSocketLike, WS_BotClient, WS_ViewerClient, AppState } from "./Types"
import { ServerChallengeRequest } from "@overlaybot/shared"
import { BotResponseSchema, BotAuthorizationResponse } from "@overlaybot/shared"
import { ServerBotDisconnectedResponse, ServerBotNotAuthorizedResponse, BotResponse, BotIntrospectionResponse } from "@overlaybot/shared"

export type BotClientsMap = Map<WebSocketLike, WS_BotClient>
export type ViewerClientsMap = Map<WebSocketLike, WS_ViewerClient>
export type ViewerClientsByID_Map = Map<string, WS_ViewerClient>

export function ComparePasswords(Provided: string, Against: string): boolean {
	const ProvidedBuffer = Buffer.from(Provided, "utf8")
	const AgainstBuffer = Buffer.from(Against, "utf8")
	const IsEqualLength = ProvidedBuffer.length === AgainstBuffer.length
	const CompareBuffer = IsEqualLength ? ProvidedBuffer : AgainstBuffer
	const IsEqual = timingSafeEqual(CompareBuffer, AgainstBuffer)
	return IsEqualLength && IsEqual
}

export function Disconnect(Connection: WebSocketLike) {
	Connection.terminate()
}

export function HandleAuthorization(State: AppState, Connection: WebSocketLike, Response: BotAuthorizationResponse, DesiredPassword: string, BotClients: BotClientsMap) {
	if (ComparePasswords(Response.Token, DesiredPassword)) {
		console.log("Bot authorized")
		if (State.CurrentBot) {
			Disconnect(State.CurrentBot.Socket)
		}
		State.CurrentBot = BotClients.get(Connection)!
		const Response = {
			Type: "Introspect",
		}
		Connection.send(JSON.stringify(Response))
	} else {
		Disconnect(Connection)
	}
}

export function HandleNotAuthorized(Connection: WebSocketLike) {
	const Response: ServerBotNotAuthorizedResponse = {
		Type: "NotAuthorized"
	}
	Connection.send(JSON.stringify(Response))
	Disconnect(Connection)
}

export function HandleIntrospection(State: AppState, Response: BotIntrospectionResponse, ViewerClients: ViewerClientsMap) {
	State.CurrentControls = Response.Controls
	ViewerClients.forEach((Client) => {
		Client.Socket.send(JSON.stringify(Response))
	})
}

export function HandleMail(Response: BotResponse, ViewerClientsByID: ViewerClientsByID_Map) {
	if (Response.Type == "Rejected" || Response.Type == "Activated" || Response.Type == "Balance" || Response.Type == "Cost") {
		const { ConnectionID, ...ServerResponse } = Response
		const TargetClient = ViewerClientsByID.get(ConnectionID)!
		TargetClient.Socket.send(JSON.stringify(ServerResponse))
	}
}

export function HandleMessage(State: AppState, Connection: WebSocketLike, Data: RawData, BotClients: BotClientsMap, ViewerClients: ViewerClientsMap, ViewerClientsByID: ViewerClientsByID_Map) {
	let Message
	try {
		Message = JSON.parse(Data.toString())
	} catch (Exception) {
		console.log("Malformed message received from bot")
		return
	}
	const Result = BotResponseSchema.safeParse(Message)
	if (!Result.success) {
		console.log("Malformed message received from bot", Message)
		return
	}
	const Response = Result.data
	if (Response.Type === "Authorization") {
		HandleAuthorization(State, Connection, Response, process.env.BOT_PASSWORD!, BotClients)
	} else if (BotClients.get(Connection) === State.CurrentBot) {
		if (Response.Type === "Introspection") {
			HandleIntrospection(State, Response, ViewerClients)
		} else {
			HandleMail(Response, ViewerClientsByID)
		}
	} else {
		HandleNotAuthorized(Connection)
	}
}

export function HandleDisconnection(State: AppState, Connection: WebSocketLike, BotClients: BotClientsMap, ViewerClients: ViewerClientsMap) {
	const BotClient = BotClients.get(Connection)
	if (BotClient) {
		BotClients.delete(Connection)
	}
	if (BotClient != undefined && State.CurrentBot ===  BotClient) {
		console.log("Current bot disconnected")
		State.CurrentControls = null
		State.CurrentBot = null
		ViewerClients.forEach((Client) => {
			const BotDisconnectedMessage: ServerBotDisconnectedResponse = {
				Type: "BotDisconnected"
			}
			Client.Socket.send(JSON.stringify(BotDisconnectedMessage))
		})
	}
}

export async function HandleConnection(State: AppState, Connection: WebSocketLike, BotClients: BotClientsMap, ViewerClients: ViewerClientsMap, ViewerClientsByID: ViewerClientsByID_Map) {
	console.log("Bot connected")
	BotClients.set(Connection, new WS_BotClient(Connection))
	const ChallengeMessage: ServerChallengeRequest = {
		Type: "Challenge",
	}
	Connection.send(JSON.stringify(ChallengeMessage))

	Connection.on("message", (Data) => {
		HandleMessage(State, Connection, Data, BotClients, ViewerClients, ViewerClientsByID)
	})
	
	Connection.on("close", () => {
		HandleDisconnection(State, Connection, BotClients, ViewerClients)
	})
	
	Connection.on("pong", () => {
		BotClients.get(Connection)!.IsAlive = true;
	})
}

