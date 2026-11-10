// BELLA PARK: resolve stable staff username to current Auth email, then sign in.
// Required Edge Function secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  try {
    const { username, password } = await req.json();
    const cleanUsername = String(username ?? "").trim();
    if (!cleanUsername || typeof password !== "string" || !password) {
      return Response.json({ error: "Username dan password diperlukan." }, { status: 400, headers: cors });
    }
    if (cleanUsername.length > 64 || password.length > 256) {
      return Response.json({ error: "Maklumat log masuk tidak sah." }, { status: 400, headers: cors });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await adminClient
      .from("staff_profiles")
      .select("user_id")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (profileError || !profile) {
      return Response.json({ error: "Username atau password tidak tepat." }, { status: 401, headers: cors });
    }

    const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(profile.user_id);
    const email = userData?.user?.email;
    if (userError || !email) {
      return Response.json({ error: "Akaun belum disediakan dengan betul. Hubungi pentadbir." }, { status: 403, headers: cors });
    }

    const publicClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await publicClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return Response.json({ error: "Username atau password tidak tepat." }, { status: 401, headers: cors });
    }
    return Response.json({ session: data.session }, { status: 200, headers: cors });
  } catch {
    return Response.json({ error: "Permintaan log masuk tidak dapat diproses." }, { status: 400, headers: cors });
  }
});
