import { useCookies } from "react-cookie"

function Login() {
	const [Cookies, SetCookie, RemoveCookie] = useCookies(['OAuthState'])
	const StateToken = crypto.randomUUID()
	SetCookie(
		"OAuthState", StateToken, {
			path: "/",
			sameSite: "lax",
			maxAge: 300
		}
	)
	const ClientID = import.meta.env.VITE_TWITCH_CLIENT_ID
	const URL = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${ClientID}&redirect_uri=http://localhost:5173/auth&scope=user%3Aread%3Aemail&state=${StateToken}`
	return <div>
		<a href={URL}>Connect with Twitch</a>
	</div>
}

export default Login
