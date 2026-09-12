
import nodemailer from "nodemailer";

export type AuthEmailKind = "password_reset" | "email_verification";
export type AuthEmailLocale = "zh" | "en" | "fr" | "de" | "ja" | "ko";

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeLocale(raw?: string | null): AuthEmailLocale {
  const lower = String(raw || "").toLowerCase();
  if (/(^|[\s,;])zh|zh-cn|zh-hans|zh-hk|zh-tw/.test(lower)) return "zh";
  if (/(^|[\s,;])fr|fr-fr/.test(lower)) return "fr";
  if (/(^|[\s,;])de|de-de/.test(lower)) return "de";
  if (/(^|[\s,;])ja|ja-jp/.test(lower)) return "ja";
  if (/(^|[\s,;])ko|ko-kr/.test(lower)) return "ko";
  return "en";
}

export function detectAuthEmailLocale(acceptLanguageHeader?: string | null): AuthEmailLocale {
  return normalizeLocale(acceptLanguageHeader);
}

function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h.endsWith(".local");
}

export function resolvePublicAppBaseUrl(input?: {
  requestOrigin?: string | null;
  appBaseUrl?: string | null;
}): string {
  const configured = (input?.appBaseUrl || process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (isLocalHost(parsed.hostname)) return "https://arkagentic.com";
      return configured.replace(/\/$/, "");
    } catch {
      return "https://arkagentic.com";
    }
  }

  const origin = (input?.requestOrigin || "").trim();
  if (!origin) return "https://arkagentic.com";
  try {
    const parsed = new URL(origin);
    if (isLocalHost(parsed.hostname)) return "https://arkagentic.com";
    return origin.replace(/\/$/, "");
  } catch {
    return "https://arkagentic.com";
  }
}

type CopyBlock = {
  subject: string;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  expiry: string;
  fallback: string;
  ignore: string;
};

const COPY: Record<AuthEmailLocale, Record<AuthEmailKind, CopyBlock>> = {
  zh: {
    password_reset: {
      subject: "ArkAgentic 密码重置",
      eyebrow: "账户安全通知",
      title: "重置你的 ArkAgentic 密码",
      body: "我们收到了你的密码重置请求。点击下方按钮继续操作。",
      cta: "重置密码",
      expiry: "该链接 15 分钟内有效，且仅可使用一次。",
      fallback: "如果按钮无法点击，请复制以下链接到浏览器：",
      ignore: "如果这不是你的操作，可以直接忽略本邮件。",
    },
    email_verification: {
      subject: "ArkAgentic 邮箱确认",
      eyebrow: "欢迎加入 ArkAgentic",
      title: "确认你的邮箱地址",
      body: "请先完成邮箱确认，以确保账号安全并开启完整功能。",
      cta: "确认邮箱",
      expiry: "该链接 24 小时内有效，且仅可使用一次。",
      fallback: "如果按钮无法点击，请复制以下链接到浏览器：",
      ignore: "如果你没有注册 ArkAgentic 账号，请忽略本邮件。",
    },
  },
  en: {
    password_reset: {
      subject: "ArkAgentic Password Reset",
      eyebrow: "Account Security",
      title: "Reset your ArkAgentic password",
      body: "We received a request to reset your password. Use the button below to continue.",
      cta: "Reset Password",
      expiry: "This link expires in 15 minutes and can only be used once.",
      fallback: "If the button does not work, copy this link into your browser:",
      ignore: "If you did not request this, you can safely ignore this email.",
    },
    email_verification: {
      subject: "ArkAgentic Email Verification",
      eyebrow: "Welcome to ArkAgentic",
      title: "Verify your email address",
      body: "Please verify your email to secure your account and unlock full access.",
      cta: "Verify Email",
      expiry: "This link expires in 24 hours and can only be used once.",
      fallback: "If the button does not work, copy this link into your browser:",
      ignore: "If you did not create an ArkAgentic account, you can ignore this email.",
    },
  },
  fr: {
    password_reset: {
      subject: "Réinitialisation du mot de passe ArkAgentic",
      eyebrow: "Sécurité du compte",
      title: "Réinitialisez votre mot de passe ArkAgentic",
      body: "Nous avons reçu une demande de réinitialisation de votre mot de passe. Utilisez le bouton ci-dessous pour continuer.",
      cta: "Réinitialiser le mot de passe",
      expiry: "Ce lien expire dans 15 minutes et ne peut être utilisé qu'une seule fois.",
      fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
      ignore: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail.",
    },
    email_verification: {
      subject: "Vérification de l'e-mail ArkAgentic",
      eyebrow: "Bienvenue sur ArkAgentic",
      title: "Vérifiez votre adresse e-mail",
      body: "Veuillez vérifier votre e-mail pour sécuriser votre compte et activer toutes les fonctionnalités.",
      cta: "Vérifier l'e-mail",
      expiry: "Ce lien expire dans 24 heures et ne peut être utilisé qu'une seule fois.",
      fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
      ignore: "Si vous n'avez pas créé de compte ArkAgentic, vous pouvez ignorer cet e-mail.",
    },
  },
  de: {
    password_reset: {
      subject: "ArkAgentic Passwort zurücksetzen",
      eyebrow: "Kontosicherheit",
      title: "Setzen Sie Ihr ArkAgentic-Passwort zurück",
      body: "Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten. Verwenden Sie die Schaltfläche unten, um fortzufahren.",
      cta: "Passwort zurücksetzen",
      expiry: "Dieser Link ist 15 Minuten gültig und kann nur einmal verwendet werden.",
      fallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
      ignore: "Wenn Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.",
    },
    email_verification: {
      subject: "ArkAgentic E-Mail-Bestätigung",
      eyebrow: "Willkommen bei ArkAgentic",
      title: "Bestätigen Sie Ihre E-Mail-Adresse",
      body: "Bitte bestätigen Sie Ihre E-Mail, um Ihr Konto zu sichern und den vollen Zugriff freizuschalten.",
      cta: "E-Mail bestätigen",
      expiry: "Dieser Link ist 24 Stunden gültig und kann nur einmal verwendet werden.",
      fallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
      ignore: "Wenn Sie kein ArkAgentic-Konto erstellt haben, können Sie diese E-Mail ignorieren.",
    },
  },
  ja: {
    password_reset: {
      subject: "ArkAgentic パスワード再設定",
      eyebrow: "アカウントセキュリティ",
      title: "ArkAgentic のパスワードを再設定",
      body: "パスワード再設定のリクエストを受け付けました。下のボタンから続行してください。",
      cta: "パスワードを再設定",
      expiry: "このリンクは 15 分間有効で、1 回のみ使用できます。",
      fallback: "ボタンが機能しない場合は、次のリンクをブラウザに貼り付けてください：",
      ignore: "心当たりがない場合は、このメールを無視してください。",
    },
    email_verification: {
      subject: "ArkAgentic メール確認",
      eyebrow: "ArkAgentic へようこそ",
      title: "メールアドレスを確認してください",
      body: "アカウント保護と全機能の有効化のため、メール確認を完了してください。",
      cta: "メールを確認",
      expiry: "このリンクは 24 時間有効で、1 回のみ使用できます。",
      fallback: "ボタンが機能しない場合は、次のリンクをブラウザに貼り付けてください：",
      ignore: "ArkAgentic アカウントを作成していない場合は、このメールを無視してください。",
    },
  },
  ko: {
    password_reset: {
      subject: "ArkAgentic 비밀번호 재설정",
      eyebrow: "계정 보안",
      title: "ArkAgentic 비밀번호 재설정",
      body: "비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 눌러 계속 진행해 주세요.",
      cta: "비밀번호 재설정",
      expiry: "이 링크는 15분 동안 유효하며 한 번만 사용할 수 있습니다.",
      fallback: "버튼이 동작하지 않으면 아래 링크를 브라우저에 붙여넣어 주세요:",
      ignore: "요청한 적이 없다면 이 이메일을 무시하셔도 됩니다.",
    },
    email_verification: {
      subject: "ArkAgentic 이메일 인증",
      eyebrow: "ArkAgentic에 오신 것을 환영합니다",
      title: "이메일 주소를 인증해 주세요",
      body: "계정 보안 및 전체 기능 사용을 위해 이메일 인증을 완료해 주세요.",
      cta: "이메일 인증",
      expiry: "이 링크는 24시간 동안 유효하며 한 번만 사용할 수 있습니다.",
      fallback: "버튼이 동작하지 않으면 아래 링크를 브라우저에 붙여넣어 주세요:",
      ignore: "ArkAgentic 계정을 생성하지 않았다면 이 이메일을 무시하셔도 됩니다.",
    },
  },
};

function getCopy(kind: AuthEmailKind, locale: AuthEmailLocale): CopyBlock {
  return COPY[locale][kind];
}

function renderHtml(kind: AuthEmailKind, locale: AuthEmailLocale, actionUrl: string) {
  const c = getCopy(kind, locale);
  const safeUrl = escapeHtml(actionUrl);

  return `
  <div style="margin:0;padding:0;background:#f6f2ea;font-family:Inter,'Segoe UI',Arial,sans-serif;color:#1f2937;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px 40px 16px;">
      <div style="border:1px solid rgba(180,105,61,0.28);border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 18px 44px rgba(92,56,19,0.12);">
        <div style="padding:20px 26px;background:linear-gradient(135deg,#fff7ed 0%,#fdebd4 52%,#f5d7b0 100%);border-bottom:1px solid rgba(180,105,61,0.2);">
          <div style="margin-top:8px;font-size:28px;line-height:1.1;font-weight:550;letter-spacing:0.01em;">
            <span style="color:#1c1917;font-weight:550;">Ark</span><span style="display:inline-block;color:#d7963a;font-weight:550;background-image:linear-gradient(90deg,#d8a45b,#d7963a,#b4693d);background-size:100% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;">Agentic</span>
          </div>
        </div>
        <div style="padding:26px;">
          <h1 style="margin:0 0 10px 0;font-size:22px;line-height:1.3;color:#111827;font-weight:600;">${escapeHtml(c.title)}</h1>
          <p style="margin:0 0 16px 0;font-size:14px;line-height:1.7;color:#374151;font-weight:400;">${escapeHtml(c.body)}</p>
          <p style="margin:0 0 16px 0;font-size:13px;line-height:1.6;color:#6b7280;font-weight:400;">${escapeHtml(c.expiry)}</p>
          <p style="margin:18px 0 18px 0;">
            <a href="${safeUrl}" style="display:inline-block;padding:11px 18px;border-radius:11px;background-color:#b4693d;background-image:linear-gradient(90deg,#d8a45b,#d7963a,#b4693d);color:#ffffff !important;text-decoration:none;font-size:14px;font-weight:600;line-height:1.2;mso-line-height-rule:exactly;">
              ${escapeHtml(c.cta)}
            </a>
          </p>
          <p style="margin:0 0 8px 0;font-size:13px;line-height:1.6;color:#6b7280;">${escapeHtml(c.fallback)}</p>
          <p style="margin:0;font-size:13px;line-height:1.7;color:#92400e;word-break:break-word;overflow-wrap:anywhere;word-wrap:break-word;white-space:normal;">
            <a href="${safeUrl}" style="color:#92400e;text-decoration:underline;word-break:break-word;overflow-wrap:anywhere;word-wrap:break-word;white-space:normal;">${safeUrl}</a>
          </p>
          <hr style="border:none;border-top:1px solid rgba(231,229,228,1);margin:22px 0;" />
          <p style="margin:0;font-size:12px;line-height:1.6;color:#78716c;">${escapeHtml(c.ignore)}</p>
        </div>
      </div>
    </div>
  </div>`;
}

export async function sendAuthEmail(input: {
  to: string;
  kind: AuthEmailKind;
  actionUrl: string;
  locale: AuthEmailLocale;
}) {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const fromAddress = process.env.SMTP_FROM || "support@arkagentic.com";

  if (!smtpUser || !smtpPass) {
    console.warn("[auth-email] SMTP_USER/SMTP_PASS not configured, skip sending email");
    return { mode: "mock" as const };
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

  const copy = getCopy(input.kind, input.locale);
  const html = renderHtml(input.kind, input.locale, input.actionUrl);
  const text = `${copy.title}

${copy.body}
${copy.expiry}

${input.actionUrl}

${copy.ignore}`;

  await transporter.sendMail({
    from: `ArkAgentic Security <${fromAddress}>`,
    to: input.to,
    subject: copy.subject,
    sender: smtpUser,
    html,
    text,
  });

  return { mode: "smtp" as const };
}
