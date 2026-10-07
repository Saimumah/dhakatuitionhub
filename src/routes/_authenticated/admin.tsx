import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import {
  APP_STATUSES,
  changeStaffRole,
  claimOwnership,
  createStaff,
  getMe,
  listActivity,
  listApplications,
  listStaff,
  logLogin,
  ownerExists,
  removeStaff,
  setModeratorPermission,
  setStaffActive,
  updateApplicationStatus,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: z.object({ app: z.coerce.number().optional() }),
  head: () => ({
    meta: [
      { title: "Dashboard — ঢাকা টিউশন হাব" },
      { name: "description", content: "ঢাকা টিউশন হাব স্টাফ ড্যাশবোর্ড।" },
      { property: "og:title", content: "Dashboard — ঢাকা টিউশন হাব" },
      { property: "og:description", content: "ঢাকা টিউশন হাব স্টাফ ড্যাশবোর্ড।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const STATUS_LABEL: Record<string, string> = {
  new: "নতুন",
  contacted: "যোগাযোগ করা হয়েছে",
  searching: "টিউটর খোঁজা হচ্ছে",
  found: "টিউটর পাওয়া গেছে",
  selected: "টিউটর নির্বাচন হয়েছে",
  completed: "সম্পন্ন",
  cancelled: "বাতিল",
};
const ROLE_LABEL: Record<string, string> = { owner: "OWNER", admin: "ADMIN", moderator: "MODERATOR" };
const GENDER: Record<string, string> = { boy: "ছেলে", girl: "মেয়ে", male: "ছেলে টিউটর", female: "মেয়ে টিউটর", any: "যেকোনো" };
const ACTION_LABEL: Record<string, string> = {
  login: "লগইন",
  owner_setup: "Owner সেটআপ",
  staff_created: "নতুন স্টাফ তৈরি",
  staff_disabled: "স্টাফ disable",
  staff_enabled: "স্টাফ enable",
  staff_removed: "স্টাফ remove",
  role_changed: "Role পরিবর্তন",
  permission_changed: "Permission পরিবর্তন",
  status_changed: "Application status পরিবর্তন",
};
const fmt = (d: string) => new Date(d).toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" });
const card = "rounded-2xl border border-border bg-card p-4";
const field = "rounded-lg border border-input bg-background px-3 py-2 text-sm";

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getMeFn = useServerFn(getMe);
  const me = useQuery({ queryKey: ["me"], queryFn: () => getMeFn() });
  const [tab, setTab] = useState<"apps" | "users" | "log">("apps");
  const logged = useRef(false);
  const logLoginFn = useServerFn(logLogin);

  useEffect(() => {
    if (me.data?.role && !logged.current && !sessionStorage.getItem("dth-logged")) {
      logged.current = true;
      sessionStorage.setItem("dth-logged", "1");
      logLoginFn().catch(() => {});
    }
  }, [me.data?.role, logLoginFn]);

  async function signOut() {
    sessionStorage.removeItem("dth-logged");
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (me.isLoading) return <Shell onSignOut={signOut}><p className="text-muted-foreground">লোড হচ্ছে...</p></Shell>;
  if (me.error) return <Shell onSignOut={signOut}><p className="text-destructive">লোড করা যায়নি।</p></Shell>;
  if (!me.data?.role) return <Shell onSignOut={signOut}><NoRole /></Shell>;

  const role = me.data.role;
  return (
    <Shell onSignOut={signOut} who={`${me.data.fullName ?? ""} · ${ROLE_LABEL[role]}`}>
      <nav className="mb-5 flex flex-wrap gap-2">
        <TabBtn active={tab === "apps"} onClick={() => setTab("apps")}>Guardian Applications</TabBtn>
        {me.data.canManageModerators && <TabBtn active={tab === "users"} onClick={() => setTab("users")}>User Management</TabBtn>}
        {role === "owner" && <TabBtn active={tab === "log"} onClick={() => setTab("log")}>Activity Log</TabBtn>}
      </nav>
      {tab === "apps" && <Applications />}
      {tab === "users" && me.data.canManageModerators && <Users isOwner={role === "owner"} myId={me.data.userId} />}
      {tab === "log" && role === "owner" && <Activity />}
    </Shell>
  );
}

function Shell({ children, onSignOut, who }: { children: React.ReactNode; onSignOut: () => void; who?: string | undefined }) {
  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">ঢাকা টিউশন হাব — Dashboard</h1>
            {who && <p className="text-sm text-muted-foreground">{who}</p>}
          </div>
          <button onClick={onSignOut} className="rounded-lg border border-border px-4 py-2 text-sm">লগআউট</button>
        </header>
        {children}
      </div>
    </main>
  );
}

function TabBtn({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"}`}>
      {children}
    </button>
  );
}

function NoRole() {
  const qc = useQueryClient();
  const ownerFn = useServerFn(ownerExists);
  const claimFn = useServerFn(claimOwnership);
  const owner = useQuery({ queryKey: ["owner-exists"], queryFn: () => ownerFn() });
  const [name, setName] = useState("");
  const claim = useMutation({
    mutationFn: () => claimFn({ data: { fullName: name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  if (owner.isLoading) return null;
  if (owner.data) {
    return (
      <div className={card}>
        <h2 className="text-lg font-semibold text-destructive">Access Denied</h2>
        <p className="mt-1 text-sm text-muted-foreground">এই account-এর Dashboard দেখার অনুমতি নেই।</p>
      </div>
    );
  }
  return (
    <div className={`${card} max-w-md space-y-3`}>
      <h2 className="text-lg font-semibold">প্রথম Owner সেটআপ</h2>
      <p className="text-sm text-muted-foreground">এই account-টি স্থায়ী Owner হিসেবে সেট হবে। পরে এটি বদলানো যাবে না।</p>
      <input className={`${field} w-full`} placeholder="আপনার নাম" value={name} onChange={(e) => setName(e.target.value)} />
      <button disabled={!name.trim() || claim.isPending} onClick={() => claim.mutate()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        আমাকে Owner করুন
      </button>
      {claim.error && <p className="text-sm text-destructive">{claim.error.message}</p>}
    </div>
  );
}

function Applications() {
  const qc = useQueryClient();
  const { app } = Route.useSearch();
  const listFn = useServerFn(listApplications);
  const updateFn = useServerFn(updateApplicationStatus);
  const apps = useQuery({ queryKey: ["apps"], queryFn: () => listFn() });
  const [filter, setFilter] = useState("all");
  const update = useMutation({
    mutationFn: (v: { id: string; status: (typeof APP_STATUSES)[number] }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["apps"] }),
  });

  useEffect(() => {
    if (app && apps.data) document.getElementById(`app-${app}`)?.scrollIntoView({ behavior: "smooth" });
  }, [app, apps.data]);

  if (apps.isLoading) return <p className="text-muted-foreground">লোড হচ্ছে...</p>;
  if (apps.error) return <p className="text-destructive">{apps.error.message}</p>;
  const rows = (apps.data ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Guardian Applications ({apps.data?.length ?? 0})</h2>
        <select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">সব status</option>
          {APP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>
      {rows.length === 0 && <p className="text-muted-foreground">কোনো আবেদন নেই।</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <article key={r.id} id={`app-${r.app_no}`} className={`${card} ${app === r.app_no ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">Application #{r.app_no}</p>
                <p className="text-xs text-muted-foreground">{fmt(r.created_at)}</p>
              </div>
              <select
                className={field}
                value={r.status}
                disabled={update.isPending}
                onChange={(e) => update.mutate({ id: r.id, status: e.target.value as (typeof APP_STATUSES)[number] })}
              >
                {APP_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <Item k="শ্রেণি" v={r.student_class} />
              <Item k="বিষয়" v={r.subject} />
              <Item k="শিক্ষার্থী" v={GENDER[r.student_gender] ?? r.student_gender} />
              <Item k="লোকেশন" v={r.location} />
              <Item k="ফোন" v={<a className="text-primary" href={`tel:${r.guardian_phone}`}>{r.guardian_phone}</a>} />
              <Item k="WhatsApp" v={r.whatsapp_phone ? <a className="text-primary" href={`https://wa.me/88${r.whatsapp_phone}`} target="_blank" rel="noreferrer">{r.whatsapp_phone}</a> : "—"} />
              <Item k="টিউটর" v={GENDER[r.tutor_preference] ?? r.tutor_preference} />
            </dl>
            {r.requirements && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">{r.requirements}</p>}
          </article>
        ))}
      </div>
      {update.error && <p className="mt-3 text-sm text-destructive">{update.error.message}</p>}
    </section>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </>
  );
}

function Users({ isOwner, myId }: { isOwner: boolean; myId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listStaff);
  const createFn = useServerFn(createStaff);
  const activeFn = useServerFn(setStaffActive);
  const removeFn = useServerFn(removeStaff);
  const roleFn = useServerFn(changeStaffRole);
  const permFn = useServerFn(setModeratorPermission);
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => listFn() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", role: "moderator" as "admin" | "moderator", password: "", canManageModerators: false });
  const [err, setErr] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });
  const run = async (p: Promise<unknown>) => {
    setErr("");
    try { await p; refresh(); } catch (e) { setErr(e instanceof Error ? e.message : "সমস্যা হয়েছে"); }
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">User Management</h2>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
          + নতুন Admin/Moderator তৈরি করুন
        </button>
      </div>
      {open && (
        <form
          className={`${card} grid gap-3 sm:grid-cols-2`}
          onSubmit={(e) => {
            e.preventDefault();
            run(createFn({ data: form }).then(() => { setOpen(false); setForm({ fullName: "", email: "", role: "moderator", password: "", canManageModerators: false }); }));
          }}
        >
          <input required className={field} placeholder="নাম" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input required type="email" className={field} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <select className={field} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "admin" | "moderator" })}>
            {isOwner && <option value="admin">ADMIN</option>}
            <option value="moderator">MODERATOR</option>
          </select>
          <input required minLength={8} type="text" className={field} placeholder="অস্থায়ী পাসওয়ার্ড (৮+ অক্ষর)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {isOwner && form.role === "admin" && (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" checked={form.canManageModerators} onChange={(e) => setForm({ ...form, canManageModerators: e.target.checked })} />
              এই Admin Moderator manage করতে পারবে
            </label>
          )}
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground sm:col-span-2">তৈরি করুন</button>
        </form>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="space-y-2">
        {(staff.data ?? []).map((s) => {
          const protectedRow = s.role === "owner" || s.user_id === myId || (!isOwner && s.role !== "moderator");
          return (
            <div key={s.user_id} className={`${card} flex flex-wrap items-center justify-between gap-3`}>
              <div>
                <p className="font-medium">{s.full_name} <span className="ml-1 rounded bg-muted px-2 py-0.5 text-xs">{s.role ? ROLE_LABEL[s.role] : "—"}</span>{!s.is_active && <span className="ml-1 text-xs text-destructive">Disabled</span>}</p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
              </div>
              {!protectedRow && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {isOwner && (
                    <select className={field} value={s.role ?? ""} onChange={(e) => run(roleFn({ data: { userId: s.user_id, role: e.target.value as "admin" | "moderator" } }))}>
                      <option value="admin">ADMIN</option>
                      <option value="moderator">MODERATOR</option>
                    </select>
                  )}
                  {isOwner && s.role === "admin" && (
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={s.can_manage_moderators} onChange={(e) => run(permFn({ data: { userId: s.user_id, allowed: e.target.checked } }))} />
                      Moderator manage
                    </label>
                  )}
                  <button className="rounded-lg border border-border px-3 py-1.5" onClick={() => run(activeFn({ data: { userId: s.user_id, active: !s.is_active } }))}>
                    {s.is_active ? "Disable" : "Enable"}
                  </button>
                  <button className="rounded-lg border border-destructive px-3 py-1.5 text-destructive" onClick={() => confirm(`${s.email} remove করবেন?`) && run(removeFn({ data: { userId: s.user_id } }))}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Activity() {
  const fn = useServerFn(listActivity);
  const log = useQuery({ queryKey: ["activity"], queryFn: () => fn() });
  if (log.isLoading) return <p className="text-muted-foreground">লোড হচ্ছে...</p>;
  return (
    <section className={`${card} overflow-x-auto`}>
      <h2 className="mb-3 text-lg font-semibold">Activity Log</h2>
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr><th className="py-2 pr-3">সময়</th><th className="pr-3">User</th><th className="pr-3">Role</th><th className="pr-3">Action</th><th>বিস্তারিত</th></tr>
        </thead>
        <tbody>
          {(log.data ?? []).map((a) => (
            <tr key={a.id} className="border-t border-border">
              <td className="py-2 pr-3 whitespace-nowrap">{fmt(a.created_at)}</td>
              <td className="pr-3">{a.actor_email}</td>
              <td className="pr-3">{a.actor_role ? ROLE_LABEL[a.actor_role] ?? a.actor_role : ""}</td>
              <td className="pr-3">{ACTION_LABEL[a.action] ?? a.action}</td>
              <td className="text-xs text-muted-foreground">{detail(a.details)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function detail(d: unknown): string {
  if (!d || typeof d !== "object") return "";
  const o = d as Record<string, unknown>;
  if (o["application_no"]) return `#${o["application_no"]}: ${STATUS_LABEL[String(o["from"])] ?? ""} → ${STATUS_LABEL[String(o["to"])] ?? ""}`;
  return Object.entries(o).map(([k, v]) => `${k}: ${String(v)}`).join(", ");
}
