import { RawData } from "ws"
import { timingSafeEqual } from "crypto"
import "dotenv/config"
import * as Shared from "@overlaybot/shared"
import * as Types from "./Types"

export function ComparePasswords(Provided: string, Against: string): boolean {
	const ProvidedBuffer = Buffer.from(Provided, "utf8")
	const AgainstBuffer = Buffer.from(Against, "utf8")
	const IsEqualLength = ProvidedBuffer.length === AgainstBuffer.length
	const CompareBuffer = IsEqualLength ? ProvidedBuffer : AgainstBuffer
	const IsEqual = timingSafeEqual(CompareBuffer, AgainstBuffer)
	return IsEqualLength && IsEqual
}

export function Disconnect(Client: Types.WS_BotClient) {
	Client.Socket.terminate()
}

export function SendToBot(Client: Types.WS_BotClient, Message: Shared.Message.ServerToBot.Root) {
	Client.Socket.send(JSON.stringify(Message))
}

export function HandleAuthorization(State: Types.AppState, Client: Types.WS_BotClient, Message: Shared.Message.BotToServer.Authorization, DesiredPassword: string) {
	if (ComparePasswords(Message.Token, DesiredPassword)) {
		if (State.CurrentBot) {
			console.log("Disconnecting old bot")
			Disconnect(State.CurrentBot)
		}
		State.CurrentBot = Client
		SendToBot(State.CurrentBot, {
			Type: "Introspect"
		})
		
	} else {
		Disconnect(Client)
	}
}

export function HandleNotAuthorized(Client: Types.WS_BotClient) {
	SendToBot(Client, {
		Type: "NotAuthorized"
	})
	Disconnect(Client)
}

export function SendToViewer(Client: Types.WS_ViewerClient, Message: Shared.Message.ServerToViewer.Root) {
	Client.Socket.send(JSON.stringify(Message))
}

export function ForwardToViewer(Client: Types.WS_ViewerClient, Message: Shared.Message.BotToServer.MailToViewer) {
	SendToViewer(Client, Message.Enclosed)
}

export function HandleIntrospection(State: Types.AppState, Message: Shared.Message.BotToServer.Introspection, ViewerClients: Types.ViewerClientsMap) {
	State.CurrentControls = Message.Controls
	ViewerClients.forEach((Client) => {
		SendToViewer(Client, Message)
	})
}

export function HandleMail(Message: Shared.Message.BotToServer.MailToViewer, ViewerClientsByID: Types.ViewerClientsByID_Map) {
	const TargetClient = ViewerClientsByID.get(Message.ConnectionID)
	if (TargetClient) {
		ForwardToViewer(TargetClient, Message)
	}
}

export function HandleMessage(State: Types.AppState, Client: Types.WS_BotClient, Data: RawData, DesiredPassword: string, ViewerClients: Types.ViewerClientsMap, ViewerClientsByID: Types.ViewerClientsByID_Map) {
	let Message
	try {
		Message = JSON.parse(Data.toString())
	} catch (Exception) {
		console.error("Malformed message received from bot", Exception)
		return
	}
	const Result = Shared.Message.BotToServer.RootSchema.safeParse(Message)
	if (!Result.success) {
		console.error("Malformed message received from bot", Result)
		return
	}
	Message = Result.data
	if (Message.Type === "Authorization") {
		HandleAuthorization(State, Client, Message, DesiredPassword)
	} else if (Client === State.CurrentBot) {
		if (Message.Type === "Introspection") {
			HandleIntrospection(State, Message, ViewerClients)
		} else if (Message.Type === "MailToViewer") {
			HandleMail(Message, ViewerClientsByID)
		}
	} else {
		HandleNotAuthorized(Client)
	}
}

export function HandleDisconnection(State: Types.AppState, Connection: Types.WebSocketLike, BotClients: Types.BotClientsMap, ViewerClients: Types.ViewerClientsMap) {
	console.log("Bot disconnected")
	const BotClient = BotClients.get(Connection)
	if (BotClient) {
		BotClients.delete(Connection)
	}
	if (BotClient != undefined && State.CurrentBot ===  BotClient) {
		State.CurrentControls = null
		State.CurrentBot = null
		ViewerClients.forEach((Client) => {
			SendToViewer(Client, {
				Type: "BotDisconnected"
			})
		})
	}
}

export function RegisterConnection(Connection: Types.WebSocketLike, BotClients: Types.BotClientsMap) {
	const Client = new Types.WS_BotClient(Connection)
	BotClients.set(Connection, Client)
	SendToBot(Client, {
		Type: "Challenge"
	})
	return Client
}

export async function HandleConnection(State: Types.AppState, Connection: Types.WebSocketLike, BotClients: Types.BotClientsMap, ViewerClients: Types.ViewerClientsMap, ViewerClientsByID: Types.ViewerClientsByID_Map) {
	console.debug("Bot connected")
	
	const Client = RegisterConnection(Connection, BotClients)
	
	Connection.on("message", (Data) => {
		HandleMessage(State, Client, Data, process.env.BOT_PASSWORD!, ViewerClients, ViewerClientsByID)
	})
	
	Connection.on("close", () => {
		HandleDisconnection(State, Connection, BotClients, ViewerClients)
	})
	
	Connection.on("pong", () => {
		BotClients.get(Connection)!.IsAlive = true;
	})
}

