import { describe, it, expect, beforeEach } from "vitest"
import { WebSocket } from "ws"
import { AppState, WebSocketLike, WS_BotClient, WS_ViewerClient } from "../src/Types.js"
import { ServerBotNotAuthorizedResponse, ServerIntrospectRequest, BotIntrospectionResponse, BotBalanceResponse, BotCostResponse, BotActivatedResponse, BotRejectedResponse } from "@overlaybot/shared"
import * as Bot from "../src/Bot.js"

// NOTE: Coax typescript into letting us get away with not implementing .on(), attempts to use will result in error
interface MockWebSocket extends Pick<WebSocket, "on"> {}
class MockWebSocket implements WebSocketLike {
	Sent: string[] = []
Terminated = false
	send(Content: string) {
		this.Sent.push(Content)
	}
	terminate() {
		this.Terminated = true
	}
}

function ExpectBotTerminatedSideEffects(Connection: MockWebSocket, BotClients: Map<WebSocketLike, WS_BotClient>) {
	expect(Connection.Terminated).toBe(true)
	expect(BotClients.has(Connection)).toBe(false)
}

describe("ComparePasswords", () => {
	it("Accepts correct passwords", () => {
		expect(Bot.ComparePasswords("test", "test")).toBe(true)
	})
	it("Rejects incorrect passwords", () => {
		expect(Bot.ComparePasswords("fail", "test")).toBe(false)
	})
})

describe("Disconnect", () => {
	let TestSocket: MockWebSocket
	let BotClients: Map<WebSocketLike, WS_BotClient>

	beforeEach(() => {
		TestSocket = new MockWebSocket()
		BotClients = new Map()
		BotClients.set(TestSocket, new WS_BotClient(TestSocket))
		Bot.Disconnect(TestSocket, BotClients)
	})

	it("terminates connection and clears mapping", () => {
		ExpectBotTerminatedSideEffects(TestSocket, BotClients)
	})
})

describe("HandleAuthorization", () => {
	let State: AppState
	let OldConnection: MockWebSocket
	let Connection: MockWebSocket
	let OldClient: WS_BotClient
	let Client: WS_BotClient
	let BotClients: Map<WebSocketLike, WS_BotClient>

	beforeEach(() => {
		OldConnection = new MockWebSocket()
		OldClient = new WS_BotClient(OldConnection)
		State = new AppState(OldClient)
		Connection = new MockWebSocket()
		Client = new WS_BotClient(Connection)
		BotClients = new Map()
		BotClients.set(OldConnection, OldClient)
		BotClients.set(Connection, Client)
	})
	
	describe("with correct password", () => {
		beforeEach(() => {
			Bot.HandleAuthorization(
				State, Connection, {
					Type: "Authorization",
					Token: "TestPassword"
				}, "TestPassword", BotClients
			)
		})
		
		it("registers as current bot", () => {
			expect(State.CurrentBot).toBe(Client)
		})
		
		it("terminates old bot", () => {
			ExpectBotTerminatedSideEffects(OldConnection, BotClients)
		})
		
		it("sends introspection request", () => {
			expect(
				Connection.Sent.map(Content => JSON.parse(Content))
			).toContainEqual(
				{
					Type: "Introspect"
				} as ServerIntrospectRequest
			)
		})
	})

	describe("with incorrect password", () => {
		beforeEach(() => {
			Bot.HandleAuthorization(
				State, Connection, {
					Type: "Authorization",
					Token: "FailPassword"
				}, "TestPassword", BotClients
			)
		})
		
		it("terminates the connection", () => {
			ExpectBotTerminatedSideEffects(Connection, BotClients)
		})
	})
})

describe("HandleNotAuthorized", () => {
	let Connection: MockWebSocket
	let Client: WS_BotClient
	let BotClients: Map<WebSocketLike, WS_BotClient>
	
	beforeEach(() => {
		Connection = new MockWebSocket()
		Client = new WS_BotClient(Connection)
		BotClients = new Map()
		BotClients.set(Connection, Client)
		Bot.HandleNotAuthorized(Connection, BotClients)
	})
	
	it("sends NotAuthorized response", () => {
		const ExpectedResponse: ServerBotNotAuthorizedResponse = {
			Type: "NotAuthorized"
		}
		expect(
			Connection.Sent.map(Content => JSON.parse(Content))
		).toContainEqual(ExpectedResponse)
	})
	
	it("terminates connection", () => {
		ExpectBotTerminatedSideEffects(Connection, BotClients)
	})
})

describe("HandleIntrospection", () => {
	let BotConnection: MockWebSocket
	let BotClient: WS_BotClient
	let State: AppState
	const Response: BotIntrospectionResponse = {
		Type: "Introspection",
		Controls: {
			TestControl: {
				Parameters: {
					TestParameter: {
						Name: "string"
					}
				},
				Defaults: {
					TestParameter: "default"
				},
				Description: "Test control"
			}
		}
	}
	let Viewer1Connection: MockWebSocket
	let Viewer1Client: WS_ViewerClient
	let Viewer2Connection: MockWebSocket
	let Viewer2Client: WS_ViewerClient
	let ViewerClients: Bot.ViewerClientsMap
	beforeEach(() => {
		BotConnection = new MockWebSocket()
		BotClient = new WS_BotClient(BotConnection)
		State = new AppState(BotClient, Response.Controls)
		Viewer1Connection = new MockWebSocket()
		Viewer1Client = new WS_ViewerClient(Viewer1Connection, "1")
		Viewer2Connection = new MockWebSocket()
		Viewer2Client = new WS_ViewerClient(Viewer2Connection, "2")
		ViewerClients = new Map()
		ViewerClients.set(Viewer1Connection, Viewer1Client)
		ViewerClients.set(Viewer2Connection, Viewer2Client)
		
		Bot.HandleIntrospection(State, Response, ViewerClients)
	})
	
	it("rebroadcasts to all connected viewers", () => {
		expect(
			Viewer1Connection.Sent.map(Content => JSON.parse(Content))
		).toContainEqual(Response)
		expect(
			Viewer1Connection.Sent.map(Content => JSON.parse(Content))
		).toContainEqual(Response)
	})
})

describe("HandleMail", () => {
	let Viewer1Connection: MockWebSocket
	let Viewer1Client: WS_ViewerClient
	let Viewer2Connection: MockWebSocket
	let Viewer2Client: WS_ViewerClient
	let Responses: (BotBalanceResponse | BotCostResponse | BotActivatedResponse | BotRejectedResponse)[] 
	let ViewerClientsByID: Bot.ViewerClientsByID_Map
	
	beforeEach(() => {
		Viewer1Connection = new MockWebSocket()
		Viewer1Client = new WS_ViewerClient(Viewer1Connection, "1")
		Viewer2Connection = new MockWebSocket()
		Viewer2Client = new WS_ViewerClient(Viewer2Connection, "2")
		
		Responses = [
			{
				Type: "Balance",
				Balance: 10,
				ConnectionID: Viewer1Client.ConnectionID
			},
			{
				Type: "Cost",
				Cost: 10,
				Command: "TestCommand",
				ConnectionID: Viewer1Client.ConnectionID
			},
			{
				Type: "Activated",
				Balance: 10,
				RequestID: 0,
				ConnectionID: Viewer2Client.ConnectionID
			},
			{
				Type: "Rejected",
				Reason: "Not enough points",
				RequestID: 1,
				ConnectionID: Viewer2Client.ConnectionID
			}
		]
		
		ViewerClientsByID = new Map()
		ViewerClientsByID.set(Viewer1Client.ConnectionID, Viewer1Client)
		ViewerClientsByID.set(Viewer2Client.ConnectionID, Viewer2Client)
		
		Responses.forEach((Response) => {
			Bot.HandleMail(Response, ViewerClientsByID)
		})
	})
	
	it("routed correctly and stripped connection IDs", () => {
		Responses.forEach((Response) => {
			const { ConnectionID, ...ViewerMail } = Response
			const TargetViewerClient = ViewerClientsByID.get(ConnectionID)
			const TargetViewerConnection = TargetViewerClient?.Socket as MockWebSocket
			expect(
				TargetViewerConnection.Sent.map(Content => JSON.parse(Content))
			).toContainEqual(
				ViewerMail
			)
		})
	})
})
