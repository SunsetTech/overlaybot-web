import { useCookies } from "react-cookie"
import { Button } from "./components/ui/button"

function Login() {
	const [_, setCookie] = useCookies(['OAuthState'])
	const ClientID = import.meta.env.VITE_TWITCH_CLIENT_ID
	const RedirectURI = import.meta.env.VITE_TWITCH_REDIRECT_URI

	const handleClick = () => {
		const stateToken = crypto.randomUUID()
		setCookie("OAuthState", stateToken, {
			path: "/",
			sameSite: "lax",
			maxAge: 300,
			secure: true
		})
		const url = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${ClientID}&redirect_uri=${encodeURIComponent(RedirectURI)}&scope=user%3Aread%3Aemail&state=${stateToken}`
		window.location.href = url
	}

	return <Button onClick={handleClick}>Connect with Twitch</Button>
}
export default Login
