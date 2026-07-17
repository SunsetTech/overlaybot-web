import { useCookies } from "react-cookie"
import { Button } from "./components/ui/button"
function Login() {
	const [_, SetCookie] = useCookies(['OAuthState'])
	const StateToken = crypto.randomUUID()
	SetCookie(
		"OAuthState", StateToken, {
			path: "/",
			sameSite: "lax",
			maxAge: 300,
			secure: true
		}
	)
	const ClientID = import.meta.env.VITE_TWITCH_CLIENT_ID
	const RedirectURI = import.meta.env.VITE_TWITCH_REDIRECT_URI
	const URL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${ClientID}&redirect_uri=${RedirectURI}&scope=user%3Aread%3Aemail&state=${StateToken}`
	return <Button asChild>
		<a href={URL}>Connect with Twitch</a>
	</Button>
}

export default Login
