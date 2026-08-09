/**
 * Smoke test go-live (BFF same-origin).
 *
 * Uso local:
 *   node deploy/smoke-go-live.mjs
 * Uso produção:
 *   SMOKE_BASE=https://app.seudominio.com SMOKE_EMAIL=… SMOKE_PASSWORD=… node deploy/smoke-go-live.mjs
 *
 * Com MFA activo:
 *   SMOKE_MFA_CODE=123456 node deploy/smoke-go-live.mjs
 */

const BASE = (process.env.SMOKE_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
const EMAIL = process.env.SMOKE_EMAIL ?? "e2e_admin@example.test";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "senha123456";
const MFA_CODE = process.env.SMOKE_MFA_CODE?.trim() ?? "";

function parseSetCookie(headers) {
  const raw = headers.getSetCookie?.() ?? [];
  if (raw.length) return raw;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function main() {
  const jar = new Map();
  let failed = false;
  const ok = (m) => console.log(`✓ ${m}`);
  const fail = (m, d) => {
    console.log(`✗ ${m}${d ? `: ${d}` : ""}`);
    failed = true;
  };

  async function fetchApi(path, init = {}) {
    const headers = new Headers(init.headers);
    if (jar.size) {
      headers.set(
        "cookie",
        [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    }
    const res = await fetch(`${BASE}${path}`, { ...init, headers });
    for (const line of parseSetCookie(res.headers)) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) {
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (/max-age=0/i.test(line)) jar.delete(name);
        else jar.set(name, value);
      }
    }
    return res;
  }

  console.log(`Smoke go-live → ${BASE}`);

  // 1. Health via BFF
  try {
    const health = await fetchApi("/api/health/ready");
    const body = await health.json().catch(() => ({}));
    if (health.ok && (body.status === "ok" || body.database === "up")) {
      ok("GET /api/health/ready");
    } else {
      fail("health/ready", `${health.status} ${JSON.stringify(body)}`);
    }
  } catch (e) {
    fail("health/ready", e instanceof Error ? e.message : String(e));
  }

  // 2. Login
  let loginRes;
  try {
    loginRes = await fetchApi("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
  } catch (e) {
    fail("login", e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const loginBody = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    fail("login", `${loginRes.status} ${loginBody.message ?? ""}`);
    console.log(
      "\nDefina SMOKE_EMAIL / SMOKE_PASSWORD (e SMOKE_MFA_CODE se MFA activo).",
    );
    process.exit(1);
  }

  if (loginBody.mfaRequired) {
    if (!MFA_CODE) {
      fail("login MFA", "mfaRequired mas SMOKE_MFA_CODE não definido");
      process.exit(1);
    }
    const mfaRes = await fetchApi("/api/session/mfa-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfaToken: loginBody.mfaToken, code: MFA_CODE }),
    });
    const mfaBody = await mfaRes.json().catch(() => ({}));
    if (!mfaRes.ok) {
      fail("mfa-verify", `${mfaRes.status} ${mfaBody.message ?? ""}`);
      process.exit(1);
    }
    ok("login + MFA");
    if (!mfaBody.user?.email) fail("mfa body user");
    else ok(`utilizador ${mfaBody.user.email} (${mfaBody.user.role})`);
  } else {
    ok("login (sem MFA)");
    if (!loginBody.user?.email) fail("login body user");
    else ok(`utilizador ${loginBody.user.email} (${loginBody.user.role})`);
  }

  if (jar.has("dadivago_access") && jar.has("dadivago_refresh")) {
    ok("cookies HttpOnly de sessão");
  } else {
    fail("cookies de sessão em falta");
  }

  // 3. me
  const meRes = await fetchApi("/api/auth/me");
  if (meRes.ok) ok("GET /api/auth/me");
  else fail("auth/me", `${meRes.status}`);

  // 4. refresh
  const refreshRes = await fetchApi("/api/session/refresh", { method: "POST" });
  if (refreshRes.ok) ok("POST /api/session/refresh");
  else fail("refresh", `${refreshRes.status}`);

  const me2 = await fetchApi("/api/auth/me");
  if (me2.ok) ok("auth/me após refresh");
  else fail("auth/me após refresh", `${me2.status}`);

  // 5. logout
  const logoutRes = await fetchApi("/api/session/logout", { method: "POST" });
  if (logoutRes.ok) ok("POST /api/session/logout");
  else fail("logout", `${logoutRes.status}`);

  const me3 = await fetchApi("/api/auth/me");
  if (me3.status === 401) ok("auth/me 401 após logout");
  else fail("auth/me após logout", `${me3.status}`);

  console.log(failed ? "\nSmoke FALHOU." : "\nSmoke OK — pronto para go-live.");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
