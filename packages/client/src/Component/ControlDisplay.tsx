import { useState } from "react";
import type { RefObject } from "react";
import { UseViewerSocket } from "../AppContext";
import type { OverlayBot } from "@overlaybot/shared";
import { ParameterDisplay } from "./ParameterDisplay";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ControlDisplayProps = {
	name: string
	control: OverlayBot.Control
	requestCounter: RefObject<number>
}

export function ControlDisplay({name, control, requestCounter}: ControlDisplayProps) {
	const Connection = UseViewerSocket()
	const [Values, SetValues] = useState<Record<string, string | number>>(control.Defaults)
	
	
	const HandleChange = (ParameterName: string, Value: string | number) => {
		SetValues(Previous => ({ ...Previous, [ParameterName]: Value}))
	}
	
	const HandleActivate = () => {
		if (Connection?.readyState === WebSocket.OPEN) {
			const ActivateMessage = {
				Type: "Activate",
				Command: name,
				Parameters: Values,
				RequestID: ++requestCounter.current
			}
			Connection.send(JSON.stringify(ActivateMessage))
		}
	}
	
	
	return (<Card className="min-w-[300px] [--card-spacing:--spacing(5)]">
		<CardHeader style={{textAlign:"center"}}>
			<CardTitle>{name}</CardTitle>
		</CardHeader>
		<CardContent>
			{Object.entries(control.Parameters).map(([ParameterName, ParameterType]) => {
				return (<ParameterDisplay 
					key={ParameterName}
					scope={name}
					name={ParameterName} 
					type={ParameterType}
					value={Values[ParameterName]}
					onChange={(Value: string | number) => HandleChange(ParameterName, Value)}
				/>)
			})}
		</CardContent>
		<CardFooter className="flex-col gap-2">
			<Button onClick={HandleActivate} className="w-full">Activate</Button>
		</CardFooter>
	</Card>)
}
