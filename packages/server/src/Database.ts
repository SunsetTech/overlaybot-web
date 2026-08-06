import { Pool } from "pg"

const TokenVersionCache = new Map<string, number>()

export async function GetTokenVersion(DatabasePool: Pool, TwitchID: string): Promise<number> {
	if (TokenVersionCache.has(TwitchID)) {
		return TokenVersionCache.get(TwitchID)!
	} else {
		const QueryResult = await DatabasePool.query(
			`SELECT token_version FROM users WHERE twitch_id = $1`,
			[TwitchID]
		)
		
		const TokenVersion = QueryResult.rows[0]?.token_version ?? 0
		TokenVersionCache.set(TwitchID, TokenVersion)
		
		return TokenVersion
	}
}

export async function IncrementTokenVersion(DatabasePool: Pool, TwitchID: string) {
	await DatabasePool.query(
		`INSERT INTO users (twitch_id, token_version) VALUES ($1, 1) ON CONFLICT (twitch_id) DO UPDATE SET token_version = users.token_version + 1`,
		[TwitchID]
	)
	
	TokenVersionCache.delete(TwitchID)
}

