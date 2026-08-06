import { z } from "zod"

export const BalanceSchema = z.object({
	Type: z.literal("Balance"),
	Balance: z.number(),
})
export type Balance = z.infer<typeof BalanceSchema>

export const CostSchema = z.object({
	Type: z.literal("Cost"),
	Cost: z.number(),
	Command: z.string(),
})
export type Cost = z.infer<typeof CostSchema>

export const ActivatedSchema = z.object({
	Type: z.literal("Activated"),
	Balance: z.number()
})
export type Activated = z.infer<typeof ActivatedSchema>

export const RejectedSchema = z.object({
	Type: z.literal("Rejected"),
	Reason: z.string(),
})
export type Rejected = z.infer<typeof RejectedSchema>

export const RootSchema = z.discriminatedUnion(
	"Type",[
		BalanceSchema,
		CostSchema,
		ActivatedSchema,
		RejectedSchema
	]
)
export type Root = z.infer<typeof RootSchema>

