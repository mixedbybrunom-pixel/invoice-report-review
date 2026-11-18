import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getSecretKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const secrets = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!secrets) return null;
  try {
    const parsed = JSON.parse(secrets) as Record<string, string>;
    return parsed.default ?? Object.values(parsed)[0] ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = getSecretKey();
  if (!bearerToken || !supabaseUrl || !secretKey) return json(401, { error: "unauthorized" });

  const admin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(bearerToken);
  if (authError || !authData.user) return json(401, { error: "unauthorized" });

  const { data: member, error: memberError } = await admin
    .from("invoice_review_members")
    .select("role")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (memberError || member?.role !== "admin") return json(403, { error: "not_authorized" });

  let email = "";
  try {
    const body = await req.json();
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return json(400, { error: "invalid_request" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: "invalid_email" });

  const temporaryPassword = `${crypto.randomUUID().replaceAll("-", "")}aA7!`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
  });
  if (createError || !created.user) {
    const alreadyExists = /already|registered|exists/i.test(createError?.message ?? "");
    return json(alreadyExists ? 409 : 400, { error: alreadyExists ? "already_exists" : "create_failed" });
  }

  const { error: insertError } = await admin.from("invoice_review_members").insert({
    user_id: created.user.id,
    role: "reviewer",
    must_change_password: true,
  });
  if (insertError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return json(500, { error: "membership_create_failed" });
  }

  return json(201, { email, temporaryPassword });
});
