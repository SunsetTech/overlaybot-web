import { useRef } from "react";
import type { OverlayBot } from "@overlaybot/shared";
import { ControlDisplay } from "./ControlDisplay";
import Style from "../Style/ControlsDisplay.module.css";

type ControlsDisplayProps = {
	controls: OverlayBot.Controls
}

export function ControlsDisplay({ controls }: ControlsDisplayProps) {
	const RequestCounter = useRef(0)
	return (<div className={Style.container}>
		{Object.entries(controls).map(([ControlName, Control]) => (
			<ControlDisplay key={ControlName} name={ControlName} control={Control} requestCounter={RequestCounter}/>
		))}
	</div>)
}
