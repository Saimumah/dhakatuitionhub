import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ownerExists } from "@/lib/admin.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Admin Login — ঢাকা টিউশন হাব" },
      { name: "description", content: "ঢাকা টিউশন হাব স্টাফদের জন্য নিরাপদ লগইন।" },
      { property: "og:title", content: "Admin Login — ঢাকা টিউশন হাব" },
      { property: "og:description", content: "ঢাকা টিউশন হাব স্টাফদের জন্য নিরাপদ লগইন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "setup" | "forgot";

const input = "w-full rounded-xl border border-input bg-background px-4 py-3 text-foreground outline-none focus:ring-2 focus:ring-ring";
const btn = "w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [hasOwner, setHasOwner] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ownerExists().then(setHasOwner).catch(() => {});
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/admin" });
      } else if (mode === "setup") {
        if (password.length < 8) throw new Error("পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) throw error;
        setMsg({ ok: true, text: "আপনার email-এ একটি যাচাই লিংক পাঠানো হয়েছে। লিংকে ক্লিক করে তারপর লগইন করুন।" });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMsg({ ok: true, text: "পাসওয়ার্ড রিসেট লিংক email-এ পাঠানো হয়েছে।" });
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "সমস্যা হয়েছে" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 shadow-sm">
        <img src={markUrl} alt="" className="mb-3 h-12 w-auto" />
        <h1 className="font-display text-2xl font-bold text-foreground">ঢাকা টিউশন হাব</h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login" ? "Admin Login" : mode === "setup" ? "প্রথম Owner সেটআপ" : "পাসওয়ার্ড রিসেট"}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input className={input} type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          {mode !== "forgot" && (
            <input className={input} type="password" required placeholder="পাসওয়ার্ড" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "setup" ? "new-password" : "current-password"} />
          )}
          <button className={btn} disabled={busy}>
            {busy ? "অপেক্ষা করুন..." : mode === "login" ? "লগইন" : mode === "setup" ? "Owner account তৈরি" : "রিসেট লিংক পাঠান"}
          </button>
        </form>
        {msg && <p className={`mt-4 text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
        <div className="mt-5 flex flex-col gap-2 text-sm">
          {mode !== "login" && <button className="text-left text-primary" onClick={() => setMode("login")}>← লগইনে ফিরুন</button>}
          {mode === "login" && <button className="text-left text-primary" onClick={() => setMode("forgot")}>পাসওয়ার্ড ভুলে গেছেন?</button>}
          {mode === "login" && !hasOwner && (
            <button className="text-left text-primary" onClick={() => setMode("setup")}>প্রথমবার? Owner account তৈরি করুন</button>
          )}
          <Link to="/" className="text-muted-foreground">হোম পেজ</Link>
        </div>
      </div>
    </main>
  );
}
