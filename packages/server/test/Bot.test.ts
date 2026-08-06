import { describe, it, expect, beforeEach } from "vitest"

import * as Types from "../src/Types.js"
import * as Bot from "../src/Bot.js"
import * as Shared from "@overlaybot/shared"

function ExpectBotTerminatedSideEffects(Client: Types.WS_BotClient) {
	expect((Client.Socket as Types.MockWebSocket).Terminated).toBe(true)
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
	let BotConnection: Types.MockWebSocket
	let BotClient: Types.WS_BotClient

	beforeEach(() => {
		BotConnection = new Types.MockWebSocket()
		BotClient = new Types.WS_BotClient(BotConnection)
		Bot.Disconnect(BotClient)
	})

	it("closes connection", () => {
		ExpectBotTerminatedSideEffects(BotClient)
	})
})

describe("HandleAuthorization", () => {
	let State: Types.AppState
	let Connection: Types.MockWebSocket
	let Client: Types.WS_BotClient
	let BotClients: Types.BotClientsMap

	beforeEach(() => {
		State = new Types.AppState()
		Connection = new Types.MockWebSocket()
		Client = new Types.WS_BotClient(Connection)
		BotClients = new Map()
		BotClients.set(Connection, Client)
	})
	
	describe("with correct password", () => {
		describe("without old bot", () => {
			beforeEach(() => {
				Bot.HandleAuthorization(
					State, Client, {
						Type: "Authorization",
						Token: "TestPassword"
					}, "TestPassword"
				)
			})
			
			it("registers as current bot", () => {
				expect(State.CurrentBot).toBe(Client)
			})
			
			it("sends introspection request", () => {
				expect(
					Connection.Sent.map(Content => JSON.parse(Content))
				).toContainEqual(
					{
						Type: "Introspect"
					} as Shared.Message.ServerToBot.Introspect
				)
			})
		})
		
		describe("with old bot", () => {
			let OldConnection: Types.MockWebSocket
			let OldClient: Types.WS_BotClient

			beforeEach(() => {
				OldConnection = new Types.MockWebSocket()
				OldClient = new Types.WS_BotClient(OldConnection)
				BotClients.set(OldConnection, OldClient)
				
				State.CurrentBot = OldClient
				Bot.HandleAuthorization(
					State, Client, {
						Type: "Authorization",
						Token: "TestPassword"
					}, "TestPassword"
				)
			})
			
			it("disconnects old bot", () => {
				ExpectBotTerminatedSideEffects(OldClient)
			})
		})
	})

	describe("with incorrect password", () => {
		beforeEach(() => {
			Bot.HandleAuthorization(
				State, Client, {
					Type: "Authorization",
					Token: "FailPassword"
				}, "TestPassword"
			)
		})
		
		it("disconnects the connection", () => {
			ExpectBotTerminatedSideEffects(Client)
		})
	})
})

describe("HandleNotAuthorized", () => {
	let Connection: Types.MockWebSocket
	let Client: Types.WS_BotClient
	let BotClients: Types.BotClientsMap
	
	beforeEach(() => {
		Connection = new Types.MockWebSocket()
		Client = new Types.WS_BotClient(Connection)
		BotClients = new Map()
		BotClients.set(Connection, Client)
		Bot.HandleNotAuthorized(Client)
	})
	
	it("sends NotAuthorized response", () => {
		const ExpectedMessage: Shared.Message.ServerToBot.NotAuthorized = {
			Type: "NotAuthorized"
		}
		expect(
			Connection.Sent.map(Content => JSON.parse(Content))
		).toContainEqual(ExpectedMessage)
	})
	
	it("disconnects", () => {
		ExpectBotTerminatedSideEffects(Client)
	})
})

const TestControls: Shared.UI.Controls = {
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

const IntrospectionMessage: Shared.Message.BotToServer.Introspection = {
	Type: "Introspection",
	Controls: TestControls
}

function ExpectIntrospectionSideEffects(ViewerClients: Types.ViewerClientsMap) {
	ViewerClients.forEach((Client) => {
		const Connection = Client.Socket as Types.MockWebSocket
		expect(
			Connection.Sent.map(Content => JSON.parse(Content))
		).toContainEqual(IntrospectionMessage)
	})
}

describe("HandleIntrospection", () => {
	let BotConnection: Types.MockWebSocket
	let BotClient: Types.WS_BotClient
	let State: Types.AppState
	let Viewer1Connection: Types.MockWebSocket
	let Viewer1Client: Types.WS_ViewerClient
	let Viewer2Connection: Types.MockWebSocket
	let Viewer2Client: Types.WS_ViewerClient
	let ViewerClients: Types.ViewerClientsMap
	beforeEach(() => {
		BotConnection = new Types.MockWebSocket()
		BotClient = new Types.WS_BotClient(BotConnection)
		State = new Types.AppState(BotClient, TestControls)
		Viewer1Connection = new Types.MockWebSocket()
		Viewer1Client = new Types.WS_ViewerClient(Viewer1Connection, "1")
		Viewer2Connection = new Types.MockWebSocket()
		Viewer2Client = new Types.WS_ViewerClient(Viewer2Connection, "2")
		ViewerClients = new Map()
		ViewerClients.set(Viewer1Connection, Viewer1Client)
		ViewerClients.set(Viewer2Connection, Viewer2Client)
	})
	
	it("rebroadcasts to all connected viewers", () => {
		Bot.HandleIntrospection(State, IntrospectionMessage, ViewerClients)
		ExpectIntrospectionSideEffects(ViewerClients)
	})
})

describe("HandleMail", () => {
	let Viewer1Connection: Types.MockWebSocket
	let Viewer1Client: Types.WS_ViewerClient
	let Viewer2Connection: Types.MockWebSocket
	let Viewer2Client: Types.WS_ViewerClient
	let Messages: (Shared.Message.BotToServer.MailToViewer)[] 
	let ViewerClientsByID: Types.ViewerClientsByID_Map
	
	beforeEach(() => {
		Viewer1Connection = new Types.MockWebSocket()
		Viewer1Client = new Types.WS_ViewerClient(Viewer1Connection, "1")
		Viewer2Connection = new Types.MockWebSocket()
		Viewer2Client = new Types.WS_ViewerClient(Viewer2Connection, "2")
		
		Messages = [
			{
				Type: "MailToViewer",
				ConnectionID: Viewer1Client.ConnectionID,
				Enclosed: {
					Type: "Balance",
					Balance: 10
				}
			},
			{
				Type: "MailToViewer",
				ConnectionID: Viewer1Client.ConnectionID,
				Enclosed: {
					Type: "Cost",
					Cost: 10,
					Command: "TestCommand"
				}
			},
			{
				Type: "MailToViewer",
				ConnectionID: Viewer2Client.ConnectionID,
				Enclosed: {
					Type: "Activated",
					Balance: 10
				}
			},
			{
				Type: "MailToViewer",
				ConnectionID: Viewer2Client.ConnectionID,
				Enclosed: {
					Type: "Rejected",
					Reason: "Not enough points"
				}
			}
		]
		
		ViewerClientsByID = new Map()
		ViewerClientsByID.set(Viewer1Client.ConnectionID, Viewer1Client)
		ViewerClientsByID.set(Viewer2Client.ConnectionID, Viewer2Client)
		
		Messages.forEach((Message) => {
			Bot.HandleMail(Message, ViewerClientsByID)
		})
	})
	
	it("routed correctly", () => {
		Messages.forEach((Message) => {
			const Enclosed = Message.Enclosed
			const TargetViewerClient = ViewerClientsByID.get(Message.ConnectionID)
			const TargetViewerConnection = TargetViewerClient?.Socket as Types.MockWebSocket
			expect(
				TargetViewerConnection.Sent.map(Content => JSON.parse(Content))
			).toContainEqual(
				Enclosed
			)
		})
	})
})

describe("HandleMessage", () => {
	let CurrentBotConnection: Types.MockWebSocket
	let CurrentBotClient: Types.WS_BotClient
	let State: Types.AppState
	let BotClients: Types.BotClientsMap
	let Viewer1Connection: Types.MockWebSocket
	let Viewer1Client: Types.WS_ViewerClient
	let Viewer2Connection: Types.MockWebSocket
	let Viewer2Client: Types.WS_ViewerClient
	let ViewerClients: Types.ViewerClientsMap
	let ViewerClientsByID: Types.ViewerClientsByID_Map	
	beforeEach(() => {
		CurrentBotConnection = new Types.MockWebSocket()
		CurrentBotClient = new Types.WS_BotClient(CurrentBotConnection)
		State = new Types.AppState(CurrentBotClient, TestControls)
		BotClients = new Map()
		BotClients.set(CurrentBotConnection, CurrentBotClient)
		Viewer1Connection = new Types.MockWebSocket()
		Viewer1Client = new Types.WS_ViewerClient(Viewer1Connection, "1")
		Viewer2Connection = new Types.MockWebSocket()
		Viewer2Client = new Types.WS_ViewerClient(Viewer2Connection, "2")
		ViewerClients = new Map()
		ViewerClientsByID = new Map()
		ViewerClients.set(Viewer1Connection, Viewer1Client)
		ViewerClientsByID.set(Viewer1Client.ConnectionID, Viewer1Client)
		ViewerClients.set(Viewer2Connection, Viewer2Client)
		ViewerClientsByID.set(Viewer2Client.ConnectionID, Viewer2Client)
	})
	describe("BotServerAuthorizationMessage", () => {
		it("registers as current bot", () => {
			const Message: Shared.Message.BotToServer.Authorization = {
				Type: "Authorization",
				Token: "TestPassword"
			}
			Bot.HandleMessage(
				State, CurrentBotClient,
				Buffer.from(JSON.stringify(Message)),
				"TestPassword",
				 ViewerClients, ViewerClientsByID
			)
			expect(State.CurrentBot).toBe(CurrentBotClient)
		})
	})
	describe("BotServerIntrospectionMessage", () => {
		it("rebroadcasts to all connected viewers", () => {
			Bot.HandleMessage(
				State, CurrentBotClient,
				Buffer.from(JSON.stringify(IntrospectionMessage)),
				"TestPassword",
				ViewerClients, ViewerClientsByID
			)
			ExpectIntrospectionSideEffects(ViewerClients)
		})
	})
	describe("BotServerMailedMessage", () => {
		describe("routing", () => {
			const Messages: Shared.Message.BotToViewer.Root[] = [
				{
					Type: "Balance",
					Balance: 10
				},
				{
					Type: "Cost",
					Command: "TestCommand",
					Cost: 10
				},
				{
					Type: "Activated",
					Balance: 0
				},
				{
					Type: "Rejected",
					Reason: "Not enough points"
				}	
			]
			Messages.forEach((Enclosed) => {
				it(`routes ${Enclosed.Type} correctly`, () => {
					ViewerClients.forEach((Client) => {
						const Message: Shared.Message.BotToServer.MailToViewer = {
							Type: "MailToViewer",
							ConnectionID: Client.ConnectionID,
							Enclosed: Enclosed
						}
						Bot.HandleMessage(
							State, CurrentBotClient,
							Buffer.from(JSON.stringify(Message)),
							"TestPassword",
							ViewerClients, ViewerClientsByID
						)
						expect(
							(Client.Socket as Types.MockWebSocket).Sent.map(Content => JSON.parse(Content))
						).toContainEqual(
							Enclosed
						)
					})
				})
			})
		})
	})
})

describe("HandleDisconnection", () => {
	let CurrentBotConnection: Types.MockWebSocket
	let CurrentBotClient: Types.WS_BotClient
	let State: Types.AppState
	let UnauthedBotConnection: Types.MockWebSocket
	let UnauthedBotClient: Types.WS_BotClient
	let BotClients: Types.BotClientsMap
	let Viewer1Connection: Types.MockWebSocket
	let Viewer1Client: Types.WS_ViewerClient
	let Viewer2Connection: Types.MockWebSocket
	let Viewer2Client: Types.WS_ViewerClient
	let ViewerClients: Types.ViewerClientsMap
	
	beforeEach(() => {
		CurrentBotConnection = new Types.MockWebSocket()
		CurrentBotClient = new Types.WS_BotClient(CurrentBotConnection)
		State = new Types.AppState(CurrentBotClient, TestControls)
		UnauthedBotConnection = new Types.MockWebSocket()
		UnauthedBotClient = new Types.WS_BotClient(UnauthedBotConnection)
		BotClients = new Map()
		BotClients.set(CurrentBotConnection, CurrentBotClient)
		BotClients.set(UnauthedBotConnection, UnauthedBotClient)
		Viewer1Connection = new Types.MockWebSocket()
		Viewer1Client = new Types.WS_ViewerClient(Viewer1Connection, "1")
		Viewer2Connection = new Types.MockWebSocket()
		Viewer2Client = new Types.WS_ViewerClient(Viewer2Connection, "2")
		ViewerClients = new Map()
		ViewerClients.set(Viewer1Connection, Viewer1Client)
		ViewerClients.set(Viewer2Connection, Viewer2Client)
	})
	
	describe("current bot disconnects", () => {
		beforeEach(() => {
			Bot.HandleDisconnection(State, CurrentBotConnection, BotClients, ViewerClients)
		})
		it("removes bot client from connection map", () => {
			expect(BotClients).not.toContainEqual(CurrentBotClient)
		})
		it("nullifies State.CurrentBot and State.CurrentControls", () => {
			expect(State.CurrentBot).toBeNull()
			expect(State.CurrentControls).toBeNull()
		})
		it("notifies connected viewers", () => {
			const DisconnectMessage: Shared.Message.ServerToViewer.BotDisconnected = {
				Type: "BotDisconnected"
			}
			expect(
				Viewer1Connection.Sent.map(Content => JSON.parse(Content))
			).toContainEqual(DisconnectMessage)
			expect(
				Viewer2Connection.Sent.map(Content => JSON.parse(Content))
			).toContainEqual(DisconnectMessage)
		})
	})
	describe("unauthed bot disconnects", () => {
		beforeEach(() => {
			Bot.HandleDisconnection(State, UnauthedBotConnection, BotClients, ViewerClients)
		})
		it("removes bot client from connection map", () => {
			expect(BotClients).not.toContainEqual(UnauthedBotClient)
		})
		it("does not nullify State.CurrentBot or State.CurrentControls", () => {
			expect(State.CurrentBot).toBe(CurrentBotClient)
			expect(State.CurrentControls).toBe(TestControls)
		})
		it("does not notify viewers", () => {
			expect(Viewer1Connection.Sent).toHaveLength(0)
			expect(Viewer2Connection.Sent).toHaveLength(0)
		})
	})
})
