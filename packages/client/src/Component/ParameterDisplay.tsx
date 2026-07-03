import type { Type } from "@overlaybot/shared/src/UI";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input"; 

type ParameterDisplayProps = {
	name: string
	scope: string
	type: Type
	value: string | number
	onChange: (Value: string | number) => void
}

function CreateInput(Name: string, Type: Type, Value: string | number, onChange: (Value: string | number) => void) {
	switch(Type.Name) {
		case "string": 
			return (<Input 
				id={Name}
				type="text" 
				value={Value as string}
				onChange={(Element) => onChange(Element.target.value)}
			/>)
		case "integer": 
			return (<Input 
				id={Name}
				type="number" 
				min={Type.Parameters?.Minimum as number | undefined} 
				value={Value as number}
				onChange={(Element) => onChange(Number(Element.target.value))}
			/>)
	}
}

export function ParameterDisplay({name, scope, type, value, onChange}: ParameterDisplayProps) {
	const FullName = `${scope}-${name}`
	return (<Field>
		<FieldLabel htmlFor={FullName}>{name}</FieldLabel>
		{CreateInput(FullName, type, value, onChange)}
	</Field>)
}
