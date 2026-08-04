import { Controls } from "@overlaybot/shared"
import "dotenv/config"
import WebSocket from "ws"

export interface WebSocketLike extends Pick<WebSocket, "send" | "terminate" | "on"> {}

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

export class AppState {
	constructor(
		public CurrentBot: WS_BotClient | null = null,
		public CurrentControls: Controls | null = null
	) {}
}
