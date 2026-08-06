import { z } from "zod"
import { IntrospectionSchema } from "./BotToServer.js"
import { RootSchema as BotToViewerSchema } from "./BotToViewer.js"

export const BadLoginSchema = z.object({
	Type: z.literal("BadLogin"),
	Error: z.unknown()
})
export type BadLogin = z.infer<typeof BadLoginSchema>

export const BotDisconnectedSchema = z.object({
	Type: z.literal("BotDisconnected")
})
export type BotDisconnected = z.infer<typeof BotDisconnectedSchema>

export const RootSchema = z.discriminatedUnion(
	"Type", [
		BadLoginSchema,
		BotDisconnectedSchema,
		IntrospectionSchema,
		BotToViewerSchema
	]
)
export type Root = z.infer<typeof RootSchema>
