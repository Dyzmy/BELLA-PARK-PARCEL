// Admin-only rider account management. Service-role credentials stay server-side.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {
  "Access-Control-Allow-Origin": "https://dyzmy.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin",
};
const allowedCouriers = ["SPX", "J&T", "NINJA"];
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.headers.get("origin") && req.headers.get("origin") !== "https://dyzmy.github.io")
    return reply({ error: "Origin tidak dibenarkan." }, 403);
  if (req.method !== "POST") return reply({ error: "Method tidak dibenarkan." }, 405);
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return reply({ error: "Sesi Admin diperlukan." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const caller = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await caller.auth.getUser(token);
    if (authError || !authData.user) return reply({ error: "Sesi login tidak sah." }, 401);
    const { data: actor } = await admin.from("staff_profiles").select("role,is_active")
      .eq("user_id", authData.user.id).maybeSingle();
    if (actor?.role !== "admin" || actor.is_active === false) return reply({ error: "Akses Admin sahaja." }, 403);
    const body = await req.json(), action = String(body.action || "");
    if (action === "list") {
      const { data, error } = await admin.from("staff_profiles")
        .select("user_id,username,display_name,phone,courier,is_active,created_at")
        .eq("role", "scanner").order("display_name");
      if (error) throw error;
      return reply({ riders: data || [] });
    }
    if (action === "create") {
      const displayName = String(body.display_name || "").trim();
      const username = String(body.username || "").trim().toLowerCase();
      const email = String(body.email || "").trim().toLowerCase();
      const phone = String(body.phone || "").trim();
      const courier = String(body.courier || "");
      if (!displayName || !username || !email || !phone || !allowedCouriers.includes(courier))
        return reply({ error: "Lengkapkan nama, username, email, telefon dan courier yang sah." }, 400);
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) return reply({ error: "Username mesti 3–32 aksara: huruf kecil, nombor, titik, _ atau -." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ error: "Alamat email tidak sah." }, 400);
      if (displayName.length > 100 || phone.length > 30) return reply({ error: "Nama atau nombor telefon terlalu panjang." }, 400);
      const { data: existing } = await admin.from("staff_profiles").select("user_id").ilike("username", username).maybeSingle();
      if (existing) return reply({ error: "Username sudah digunakan." }, 409);
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
      const random = crypto.getRandomValues(new Uint8Array(24));
      const temporaryPassword = Array.from(random, v => alphabet[v % alphabet.length]).join("");
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email, password: temporaryPassword, email_confirm: true,
        user_metadata: { username, display_name: displayName, account_type: "rider" },
      });
      if (createError || !created.user) return reply({ error: createError?.message || "Gagal mencipta akaun Auth." }, 400);
      const { error: profileError } = await admin.from("staff_profiles").insert({
        user_id: created.user.id, username, display_name: displayName, phone, courier, role: "scanner", is_active: true,
      });
      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id);
        return reply({ error: profileError.message }, 400);
      }
      return reply({ success: true, rider: { user_id: created.user.id, username, display_name: displayName, email, phone, courier, is_active: true },
        temporary_password: temporaryPassword, message: "Akaun rider berjaya dicipta. Password sementara dipaparkan sekali sahaja." }, 201);
    }
    if (action === "set_active") {
      const userId = String(body.user_id || ""), isActive = body.is_active === true;
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return reply({ error: "ID akaun tidak sah." }, 400);
      const { data: target } = await admin.from("staff_profiles").select("user_id,role").eq("user_id", userId).maybeSingle();
      if (!target || target.role !== "scanner") return reply({ error: "Akaun rider tidak dijumpai." }, 404);
      const { error } = await admin.from("staff_profiles").update({ is_active: isActive }).eq("user_id", userId);
      if (error) throw error;
      await admin.auth.admin.updateUserById(userId, { ban_duration: isActive ? "none" : "876000h" });
      return reply({ success: true, is_active: isActive });
    }
    return reply({ error: "Tindakan tidak dikenali." }, 400);
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Permintaan gagal diproses." }, 500);
  }
});
