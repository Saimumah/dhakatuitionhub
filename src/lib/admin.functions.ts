import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StaffRole = "owner" | "admin" | "moderator";
export const APP_STATUSES = [
  "new",
  "contacted",
  "searching",
  "found",
  "selected",
  "completed",
  "cancelled",
] as const;

type Ctx = { supabase: any; userId: string };

async function callerRole(ctx: Ctx): Promise<StaffRole | null> {
  const { data } = await ctx.supabase.rpc("get_staff_role", { _user_id: ctx.userId });
  return (data as StaffRole | null) ?? null;
}

async function callerProfile(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("staff_profiles")
    .select("full_name, email, is_active, can_manage_moderators")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data as
    | { full_name: string; email: string; is_active: boolean; can_manage_moderators: boolean }
    | null;
}

async function audit(actorId: string, actorEmail: string, actorRole: string, action: string, details: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    actor_id: actorId,
    actor_email: actorEmail,
    actor_role: actorRole,
    action,
    details: details as any,
  });
}

/** Can the caller manage a target with the given role? Owner: admin+moderator. Admin w/ permission: moderator only. */
async function assertCanManage(ctx: Ctx, targetRole: StaffRole) {
  const role = await callerRole(ctx);
  const profile = await callerProfile(ctx);
  if (!role || !profile) throw new Error("Access denied");
  if (targetRole === "owner") throw new Error("Owner account is protected");
  if (role === "owner") return { role, profile };
  if (role === "admin" && profile.can_manage_moderators && targetRole === "moderator") return { role, profile };
  throw new Error("Access denied");
}

async function targetInfo(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: r } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  const { data: p } = await supabaseAdmin.from("staff_profiles").select("email").eq("user_id", userId).maybeSingle();
  if (!r) throw new Error("User not found");
  return { role: r.role as StaffRole, email: p?.email ?? "" };
}

export const ownerExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.rpc("owner_exists");
  return Boolean(data);
});

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await callerRole(context);
    const profile = await callerProfile(context);
    return {
      userId: context.userId,
      role,
      fullName: profile?.full_name ?? null,
      canManageModerators: role === "owner" || (role === "admin" && !!profile?.can_manage_moderators),
    };
  });

export const claimOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fullName: z.string().trim().min(1).max(100) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: ok, error } = await context.supabase.rpc("claim_ownership", { _full_name: data.fullName });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });

export const logLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.rpc("log_activity", { _action: "login" });
    return { ok: true };
  });

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("tutor_requests")
      .select("id, app_no, created_at, student_class, subject, student_gender, location, guardian_phone, whatsapp_phone, tutor_preference, requirements, status, notification_status")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateApplicationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(APP_STATUSES) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: rows, error } = await context.supabase
      .from("tutor_requests")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("Access denied");
    return { ok: true };
  });

export const listStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profiles, error } = await context.supabase
      .from("staff_profiles")
      .select("user_id, full_name, email, is_active, can_manage_moderators, created_at")
      .order("created_at");
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    return (profiles ?? []).map((p: any) => ({ ...p, role: (roleMap.get(p.user_id) ?? null) as StaffRole | null }));
  });

export const createStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        fullName: z.string().trim().min(1).max(100),
        email: z.string().trim().email().max(255),
        role: z.enum(["admin", "moderator"]),
        password: z.string().min(8).max(72),
        canManageModerators: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { role, profile } = await assertCanManage(context, data.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error || !created.user) throw new Error(error?.message ?? "Could not create user");
    const uid = created.user.id;
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (rErr) {
      await supabaseAdmin.auth.admin.deleteUser(uid);
      throw new Error(rErr.message);
    }
    await supabaseAdmin.from("staff_profiles").insert({
      user_id: uid,
      full_name: data.fullName,
      email: data.email,
      can_manage_moderators: role === "owner" && data.role === "admin" ? data.canManageModerators : false,
    });
    await audit(context.userId, profile.email, role, "staff_created", { email: data.email, role: data.role });
    return { ok: true };
  });

export const setStaffActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.userId === context.userId) throw new Error("You cannot disable yourself");
    const target = await targetInfo(data.userId);
    const { role, profile } = await assertCanManage(context, target.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("staff_profiles").update({ is_active: data.active }).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.auth.admin.updateUserById(data.userId, { ban_duration: data.active ? "none" : "876000h" });
    await audit(context.userId, profile.email, role, data.active ? "staff_enabled" : "staff_disabled", { email: target.email, role: target.role });
    return { ok: true };
  });

export const removeStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    if (data.userId === context.userId) throw new Error("You cannot remove yourself");
    const target = await targetInfo(data.userId);
    const { role, profile } = await assertCanManage(context, target.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Trigger blocks deleting an owner row even if checks above were bypassed.
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("staff_profiles").delete().eq("user_id", data.userId);
    await supabaseAdmin.auth.admin.deleteUser(data.userId);
    await audit(context.userId, profile.email, role, "staff_removed", { email: target.email, role: target.role });
    return { ok: true };
  });

export const changeStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), role: z.enum(["admin", "moderator"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const target = await targetInfo(data.userId);
    const caller = await callerRole(context);
    if (caller !== "owner") throw new Error("Only the owner can change roles");
    const { profile } = await assertCanManage(context, target.role);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").update({ role: data.role }).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    if (data.role === "moderator") {
      await supabaseAdmin.from("staff_profiles").update({ can_manage_moderators: false }).eq("user_id", data.userId);
    }
    await audit(context.userId, profile.email, "owner", "role_changed", { email: target.email, from: target.role, to: data.role });
    return { ok: true };
  });

export const setModeratorPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), allowed: z.boolean() }).parse(d))
  .handler(async ({ context, data }) => {
    if ((await callerRole(context)) !== "owner") throw new Error("Only the owner can change permissions");
    const target = await targetInfo(data.userId);
    if (target.role !== "admin") throw new Error("Only admins can receive this permission");
    const profile = await callerProfile(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("staff_profiles").update({ can_manage_moderators: data.allowed }).eq("user_id", data.userId);
    await audit(context.userId, profile?.email ?? "", "owner", "permission_changed", { email: target.email, can_manage_moderators: data.allowed });
    return { ok: true };
  });

export const listActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("id, actor_email, actor_role, action, details, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
