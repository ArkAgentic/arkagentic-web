import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

type ContactBody = {
  name?: string;
  email?: string;
  message?: string;
};

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as ContactBody;
  const name = (body.name || "").trim();
  const email = (body.email || "").trim();
  const message = (body.message || "").trim();

  if (!name || !email || !message) {
    return NextResponse.json({ error: "name, email, message are required" }, { status: 400 });
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const supportInbox = "support@arkagentic.com";
  const fromAddress = "support@arkagentic.com";
  const submittedAt = new Date().toISOString();

  if (!smtpUser || !smtpPass) {
    console.warn("[contact] SMTP_USER/SMTP_PASS not configured, returning mock success");
    return NextResponse.json({ ok: true, mode: "mock" });
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  });

  const html = `
    <div style="font-family:Inter,Segoe UI,Arial,sans-serif;color:#1f2937;line-height:1.6;max-width:680px;">
      <h2 style="margin:0 0 12px 0;color:#111827;">New Enterprise Contact Request</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px;">Name</td><td style="padding:6px 0;color:#111827;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Work Email</td><td style="padding:6px 0;color:#111827;">${escapeHtml(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280;">Submitted At</td><td style="padding:6px 0;color:#111827;">${escapeHtml(submittedAt)}</td></tr>
      </table>
      <div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;white-space:pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `ArkAgentic Support <${fromAddress}>`,
      to: supportInbox,
      subject: `[ArkAgentic] Contact Request from ${name}`,
      replyTo: email,
      sender: smtpUser,
      html,
      text: `Name: ${name}\nWork Email: ${email}\nSubmitted At: ${submittedAt}\n\nMessage:\n${message}`,
    });

    return NextResponse.json({ ok: true, mode: "smtp" });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to send contact email";
    return NextResponse.json({ error: messageText }, { status: 502 });
  }
}
