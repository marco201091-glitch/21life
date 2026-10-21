// Call only after requireAuthOr401 has verified this same bearer token with Supabase.
export function verifiedPushSession(request: Request, userId: string) {
  try {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) return null;
    const claims = JSON.parse(
      Buffer.from(header.slice(7).split(".")[1], "base64url").toString(),
    );
    return claims.sub === userId &&
      typeof claims.session_id === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        claims.session_id,
      )
      ? claims.session_id
      : null;
  } catch {
    return null;
  }
}
