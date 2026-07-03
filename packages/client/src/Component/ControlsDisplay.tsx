import { useRef } from "react";
import type { Controls } from "@overlaybot/shared/src/UI";
import { ControlDisplay } from "./ControlDisplay";
import Style from "../Style/ControlsDisplay.module.css";

type ControlsDisplayProps = {
	controls: Controls
	costs: Record<string, number>
}

export function ControlsDisplay({ controls, costs }: ControlsDisplayProps) {
	const RequestCounter = useRef(0)
	return (<div className={Style.container}>
		{Object.entries(controls).map( ([ControlName, Control]) => {
			const Cost = costs[ControlName] ?? 0
			return (
				<ControlDisplay key={ControlName} name={ControlName} control={Control} requestCounter={RequestCounter} cost={Cost}/>
			)
		})}
	</div>)
}
