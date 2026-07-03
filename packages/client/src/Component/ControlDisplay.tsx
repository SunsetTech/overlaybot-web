import { useState, useEffect} from "react";
import type { RefObject } from "react";
import { UseViewerSocket } from "../AppContext";
import type { Control } from "@overlaybot/shared/src/UI";
import { ParameterDisplay } from "./ParameterDisplay";
import { Card, CardContent, CardHeader, CardDescription, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ControlDisplayProps = {
	name: string
	control: Control
	requestCounter: RefObject<number>
	cost: number
}

export function ControlDisplay({name, control, requestCounter, cost}: ControlDisplayProps) {
	const Connection = UseViewerSocket()
	const [Values, setValues] = useState<Record<string, string | number>>(control.Defaults)
	useEffect(() => {
		const CostRequest = {
			Type: "Cost",
			Command: name,
			Parameters: Values
		}
		Connection!.send(JSON.stringify(CostRequest))
	}, [Connection])
	const HandleChange = (ParameterName: string, Value: string | number) => {
		const NewValues = { ...Values, [ParameterName]: Value }
		setValues(NewValues)
		const CostRequest = {
			Type: "Cost",
			Command: name,
			Parameters: NewValues
		}
		Connection!.send(JSON.stringify(CostRequest))
	}
	
	const HandleActivate = () => {
		const ActivateMessage = {
			Type: "Activate",
			Command: name,
			Parameters: Values,
			RequestID: ++requestCounter.current
		}
		Connection!.send(JSON.stringify(ActivateMessage))
	}
	
	return (<Card className="min-w-[300px] [--card-spacing:--spacing(5)]">
		<CardHeader style={{textAlign:"center"}}>
			<CardTitle>{name}</CardTitle>
		</CardHeader>
		<CardDescription className="text-center">
			<p>Cost: {cost} SP</p>
			<p>{control.Description}</p>
		</CardDescription>
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
