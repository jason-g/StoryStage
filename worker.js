const COOKIE_NAME = "storystage_session";
const SESSION_SECONDS = 24 * 60 * 60;

const html = (body, status = 200, headers = {}) => new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Sign in to StoryStage</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #07091a; color: #f3f5ff; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; }
      main { width: min(88vw, 360px); padding: 28px; border: 1px solid #454365; border-radius: 18px; background: #15152d; box-shadow: 0 24px 70px #0008; }
      h1 { margin: 0 0 8px; font-size: 1.55rem; }
      p { color: #b5b5ca; line-height: 1.5; }
      label { display: block; margin-top: 15px; font-size: .8rem; font-weight: 700; }
      input { box-sizing: border-box; width: 100%; margin-top: 6px; padding: 11px; border: 1px solid #504d70; border-radius: 9px; background: #101123; color: #fff; }
      button { width: 100%; margin-top: 20px; padding: 11px; border: 0; border-radius: 9px; background: linear-gradient(135deg,#8f6dff,#5edffc); color: #111126; font-weight: 900; cursor: pointer; }
      .error { color: #ff9fba; }
    </style>
  </head>
  <body><main>${body}</main></body>
</html>`, {
  status,
  headers: {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": "text/html; charset=utf-8",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  },
});

const loginPage = (failed = false) => html(`
  <h1>StoryStage preview</h1>
  <p>Sign in to open the private contest build.</p>
  ${failed ? '<p class="error" role="alert">The username or password was incorrect.</p>' : ""}
  <form method="post" action="/_auth/login">
    <label>Username<input name="username" autocomplete="username" required autofocus></label>
    <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit">Enter StoryStage</button>
  </form>
`, failed ? 401 : 200);

const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sessionToken = async (username, password) => {
  const bytes = new TextEncoder().encode(`storystage\0${username}\0${password}`);
  return hex(await crypto.subtle.digest("SHA-256", bytes));
};

const readCookie = (request, name) => {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const part of cookies.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
};

export default {
  async fetch(request, env) {
    const username = env.BASIC_AUTH_USERNAME;
    const password = env.BASIC_AUTH_PASSWORD;

    if (!username || !password) {
      return html("<h1>StoryStage is unavailable</h1><p>Authentication has not been configured.</p>", 503);
    }

    const url = new URL(request.url);
    const expectedToken = await sessionToken(username, password);

    if (request.method === "POST" && url.pathname === "/_auth/login") {
      const form = await request.formData();
      if (form.get("username") !== username || form.get("password") !== password) return loginPage(true);
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Cache-Control": "no-store",
          "Set-Cookie": `${COOKIE_NAME}=${expectedToken}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
        },
      });
    }

    if (readCookie(request, COOKIE_NAME) !== expectedToken) return loginPage();
    return env.ASSETS.fetch(request);
  },
};
