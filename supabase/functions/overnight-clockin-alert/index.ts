// @ts-nocheck
// Texts the owner when an employee's shift started on one day and they are
// still clocked in after 01:00 the next day. Run on a schedule (see README).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIMEZONE = Deno.env.get("ALERT_TIMEZONE") ?? "Europe/London";
const CUTOFF_HOUR = Number(Deno.env.get("ALERT_CUTOFF_HOUR") ?? "1");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Current date (YYYY-MM-DD) and hour in the business timezone.
function localNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

function nextDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function isOverdue(shiftDate: string, now: { date: string; hour: number }) {
  const due = nextDay(shiftDate);
  return now.date > due || (now.date === due && now.hour >= CUTOFF_HOUR);
}

async function sendSms(body: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID")!;
  const token = Deno.env.get("TWILIO_AUTH_TOKEN")!;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${sid}:${token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: Deno.env.get("ALERT_TO_NUMBER")!,
      From: Deno.env.get("TWILIO_FROM_NUMBER")!,
      Body: body,
    }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || request.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = localNow();

  const { data: open, error } = await admin
    .from("device_shifts")
    .select("user_id, local_id, employee_name, date, clock_in_time")
    .is("clock_out_time", null);
  if (error) return json({ error: error.message }, 500);

  const sent: string[] = [];
  const failed: string[] = [];
  for (const shift of (open ?? []).filter((s) => isOverdue(s.date, now))) {
    // Claim the alert first; if it's already there, this shift was already texted.
    const { data: claimed, error: claimError } = await admin
      .from("shift_alerts")
      .upsert({ user_id: shift.user_id, shift_local_id: shift.local_id }, { onConflict: "user_id,shift_local_id", ignoreDuplicates: true })
      .select();
    if (claimError || !claimed?.length) continue;

    const [y, m, d] = shift.date.split("-");
    try {
      await sendSms(
        `TimeBytes: ${shift.employee_name} clocked in on ${d}/${m}/${y} at ${shift.clock_in_time.slice(0, 5)} and is still clocked in past ${String(CUTOFF_HOUR).padStart(2, "0")}:00.`,
      );
      sent.push(shift.employee_name);
    } catch (e) {
      // Release the claim so the next run retries.
      await admin.from("shift_alerts").delete().eq("user_id", shift.user_id).eq("shift_local_id", shift.local_id);
      failed.push(`${shift.employee_name}: ${e.message}`);
    }
  }
  return json({ checked: open?.length ?? 0, sent, failed }, failed.length ? 500 : 200);
});
