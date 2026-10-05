import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isValidBdPhone, normalizeBdPhone } from "./bd-phone";

const inputSchema = z.object({
  studentClass: z.string().trim().min(1).max(50),
  subject: z.string().trim().min(1).max(120),
  studentGender: z.enum(["boy", "girl"]),
  location: z.string().trim().min(1).max(120),
  guardianPhone: z.string().max(20),
  whatsappPhone: z.string().max(20).optional(),
  tutorPreference: z.enum(["male", "female", "any"]),
  requirements: z.string().trim().max(1000).optional(),
});

export type SubmitTutorRequestInput = z.infer<typeof inputSchema>;
export type SubmitTutorRequestResult =
  | { ok: true }
  | { ok: false; error: string };

export const submitTutorRequest = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<SubmitTutorRequestResult> => {
    const guardianPhone = normalizeBdPhone(data.guardianPhone);
    const whatsappPhone = data.whatsappPhone
      ? normalizeBdPhone(data.whatsappPhone)
      : null;

    if (!isValidBdPhone(guardianPhone)) {
      return { ok: false, error: "সঠিক ফোন নম্বর দিন (যেমন: 01712345678)" };
    }
    if (whatsappPhone && !isValidBdPhone(whatsappPhone)) {
      return { ok: false, error: "সঠিক WhatsApp নম্বর দিন বা ঘরটি ফাঁকা রাখুন" };
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );

    // Rate limit: at most 3 requests per phone number per hour.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabaseAdmin
      .from("tutor_requests")
      .select("id", { count: "exact", head: true })
      .eq("guardian_phone", guardianPhone)
      .gte("created_at", oneHourAgo);

    if ((recentCount ?? 0) >= 3) {
      return {
        ok: false,
        error: "এই নম্বর থেকে অতিরিক্ত আবেদন পাওয়া গেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।",
      };
    }

    // Duplicate guard: identical request within the last 10 minutes.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: dupeCount } = await supabaseAdmin
      .from("tutor_requests")
      .select("id", { count: "exact", head: true })
      .eq("guardian_phone", guardianPhone)
      .eq("student_class", data.studentClass)
      .eq("subject", data.subject)
      .gte("created_at", tenMinutesAgo);

    if ((dupeCount ?? 0) > 0) {
      return {
        ok: false,
        error: "একই তথ্য সম্প্রতি পাঠানো হয়েছে। আমাদের টিম শীঘ্রই যোগাযোগ করবে।",
      };
    }

    const { data: saved, error } = await supabaseAdmin
      .from("tutor_requests")
      .insert({
        student_class: data.studentClass,
        subject: data.subject,
        student_gender: data.studentGender,
        location: data.location,
        guardian_phone: guardianPhone,
        whatsapp_phone: whatsappPhone,
        tutor_preference: data.tutorPreference,
        requirements: data.requirements || null,
      })
      .select("id, app_no")
      .single();

    if (error || !saved) {
      console.error("[tutor_requests] insert failed:", error?.message);
      return { ok: false, error: "তথ্য পাঠানো যায়নি। আবার চেষ্টা করুন।" };
    }

    try {
      const { notifyOwnerOfApplication } = await import("./owner-notify.server");
      await notifyOwnerOfApplication(saved);
    } catch (e) {
      console.error("[owner-notify] unexpected failure:", e);
    }

    return { ok: true };
  });
