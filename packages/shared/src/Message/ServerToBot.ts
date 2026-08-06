import type { Root as ViewerToBot } from "./ViewerToBot.js"

export interface Challenge {
	Type: "Challenge"
}

export interface Introspect {
	Type: "Introspect"
}

export interface NotAuthorized {
	Type: "NotAuthorized"
}

export interface MailFromViewer {
	Type: "MailFromViewer"
	ConnectionID: string
	TwitchID: string
	Enclosed: ViewerToBot
}

export type Root = Challenge | Introspect | NotAuthorized | MailFromViewer
