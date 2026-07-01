import { useState } from "react";
import type { RefObject } from "react";
import { UseViewerSocket } from "../AppContext";
import type { OverlayBot } from "@overlaybot/shared";
import { ParameterDisplay } from "./ParameterDisplay";
import styles from "../Style/ControlDisplay.module.css";

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
	
	
	return (<div className={styles.card}>
		<p>{name}</p>
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
		<input type="button" value="Activate" onClick={HandleActivate}/>
	</div>)
}
