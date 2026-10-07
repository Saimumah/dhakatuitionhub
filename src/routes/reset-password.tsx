import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "নতুন পাসওয়ার্ড — ঢাকা টিউশন হাব" },
      { name: "description", content: "স্টাফ account-এর নতুন পাসওয়ার্ড সেট করুন।" },
      { property: "og:title", content: "নতুন পাসওয়ার্ড — ঢাকা টিউশন হাব" },
      { property: "og:description", content: "স্টাফ account-এর নতুন পাসওয়ার্ড সেট করুন।" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg("পাসওয়ার্ড অন্তত ৮ অক্ষরের হতে হবে");
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return setMsg(error.message);
    navigate({ to: "/admin" });
  }
  return (
    <main className="page-backdrop flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-3xl border border-border bg-card p-7">
        <h1 className="font-display text-2xl font-bold text-foreground">নতুন পাসওয়ার্ড</h1>
        <input type="password" className="w-full rounded-xl border border-input bg-background px-4 py-3" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="নতুন পাসওয়ার্ড" autoComplete="new-password" />
        <button className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">সেভ করুন</button>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
      </form>
    </main>
  );
}
