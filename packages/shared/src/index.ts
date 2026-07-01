export namespace OverlayBot {
	export type ParameterValue = string | number | boolean | Type

	export type Type = {
		Name: "string" | "integer"
		Parameters?: Record<string | number, ParameterValue>
	}
	
	export type Control = {
		Parameters: Record<string, Type>
		Defaults: Record<string, string | number>
	}
	
	export type Controls = Record<string, Control>
}
