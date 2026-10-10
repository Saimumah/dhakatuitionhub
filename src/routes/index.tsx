import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  MapPin,
  MessageCircle,
  Phone,
  UserRound,
} from "lucide-react";
import {
  submitTutorRequest,
  type SubmitTutorRequestInput,
} from "@/lib/tutor-request.functions";
import { isValidBdPhone } from "@/lib/bd-phone";
import logoUrl from "@/assets/logo.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "আপনার সন্তানের জন্য টিউটর খুঁজছেন? — এখনই আবেদন করুন",
      },
      {
        name: "description",
        content:
          "শ্রেণি, বিষয়, এলাকা ও ফোন নম্বর দিয়ে আবেদন করুন। আমাদের টিম আপনার প্রয়োজন অনুযায়ী উপযুক্ত টিউটর খুঁজে দেওয়ার চেষ্টা করবে।",
      },
      {
        property: "og:title",
        content: "আপনার সন্তানের জন্য টিউটর খুঁজছেন?",
      },
      {
        property: "og:description",
        content:
          "শ্রেণি, বিষয়, এলাকা ও ফোন নম্বর দিয়ে আবেদন করুন। আমাদের টিম আপনার প্রয়োজন অনুযায়ী উপযুক্ত টিউটর খুঁজে দেওয়ার চেষ্টা করবে।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const CLASS_OPTIONS = [
  "১ম শ্রেণি",
  "২য় শ্রেণি",
  "৩য় শ্রেণি",
  "৪র্থ শ্রেণি",
  "৫ম শ্রেণি",
  "৬ষ্ঠ শ্রেণি",
  "৭ম শ্রেণি",
  "৮ম শ্রেণি",
  "৯ম শ্রেণি",
  "১০ম শ্রেণি",
  "একাদশ শ্রেণি",
  "দ্বাদশ শ্রেণি",
  "বিশ্ববিদ্যালয়",
  "অন্যান্য",
];

type FormState = {
  studentClass: string;
  subject: string;
  studentGender: "" | "boy" | "girl";
  location: string;
  guardianPhone: string;
  whatsappPhone: string;
  tutorPreference: "" | "male" | "female" | "any";
  requirements: string;
};

const INITIAL_STATE: FormState = {
  studentClass: "",
  subject: "",
  studentGender: "",
  location: "",
  guardianPhone: "",
  whatsappPhone: "",
  tutorPreference: "",
  requirements: "",
};

function FieldShell({
  number,
  label,
  description,
  error,
  optional,
  children,
}: {
  number: string;
  label: string;
  description?: string | undefined;
  error?: string | undefined;
  optional?: boolean | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-3">
        <span className="step-badge mt-0.5">{number}</span>
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {label}
            {optional ? (
              <span className="ml-2 text-xs font-medium text-muted-foreground">
                (ঐচ্ছিক)
              </span>
            ) : null}
          </p>
          {description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
      {error ? (
        <p className="pl-10 text-sm font-medium text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function ChoicePill({
  label,
  selected,
  onSelect,
  invalid,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  invalid?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={
        "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all " +
        (selected
          ? "border-primary bg-primary/10 text-primary"
          : invalid
            ? "border-destructive/60 bg-card text-muted-foreground hover:border-primary/50"
            : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border border-input bg-card px-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25";

function Index() {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const submitFn = useServerFn(submitTutorRequest);
  const mutation = useMutation({
    mutationFn: (input: SubmitTutorRequestInput) => submitFn({ data: input }),
    onSuccess: (result) => {
      if (result.ok) {
        setSubmitted(true);
      } else {
        setServerError(result.error);
      }
    },
    onError: () => {
      setServerError("তথ্য পাঠানো যায়নি। আবার চেষ্টা করুন।");
    },
  });

  const update = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setServerError(null);
  };

  const validate = (): SubmitTutorRequestInput | null => {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (!form.studentClass) next.studentClass = "শ্রেণি নির্বাচন করুন";
    if (!form.subject.trim()) next.subject = "বিষয় লিখুন";
    if (!form.studentGender) next.studentGender = "শিক্ষার্থীর লিঙ্গ নির্বাচন করুন";
    if (!form.location.trim()) next.location = "এলাকার নাম লিখুন";
    if (!isValidBdPhone(form.guardianPhone))
      next.guardianPhone = "সঠিক ফোন নম্বর দিন (যেমন: 01712345678)";
    if (form.whatsappPhone.trim() && !isValidBdPhone(form.whatsappPhone))
      next.whatsappPhone = "সঠিক WhatsApp নম্বর দিন বা ঘরটি ফাঁকা রাখুন";
    if (!form.tutorPreference) next.tutorPreference = "টিউটর পছন্দ নির্বাচন করুন";
    setErrors(next);
    if (Object.keys(next).length > 0 || !form.studentGender || !form.tutorPreference)
      return null;

    return {
      studentClass: form.studentClass,
      subject: form.subject.trim(),
      studentGender: form.studentGender,
      location: form.location.trim(),
      guardianPhone: form.guardianPhone.trim(),
      whatsappPhone: form.whatsappPhone.trim(),
      tutorPreference: form.tutorPreference,
      requirements: form.requirements.trim(),
    };
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const payload = validate();
    if (!payload) return;
    mutation.mutate(payload);
  };

  if (submitted) {
    return (
      <main className="page-backdrop flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-xl">
          <div className="form-card rounded-3xl border border-border bg-card px-6 py-12 text-center sm:px-10">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-9 w-9 text-primary" />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold text-foreground sm:text-3xl">
              আবেদন সফল হয়েছে!
            </h1>
            <p className="mt-3 text-muted-foreground">
              আপনার তথ্য পাওয়ার পর আমাদের টিম আপনার সাথে যোগাযোগ করবে এবং আপনার
              প্রয়োজন অনুযায়ী উপযুক্ত টিউটর খুঁজে দেওয়ার চেষ্টা করবে।
            </p>
            <button
              type="button"
              onClick={() => {
                setForm(INITIAL_STATE);
                setSubmitted(false);
              }}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              নতুন আবেদন করুন
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page-backdrop min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <div className="-mt-4 mb-4 flex justify-end">
          <Link to="/auth" className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
            Admin Login
          </Link>
        </div>
        <header className="text-center">
          <img
            src={logoUrl}
            alt="ঢাকা টিউশন হাব — Dhaka Tuition Hub"
            className="mx-auto h-28 w-auto sm:h-32"
          />

          <h1 className="mt-5 font-display text-3xl font-bold leading-snug text-foreground sm:text-4xl">
            আপনার সন্তানের জন্য টিউটর খুঁজছেন?
          </h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            নিচের তথ্যগুলো পূরণ করুন। আপনার দেওয়া তথ্য অনুযায়ী আমরা উপযুক্ত
            টিউটর খুঁজে দেওয়ার চেষ্টা করব।
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="form-card mt-8 space-y-8 rounded-3xl border border-border bg-card px-5 py-7 sm:px-8 sm:py-9"
        >
          <FieldShell
            number="১"
            label="শিক্ষার্থীর শ্রেণি"
            error={errors.studentClass}
          >
            <p className="pl-10 text-sm font-medium text-foreground">
              শিক্ষার্থীর শ্রেণি নির্বাচন করুন
            </p>
            <div className="relative pl-0">
              <select
                value={form.studentClass}
                onChange={(event) => update("studentClass", event.target.value)}
                aria-label="শিক্ষার্থীর শ্রেণি নির্বাচন করুন"
                className={
                  inputClass +
                  " appearance-none pr-10 " +
                  (form.studentClass ? "" : "text-muted-foreground/70")
                }
              >
                <option value="" disabled>
                  শ্রেণি নির্বাচন করুন
                </option>
                {CLASS_OPTIONS.map((option) => (
                  <option key={option} value={option} className="text-foreground">
                    {option}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </FieldShell>

          <FieldShell
            number="২"
            label="বিষয়"
            description="কোন বিষয়ের জন্য টিউটর প্রয়োজন?"
            error={errors.subject}
          >
            <div className="relative">
              <BookOpen className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={form.subject}
                onChange={(event) => update("subject", event.target.value)}
                maxLength={120}
                placeholder="বিষয় লিখুন"
                aria-label="বিষয়"
                className={inputClass + " pl-11"}
              />
            </div>
            <p className="pl-1 text-sm text-muted-foreground">
              উদাহরণ: গণিত, পদার্থবিজ্ঞান, রসায়ন, ইংরেজি, জীববিজ্ঞান, আইসিটি
              ইত্যাদি।
            </p>
          </FieldShell>

          <FieldShell
            number="৩"
            label="শিক্ষার্থীর লিঙ্গ"
            description="শিক্ষার্থী ছেলে নাকি মেয়ে?"
            error={errors.studentGender}
          >
            <div className="flex gap-3">
              <ChoicePill
                label="ছেলে"
                selected={form.studentGender === "boy"}
                onSelect={() => update("studentGender", "boy")}
                invalid={Boolean(errors.studentGender)}
              />
              <ChoicePill
                label="মেয়ে"
                selected={form.studentGender === "girl"}
                onSelect={() => update("studentGender", "girl")}
                invalid={Boolean(errors.studentGender)}
              />
            </div>
          </FieldShell>

          <FieldShell
            number="৪"
            label="লোকেশন"
            description="যেখানে টিউটর পড়াবেন সেই এলাকার নাম লিখুন"
            error={errors.location}
          >
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={form.location}
                onChange={(event) => update("location", event.target.value)}
                maxLength={120}
                placeholder="আপনার এলাকার নাম লিখুন"
                aria-label="লোকেশন"
                className={inputClass + " pl-11"}
              />
            </div>
            <p className="pl-1 text-sm text-muted-foreground">
              উদাহরণ: মিরপুর ১০, ধানমন্ডি, উত্তরা, মোহাম্মদপুর ইত্যাদি।
            </p>
          </FieldShell>

          <FieldShell
            number="৫"
            label="আপনার ফোন নম্বর"
            description="গার্ডিয়ানের ফোন নম্বর দিন"
            error={errors.guardianPhone}
          >
            <div className="relative">
              <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="tel"
                inputMode="numeric"
                value={form.guardianPhone}
                onChange={(event) => update("guardianPhone", event.target.value)}
                maxLength={14}
                placeholder="01XXXXXXXXX"
                aria-label="আপনার ফোন নম্বর"
                className={inputClass + " pl-11"}
              />
            </div>
          </FieldShell>

          <FieldShell
            number="৬"
            label="WhatsApp নম্বর"
            description="আপনার WhatsApp নম্বর দিন"
            optional
            error={errors.whatsappPhone}
          >
            <div className="relative">
              <MessageCircle className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="tel"
                inputMode="numeric"
                value={form.whatsappPhone}
                onChange={(event) => update("whatsappPhone", event.target.value)}
                maxLength={14}
                placeholder="01XXXXXXXXX"
                aria-label="WhatsApp নম্বর"
                className={inputClass + " pl-11"}
              />
            </div>
            <p className="pl-1 text-sm text-muted-foreground">
              WhatsApp নম্বর না থাকলে এই ঘরটি ফাঁকা রাখতে পারেন।
            </p>
          </FieldShell>

          <FieldShell
            number="৭"
            label="কেমন টিউটর চান?"
            description="আপনার পছন্দের টিউটর নির্বাচন করুন"
            error={errors.tutorPreference}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <ChoicePill
                label="ছেলে টিউটর"
                selected={form.tutorPreference === "male"}
                onSelect={() => update("tutorPreference", "male")}
                invalid={Boolean(errors.tutorPreference)}
              />
              <ChoicePill
                label="মেয়ে টিউটর"
                selected={form.tutorPreference === "female"}
                onSelect={() => update("tutorPreference", "female")}
                invalid={Boolean(errors.tutorPreference)}
              />
              <ChoicePill
                label="যেকোনো একজন"
                selected={form.tutorPreference === "any"}
                onSelect={() => update("tutorPreference", "any")}
                invalid={Boolean(errors.tutorPreference)}
              />
            </div>
          </FieldShell>

          <FieldShell
            number="৮"
            label="টিউটর রিকোয়ারমেন্ট"
            description="আপনার বিশেষ কোনো চাহিদা থাকলে এখানে লিখুন"
            optional
          >
            <div className="relative">
              <ClipboardList className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-muted-foreground" />
              <textarea
                value={form.requirements}
                onChange={(event) => update("requirements", event.target.value)}
                maxLength={1000}
                rows={4}
                placeholder="আপনার টিউটর রিকোয়ারমেন্ট লিখুন..."
                aria-label="টিউটর রিকোয়ারমেন্ট"
                className="w-full resize-none rounded-xl border border-input bg-card py-3 pl-11 pr-4 text-base text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <ul className="pl-1 list-inside list-disc space-y-1 text-sm text-muted-foreground">
              <li>নির্দিষ্ট বিশ্ববিদ্যালয়ের শিক্ষার্থী চাই</li>
              <li>অভিজ্ঞ টিউটর চাই</li>
              <li>বাসার কাছাকাছি টিউটর চাই</li>
              <li>ভালো CGPA-এর টিউটর চাই</li>
              <li>নির্দিষ্ট সময়ে পড়াতে পারবেন এমন টিউটর চাই</li>
            </ul>
            <p className="pl-1 text-sm text-muted-foreground">
              এই অংশটি পূরণ করা বাধ্যতামূলক নয়।
            </p>
          </FieldShell>

          <div className="space-y-4 border-t border-border pt-6">
            <p className="text-center text-sm font-medium text-foreground">
              আপনার তথ্য ঠিক আছে কি না দেখে Apply করুন
            </p>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-60"
            >
              {mutation.isPending ? (
                "পাঠানো হচ্ছে..."
              ) : (
                <>
                  <UserRound className="h-5 w-5" />
                  টিউটর খুঁজুন / APPLY NOW
                </>
              )}
            </button>
            {serverError ? (
              <p className="text-center text-sm font-medium text-destructive">
                {serverError}
              </p>
            ) : null}
            <p className="text-center text-sm text-muted-foreground">
              আপনার তথ্য পাওয়ার পর আমাদের টিম আপনার সাথে যোগাযোগ করবে এবং আপনার
              প্রয়োজন অনুযায়ী উপযুক্ত টিউটর খুঁজে দেওয়ার চেষ্টা করবে।
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
