import { useRef } from "react";
import type { OverlayBot } from "@overlaybot/shared";
import { ControlDisplay } from "./ControlDisplay";
import Style from "../Style/ControlsDisplay.module.css";

type ControlsDisplayProps = {
	controls: OverlayBot.Controls
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
