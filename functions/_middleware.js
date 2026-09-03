const unauthorized = () => new Response("Authentication required.", {
  status: 401,
  headers: {
    "Cache-Control": "no-store",
    "WWW-Authenticate": 'Basic realm="StoryStage contest preview", charset="UTF-8"',
  },
});

export async function onRequest(context) {
  const username = context.env.BASIC_AUTH_USERNAME;
  const password = context.env.BASIC_AUTH_PASSWORD;

  // Production previews fail closed if authentication was not configured.
  if (!username || !password) {
    return new Response("StoryStage authentication is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const authorization = context.request.headers.get("Authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized();

  let supplied;
  try {
    supplied = atob(authorization.slice(6));
  } catch {
    return unauthorized();
  }

  if (supplied !== `${username}:${password}`) return unauthorized();
  return context.next();
}
