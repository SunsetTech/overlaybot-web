import * as Shared from "@overlaybot/shared"
import "dotenv/config"
import WebSocket from "ws"

export interface WebSocketLike extends Pick<WebSocket, "send" | "terminate" | "on" | "ping"> {}

// NOTE: Coax typescript into letting us get away with not implementing .on(), attempts to use will result in error
export interface MockWebSocket extends Pick<WebSocket, "on"> {}
export class MockWebSocket implements WebSocketLike {
	Sent: string[] = []
	Terminated = false
	Pinged = false
	send(Content: string) {
		this.Sent.push(Content)
	}
	terminate() {
		this.Terminated = true
	}
	ping() {
		this.Pinged = true
	}
}

export class WS_Client {
	IsAlive = true
	constructor(public Socket: WebSocketLike) {}
}

export class WS_BotClient extends WS_Client {}

export class WS_ViewerClient extends WS_Client {
	public ConnectionID: string
	constructor(Socket: WebSocketLike, public TwitchID: string) {
		super(Socket)
		this.ConnectionID = crypto.randomUUID()
	}
}

export type BotClientsMap = Map<WebSocketLike, WS_BotClient>
export type ViewerClientsMap = Map<WebSocketLike, WS_ViewerClient>
export type ViewerClientsByID_Map = Map<string, WS_ViewerClient>
export type ViewerClientsByUserMap = Map<string, Map<string, WS_ViewerClient>>

export class AppState {
	constructor(
		public CurrentBot: WS_BotClient | null = null,
		public CurrentControls: Shared.UI.Controls | null = null
	) {}
}
