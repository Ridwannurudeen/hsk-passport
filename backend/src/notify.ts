// Email notifications via Resend. Gracefully no-ops when RESEND_API_KEY is not set.
// Resend docs: https://resend.com/docs/api-reference/emails/send-email

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const FROM_ADDRESS = process.env.RESEND_FROM || "HSK Passport <notify@hskpassport.gudman.xyz>";

export const emailConfig = {
  enabled: Boolean(RESEND_API_KEY),
  from: FROM_ADDRESS,
};

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

async function sendViaResend(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${errBody.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message.slice(0, 200) };
  }
}

const BRAND_COLOR = "#2e5fe8";
const TEXT_COLOR = "#0a0b0d";
const MUTED_COLOR = "#6c7380";
const BORDER_COLOR = "#e7e9ed";

function wrap(body: string, preview: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>HSK Passport</title></head>
<body style="margin:0;padding:24px;background:#fafbfc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:${TEXT_COLOR};">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;color:transparent;">${preview}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
    <tr><td style="padding:20px 0 16px;">
      <a href="https://hskpassport.gudman.xyz" style="color:${TEXT_COLOR};text-decoration:none;font-weight:600;font-size:16px;">HSK Passport</a>
      <div style="color:${MUTED_COLOR};font-size:12px;">The default compliance layer for HashKey Chain</div>
    </td></tr>
    <tr><td style="background:#fff;border:1px solid ${BORDER_COLOR};border-radius:14px;padding:24px;">
      ${body}
    </td></tr>
    <tr><td style="padding:16px 0;color:${MUTED_COLOR};font-size:11px;line-height:1.5;">
      You received this because you requested email updates during your verification at hskpassport.gudman.xyz.
      We never send marketing — only transactional updates about your on-chain credential.
    </td></tr>
  </table>
</body></html>`;
}

export async function notifyCredentialApproved(args: {
  email: string;
  credentialType: string;
  txHash?: string | null;
  commitment: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfig.enabled) return { ok: false, error: "email disabled" };

  const explorerUrl = args.txHash
    ? `https://hashkey-testnet.blockscout.com/tx/${args.txHash}`
    : null;

  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${TEXT_COLOR};">Your credential is live on-chain</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_COLOR};">
      Your <strong>${escapeHtml(args.credentialType)}</strong> verification is complete and a zero-knowledge credential has been issued to your wallet on HashKey Chain testnet.
    </p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:${MUTED_COLOR};">
      You can now prove your eligibility to any dApp on HashKey Chain without revealing your identity.
    </p>
    ${explorerUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${BRAND_COLOR};padding:11px 20px;">
          <a href="${explorerUrl}" style="color:#fff;text-decoration:none;font-size:14px;font-weight:500;">View on-chain transaction →</a>
        </td></tr></table>`
      : ""
    }
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${BORDER_COLOR};font-size:12px;color:${MUTED_COLOR};">
      Try a dApp: <a href="https://hskpassport.gudman.xyz/demo" style="color:${BRAND_COLOR};">mint hSILVER</a> · manage your identity at <a href="https://hskpassport.gudman.xyz/user" style="color:${BRAND_COLOR};">your dashboard</a>.
    </p>
  `;

  return sendViaResend({
    to: args.email,
    subject: `Your ${args.credentialType} credential is live on HashKey Chain`,
    html: wrap(body, "Your HSK Passport credential is ready. View the on-chain transaction."),
    text: `Your ${args.credentialType} credential is live on HashKey Chain testnet.${explorerUrl ? `\n\nTransaction: ${explorerUrl}` : ""}\n\nTry a gated dApp: https://hskpassport.gudman.xyz/demo\nManage: https://hskpassport.gudman.xyz/user\n`,
  });
}

export async function notifyCredentialRejected(args: {
  email: string;
  credentialType: string;
  reason?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfig.enabled) return { ok: false, error: "email disabled" };

  const reason = args.reason && args.reason.length > 0 ? args.reason : "The reviewer could not confirm your identity from the submitted documents.";

  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${TEXT_COLOR};">Verification could not be completed</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${TEXT_COLOR};">
      Your <strong>${escapeHtml(args.credentialType)}</strong> verification was not approved.
    </p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.55;color:${MUTED_COLOR};">
      ${escapeHtml(reason)}
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:10px;background:${BRAND_COLOR};padding:11px 20px;">
      <a href="https://hskpassport.gudman.xyz/kyc" style="color:#fff;text-decoration:none;font-size:14px;font-weight:500;">Try verification again →</a>
    </td></tr></table>
    <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${BORDER_COLOR};font-size:12px;color:${MUTED_COLOR};">
      Common causes: unclear document photo, face didn&apos;t match the selfie, document country not supported in this level. Use a clear, well-lit photo of a government-issued ID.
    </p>
  `;

  return sendViaResend({
    to: args.email,
    subject: "HSK Passport — verification could not be completed",
    html: wrap(body, "Your HSK Passport verification needs another attempt."),
    text: `Your ${args.credentialType} verification was not approved.\n\nReason: ${reason}\n\nRetry: https://hskpassport.gudman.xyz/kyc\n`,
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
