// TODO: implement actual anti-CSRF state token
// TODO: move client ID elsewhere
function Login() {
  return <div>
  	<a href="https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=xe3tuhxw95q9xss6h0z6a12h5h18ge&redirect_uri=http://localhost:5173/auth&scope=user%3Aread%3Aemail&state=testing">Connect with Twitch</a>
  </div>
}

export default Login
