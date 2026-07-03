import { z } from "zod"
import { BotIntrospectionResponseSchema, BotBalanceResponseSchema, BotCostResponseSchema, BotActivatedResponseSchema, BotRejectedResponseSchema } from "./BotResponses"

//Responses sent from server to client
export const ServerBadLoginResponseSchema = z.object({
	Type: z.literal("BadLogin"),
	Error: z.unknown()
})
export type ServerBadLoginResponse = z.infer<typeof ServerBadLoginResponseSchema>

export const ServerBotDisconnectedResponseSchema = z.object({
	Type: z.literal("BotDisconnected")
})
export type ServerBotDisconnectedResponse = z.infer<typeof ServerBotDisconnectedResponseSchema>

export const ServerIntrospectionResponseSchema = BotIntrospectionResponseSchema
export type ServerIntrospectionResponse = z.infer<typeof ServerIntrospectionResponseSchema>

export const ServerBalanceResponseSchema = BotBalanceResponseSchema.omit({
	ConnectionID: true
})
export type ServerBalanceResponse = z.infer<typeof ServerBalanceResponseSchema>

export const ServerCostResponseSchema = BotCostResponseSchema.omit({
	ConnectionID: true
})
export type ServerCostResponse = z.infer<typeof ServerCostResponseSchema>

export const ServerActivatedResponseSchema = BotActivatedResponseSchema.omit({
	ConnectionID: true
})
export type ServerActivatedResponse = z.infer<typeof ServerActivatedResponseSchema>

export const ServerRejectedResponseSchema = BotRejectedResponseSchema.omit({
	ConnectionID: true
})
export type ServerRejectedResponse = z.infer<typeof ServerRejectedResponseSchema>

export const ServerResponseSchema = z.discriminatedUnion(
	"Type",[
		ServerBadLoginResponseSchema,
		ServerBotDisconnectedResponseSchema,
		ServerIntrospectionResponseSchema,
		ServerBalanceResponseSchema,
		ServerCostResponseSchema,
		ServerActivatedResponseSchema,
		ServerRejectedResponseSchema
	]
)
export type ServerResponse = z.infer<typeof ServerResponseSchema>
