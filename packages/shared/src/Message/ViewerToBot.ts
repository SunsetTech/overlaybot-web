import { z } from "zod"

export const ActivateSchema = z.object({
	Type: z.literal("Activate"),
	Command: z.string(),
	Parameters: z.record(z.string(), z.union([z.string(), z.number()]))
})
export type Activate = z.infer<typeof ActivateSchema>

export const BalanceSchema = z.object({
	Type: z.literal("Balance")
})
export type Balance = z.infer<typeof BalanceSchema>

export const CostSchema = z.object({
	Type: z.literal("Cost"),
	Command: z.string(),
	Parameters: z.record(z.string(), z.union([z.string(), z.number()]))
})
export type Cost = z.infer<typeof CostSchema>

export const RootSchema = z.discriminatedUnion(
	"Type", [
		ActivateSchema, 
		BalanceSchema,
		CostSchema
	]
)
export type Root = z.infer<typeof RootSchema>
