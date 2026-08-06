import { z } from "zod"
import { RootSchema as BotToViewerSchema } from "./BotToViewer.js"
import { ControlsSchema } from "../UI.js"

export const AuthorizationSchema = z.object({
	Type: z.literal("Authorization"),
	Token: z.string()
})
export type Authorization = z.infer<typeof AuthorizationSchema>

export const IntrospectionSchema = z.object({
	Type: z.literal("Introspection"),
	Controls: ControlsSchema
})
export type Introspection = z.infer<typeof IntrospectionSchema>

export const MailToViewerSchema = z.object({
	Type: z.literal("MailToViewer"),
	ConnectionID: z.string(),
	Enclosed: BotToViewerSchema
})
export type MailToViewer = z.infer<typeof MailToViewerSchema>

export const RootSchema = z.discriminatedUnion(
	"Type",[
		AuthorizationSchema,
		IntrospectionSchema,
		MailToViewerSchema
	]
)
export type Root = z.infer<typeof RootSchema>

