import type { OverlayBot } from "@overlaybot/shared";

type ParameterDisplayProps = {
	name: string
	scope: string
	type: OverlayBot.Type
	value: string | number
	onChange: (Value: string | number) => void
}

function CreateInput(Name: string, Type: OverlayBot.Type, Value: string | number, onChange: (Value: string | number) => void) {
	switch(Type.Name) {
		case "string": 
			return (<input 
				id={Name}
				type="text" 
				value={Value as string}
				onChange={(Element) => onChange(Element.target.value)}
			/>)
		case "integer": 
			return (<input 
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
	return (<div>
		<label htmlFor={FullName}>{name}</label>
		{CreateInput(FullName, type, value, onChange)}
	</div>)
}
