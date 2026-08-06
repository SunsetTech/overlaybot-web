import { describe, it, expect, beforeEach } from "vitest"

import * as Types from "../src/Types.js"
import * as Viewer from "../src/Viewer.js"
import * as Shared from "@overlaybot/shared"

describe("HandleMessage", () => {
	let CurrentBotConnection: Types.MockWebSocket
	let CurrentBotClient: Types.WS_BotClient
	let State: Types.AppState
	let ViewerConnection: Types.MockWebSocket
	let ViewerClient: Types.WS_ViewerClient
	
	beforeEach(() => {
		CurrentBotConnection = new Types.MockWebSocket()
		CurrentBotClient = new Types.WS_BotClient(CurrentBotConnection)
		State = new Types.AppState(CurrentBotClient)
		ViewerConnection = new Types.MockWebSocket()
		ViewerClient = new Types.WS_ViewerClient(ViewerConnection, "1")
	})
	
	it("forwards to current bot", () => {
		const Message: Shared.Message.ViewerToBot.Balance = {
			Type: "Balance"
		}
		const Expected: Shared.Message.ServerToBot.MailFromViewer = {
			Type: "MailFromViewer",
			TwitchID: ViewerClient.TwitchID,
			ConnectionID: ViewerClient.ConnectionID,
			Enclosed: Message
		}
		Viewer.HandleMessage(State, ViewerClient, Buffer.from(JSON.stringify(Message), "utf8"))
		expect(
			CurrentBotConnection.Sent.map(Content => JSON.parse(Content))
		).toContainEqual(Expected)
	})
})
