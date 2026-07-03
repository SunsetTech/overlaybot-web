import { z } from "zod"
import { ControlsSchema } from "./UI"

//Responses received from OverlayBot
export const BotAuthorizationResponseSchema = z.object({
	Type: z.literal("Authorization"),
	Token: z.string()
})
export type BotAuthorizationResponse = z.infer<typeof BotAuthorizationResponseSchema>

export const BotIntrospectionResponseSchema = z.object({
	Type: z.literal("Introspection"),
	Controls: ControlsSchema
})
export type BotIntrospectionResponse = z.infer<typeof BotIntrospectionResponseSchema>

export const BotBalanceResponseSchema = z.object({
	Type: z.literal("Balance"),
	Balance: z.number(),
	ConnectionID: z.string()
})
export type BotBalanceResponse = z.infer<typeof BotBalanceResponseSchema>

export const BotCostResponseSchema = z.object({
	Type: z.literal("Cost"),
	Cost: z.number(),
	Command: z.string(),
	ConnectionID: z.string()
})
export type BotCostResponse = z.infer<typeof BotCostResponseSchema>

export const BotActivatedResponseSchema = z.object({
	Type: z.literal("Activated"),
	ConnectionID: z.string(),
	RequestID: z.number(),
	Balance: z.number()
})
export type BotActivatedResponse = z.infer<typeof BotActivatedResponseSchema>

export const BotRejectedResponseSchema = z.object({
	Type: z.literal("Rejected"),
	Reason: z.string(),
	ConnectionID: z.string(),
	RequestID: z.number()
})
export type BotRejectedResponse = z.infer<typeof BotRejectedResponseSchema>

export const BotResponseSchema = z.discriminatedUnion(
	"Type",[
		BotAuthorizationResponseSchema,
		BotIntrospectionResponseSchema,
		BotBalanceResponseSchema,
		BotCostResponseSchema,
		BotActivatedResponseSchema,
		BotRejectedResponseSchema
	]
)
export type BotResponse = z.infer<typeof BotResponseSchema>

