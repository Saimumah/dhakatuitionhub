// Server-only: notifies the owner about a new guardian application.
// Never throws — a failed notification must not block the submission.
// Delivery result is stored on the application row (notification_status /
// notification_error) so pending notifications can be retried later.

type AppRow = { id: string; app_no: number };

export async function notifyOwnerOfApplication(app: AppRow): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ownerEmail = process.env["OWNER_NOTIFICATION_EMAIL"];

  let status = "pending";
  let error: string | null = null;

  try {
    if (!ownerEmail) {
      error = "OWNER_NOTIFICATION_EMAIL not configured";
    } else {
      // Email sending activates once an email domain is connected.
      // Until then the application is saved and the notification is queued.
      error = "email_domain_not_configured";
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) console.warn(`[owner-notify] application #${app.app_no}: ${error}`);
  await supabaseAdmin
    .from("tutor_requests")
    .update({ notification_status: status, notification_error: error })
    .eq("id", app.id);
}
