// OPC weekly reports / Cloudflare Worker + D1
// Students do not log in. Administrator uses a server-side password.
const TEAM_NAMES = [
  "李京泽·云翼哨兵",
  "刘佳钰·云翼智航",
  "徐佳怡·智护低空",
  "民事案件纠纷调解系统化服务",
  "不良信贷案件标准化生成",
  "涉外法律服务（秦玉彬·张旭光组）",
  "涉外法律服务（杨乔娴组）",
  "郑思彤·预付消费维权服务站",
  "卢欣怡·法小盾",
  "姜舰·为店生光",
  "张燕·兼职防骗风控平台",
  "王孜轩·网暴取证维权",
  "田天雪·刑事案件3D现场重建",
  "赵文硕·法萃咖啡",
  "刘明月·高考志愿智能咨询",
  "张嘉钰·公职备考陪伴服务",
  "常素丽·校园租赁微纠纷调解",
  "常素丽·银发反诈权益保护",
  "时颖·箱包皮具版权筛查",
  "董林杰·跨境物流合规自查",
  "王苗苗李伊琳·童车知盾",
  "李鑫桐·AI短剧一人公司",
  "吕静宜·AI伪造内容鉴别",
  "戴梦菡·校园好物助手",
  "王田钰琛·财税合规鉴定",
  "AI智能拼豆DIY体验站",
  "鲁博轩·音潮SoundTide",
];
const encoder = new TextEncoder();
const response = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
const b64 = (data) =>
  btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const un64 = (x) =>
  Uint8Array.from(
    atob(
      x.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (x.length % 4)) % 4)
    ),
    (c) => c.charCodeAt(0)
  );
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
async function signAdmin(secret) {
  const payload = b64(
    encoder.encode(
      JSON.stringify({
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 8 * 3600,
      })
    )
  );
  const sig = b64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await hmacKey(secret),
        encoder.encode(payload)
      )
    )
  );
  return `${payload}.${sig}`;
}
async function isAdmin(req, secret) {
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return false;
    const parts = auth.slice(7).split(".");
    if (parts.length !== 2 || parts[0].length > 1024 || parts[1].length > 1024)
      return false;
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      un64(parts[1]),
      encoder.encode(parts[0])
    );
    if (!ok) return false;
    const p = JSON.parse(new TextDecoder().decode(un64(parts[0])));
    return (
      p.role === "admin" &&
      Number.isInteger(p.exp) &&
      p.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}
async function samePassword(given, expected) {
  const hash = async (s) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(String(s)))
    );
  const [a, b] = await Promise.all([hash(given), hash(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
const validWeek = (w) =>
  typeof w === "string" && /^20\d{2}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(w);
const clean = (v, max = 2000) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
async function getJson(req) {
  const raw = await req.text();
  if (raw.length > 12000) throw Error("payload-too-large");
  const obj = JSON.parse(raw);
  if (!obj || typeof obj !== "object" || Array.isArray(obj))
    throw Error("invalid-json");
  return obj;
}
let rateTableReady = false;
async function throttle(env, identity, limit) {
  if (!rateTableReady) {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS request_limits (id TEXT PRIMARY KEY, window INTEGER NOT NULL, hits INTEGER NOT NULL)"
    ).run();
    rateTableReady = true;
  }
  const window = Math.floor(Date.now() / 900000);
  await env.DB.prepare(
    `INSERT INTO request_limits(id,window,hits) VALUES(?,?,1) ON CONFLICT(id) DO UPDATE SET window=excluded.window,hits=CASE WHEN request_limits.window=excluded.window THEN request_limits.hits+1 ELSE 1 END`
  )
    .bind(identity, window)
    .run();
  const row = await env.DB.prepare("SELECT hits FROM request_limits WHERE id=?")
    .bind(identity)
    .first();
  return Number(row?.hits || 0) > limit;
}
async function hashId(value) {
  return b64(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))
  );
}
async function route(req, env) {
  const url = new URL(req.url),
    path = url.pathname;
  if (!path.startsWith("/api/")) return env.ASSETS.fetch(req);
  if (path === "/api/health" && req.method === "GET") {
    try {
      await env.DB.prepare("SELECT 1").first();
      return response({ status: "ok", database: "connected" });
    } catch {
      return response({ status: "error", database: "unavailable" }, 503);
    }
  }
  
if (path === "/api/config-check" && req.method === "GET") {
  return response({
    DB: Boolean(env.DB),
    ADMIN_PASSWORD: Boolean(env.ADMIN_PASSWORD),
    SESSION_SECRET: Boolean(env.SESSION_SECRET)
  });
}
  
  if (!env.DB || !env.ADMIN_PASSWORD || !env.SESSION_SECRET)
    return response({ error: "服务器配置不完整" }, 503);
  if (!["GET", "POST"].includes(req.method))
    return response({ error: "请求方式不支持" }, 405);
  if (req.method === "POST") {
    const origin = req.headers.get("Origin");
    if (origin && origin !== url.origin)
      return response({ error: "请求来源不匹配" }, 403);
    if (!(req.headers.get("Content-Type") || "").includes("application/json"))
      return response({ error: "请使用JSON请求" }, 415);
  }
  const ip = req.headers.get("CF-Connecting-IP") || "unknown";
  if (path === "/api/admin/login" && req.method === "POST") {
    const body = await getJson(req),
      code = body.password;
    if (typeof code !== "string" || code.length < 1 || code.length > 256)
      return response({ error: "密码格式不正确" }, 400);
    const id = "admin:" + (await hashId(ip));
    if (await throttle(env, id, 5))
      return response({ error: "登录次数过多，15分钟后重试" }, 429);
    if (!(await samePassword(code, env.ADMIN_PASSWORD)))
      return response({ error: "管理密码错误" }, 401);
    return response({ token: await signAdmin(env.SESSION_SECRET) });
  }
  if (path === "/api/reports/status" && req.method === "GET") {
    const team = url.searchParams.get("team") || "",
      week = url.searchParams.get("week") || "";
    if (!TEAM_NAMES.includes(team) || !validWeek(week))
      return response({ error: "团队或周次无效" }, 400);
    const { results } = await env.DB.prepare(
      "SELECT report_type FROM weekly_reports WHERE team_id=? AND week_key=?"
    )
      .bind(team, week)
      .all();
    return response({
      plan: results.some((x) => x.report_type === "plan"),
      progress: results.some((x) => x.report_type === "progress"),
    });
  }
  if (path === "/api/reports" && req.method === "POST") {
    const input = await getJson(req);
    const team = input.team_id,
      week = input.week_key,
      type = input.report_type,
      p = input.report_data;
    if (
      !TEAM_NAMES.includes(team) ||
      !validWeek(week) ||
      !["plan", "progress"].includes(type)
    )
      return response({ error: "团队、周次或表单类型无效" }, 400);
    if (!p || typeof p !== "object" || Array.isArray(p))
      return response({ error: "表单格式不正确" }, 400);
    const id = "submit:" + (await hashId(ip + "|" + team));
    if (await throttle(env, id, 20))
      return response({ error: "提交过于频繁，请15分钟后重试" }, 429);
    let rec;
    if (type === "plan") {
      rec = {
        tasks: clean(p.tasks),
        goal: clean(p.goal, 500),
        need: clean(p.need, 500),
      };
      if (!rec.tasks) return response({ error: "请填写本周核心任务" }, 400);
    } else {
      const p1 = Number(p.p1),
        p2 = Number(p.p2);
      if (![p1, p2].every((x) => Number.isInteger(x) && x >= 0 && x <= 100))
        return response({ error: "完成度应为0—100整数" }, 400);
      rec = { p1, p2, result: clean(p.result), delay: clean(p.delay, 1000) };
      if (!rec.result) return response({ error: "请填写实际成果" }, 400);
    }
    await env.DB.prepare(
      `INSERT INTO weekly_reports(team_id,week_key,report_type,report_data) VALUES(?,?,?,?) ON CONFLICT(team_id,week_key,report_type) DO UPDATE SET report_data=excluded.report_data,updated_at=CURRENT_TIMESTAMP`
    )
      .bind(team, week, type, JSON.stringify(rec))
      .run();
    return response({ ok: true });
  }
  if (path === "/api/admin/reports" && req.method === "GET") {
    if (!(await isAdmin(req, env.SESSION_SECRET)))
      return response({ error: "管理员登录已过期，请重新登录" }, 401);
    const week = url.searchParams.get("week");
    if (!validWeek(week)) return response({ error: "周次格式不正确" }, 400);
    const { results } = await env.DB.prepare(
      "SELECT team_id,week_key,report_type,report_data,submitted_at,updated_at FROM weekly_reports WHERE week_key=? ORDER BY team_id"
    )
      .bind(week)
      .all();
    return response({
      reports: results.map((row) => ({
        ...row,
        report_data: JSON.parse(row.report_data),
      })),
    });
  }
  return response({ error: "接口不存在" }, 404);
}
export default {
  async fetch(req, env) {
    try {
      return await route(req, env);
    } catch (err) {
      console.error("OPC error", err?.message);
      return response({ error: "服务暂时不可用，请稍后再试" }, 500);
    }
  },
};
