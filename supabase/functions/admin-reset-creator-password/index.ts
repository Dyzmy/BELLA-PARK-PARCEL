// BELLA PARK: protected one-time admin password reset for the original creator account.
// Required Supabase Edge Function secret: BELLA_PARK_PASSWORD_RESET_KEY.
// Never put that key or any password in GitHub, HTML, JavaScript, or logs.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "https://dyzmy.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-reset-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const TARGET_USER_ID = "1cdbec0f-d474-4ebc-adb6-ab09e1d25eb4";
function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers: cors });
  const origin = req.headers.get("origin");
  if (origin && origin !== "https://dyzmy.github.io") {
    return Response.json({ error: "Origin tidak dibenarkan." }, { status: 403, headers: cors });
  }
  try {
    const expectedKey = Deno.env.get("BELLA_PARK_PASSWORD_RESET_KEY") ?? "";
    const suppliedKey = req.headers.get("x-admin-reset-key") ?? "";
    if (expectedKey.length < 32 || !sameSecret(suppliedKey, expectedKey)) {
      return Response.json({ error: "Kunci admin tidak sah." }, { status: 401, headers: cors });
    }
    const body = await req.json();
    const password = body?.password;
    if (typeof password !== "string" || password.length < 12 || password.length > 128) {
      return Response.json({ error: "Password mesti 12 hingga 128 aksara." }, { status: 400, headers: cors });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Server configuration missing");
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await admin.auth.admin.updateUserById(TARGET_USER_ID, { password });
    if (error) {
      console.error("Password reset failed:", error.message);
      return Response.json({ error: "Supabase tidak berjaya mengemaskini password." }, { status: 500, headers: cors });
    }
    return Response.json({ success: true, message: "Password akaun creator berjaya dikemaskini. Log masuk semula menggunakan username norizwan." }, { status: 200, headers: cors });
  } catch {
    return Response.json({ error: "Permintaan tidak dapat diproses." }, { status: 400, headers: cors });
  }
});
