import type { ViewerBalanceRequest, ViewerCostRequest, ViewerActivateRequest } from "./ViewerRequests"

//Server Requests
export interface ServerChallengeRequest {
	Type: "Challenge"
}

export interface ServerIntrospectRequest {
	Type: "Introspect"
}

export interface ServerBalanceRequest extends ViewerBalanceRequest {
	ConnectionID: string
	TwitchID: string
}

export interface ServerCostRequest extends ViewerCostRequest {
	ConnectionID: string
	TwitchID: string
}

export interface ServerActivateRequest extends ViewerActivateRequest {
	ConnectionID: string
	TwitchID: string
}

export type ServerRequest = ServerChallengeRequest | ServerIntrospectRequest | ServerBalanceRequest | ServerCostRequest | ServerActivateRequest

