import * as Shared from "@overlaybot/shared";
import { ControlDisplay } from "./ControlDisplay";
import Style from "../Style/ControlsDisplay.module.css";

type ControlsDisplayProps = {
	controls: Shared.UI.Controls
	costs: Record<string, number>
}

export function ControlsDisplay({ controls, costs }: ControlsDisplayProps) {
	return (<div className={Style.container}>
		{Object.entries(controls).map( ([ControlName, Control]) => {
			const Cost = costs[ControlName] ?? 0
			return (
				<ControlDisplay key={ControlName} name={ControlName} control={Control} cost={Cost}/>
			)
		})}
	</div>)
}
