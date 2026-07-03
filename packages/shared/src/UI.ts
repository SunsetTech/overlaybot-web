import { z } from "zod"

export type ParameterValue = string | number | boolean | Type
export const ParameterValueSchema: z.ZodType<ParameterValue> = z.lazy(() => z.union([z.string(), z.number(), z.boolean(), TypeSchema]))

export type Type = {
	Name: "string" | "integer"
	Parameters?: Record<string | number, ParameterValue>
}
export const TypeSchema: z.ZodType<Type> = z.lazy(
	() => z.object({
		Name: z.enum(["string", "integer"]),
		Parameters: z.record(z.string(), ParameterValueSchema).optional()
	})
)

export const ControlSchema = z.object({
	Parameters: z.record(z.string(), TypeSchema),
	Defaults: z.record(z.string(), z.union([z.string(), z.number()])),
	Description: z.string()
})
export type Control = z.infer<typeof ControlSchema>

export const ControlsSchema = z.record(z.string(), ControlSchema)
export type Controls = z.infer<typeof ControlsSchema>
