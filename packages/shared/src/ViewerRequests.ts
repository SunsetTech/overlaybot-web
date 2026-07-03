import { z } from "zod"

//Viewer Requests
export const ViewerActivateRequestSchema = z.object({
	Type: z.literal("Activate"),
	Command: z.string(),
	Parameters: z.record(z.string(), z.union([z.string(), z.number()])),
	RequestID: z.number()
})
export type ViewerActivateRequest = z.infer<typeof ViewerActivateRequestSchema>

export const ViewerBalanceRequestSchema = z.object({
	Type: z.literal("Balance")
})
export type ViewerBalanceRequest = z.infer<typeof ViewerBalanceRequestSchema>

export const ViewerCostRequestSchema = z.object({
	Type: z.literal("Cost"),
	Command: z.string(),
	Parameters: z.record(z.string(), z.union([z.string(), z.number()]))
})
export type ViewerCostRequest = z.infer<typeof ViewerCostRequestSchema>

export const ViewerRequestSchema = z.discriminatedUnion(
	"Type",[
		ViewerActivateRequestSchema, 
		ViewerBalanceRequestSchema,
		ViewerCostRequestSchema
	]
)
export type ViewerRequest = z.infer<typeof ViewerRequestSchema>
