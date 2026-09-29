/**
 * AUTHSEC-1 — auth transactional emails (password reset, verification,
 * password-changed notice).
 * ─────────────────────────────────────────────────────────────────────────────
 * Same email-safe construction as the notification digest: 100% inline styles,
 * table-based layout, stone/orange Vendora palette, everything escaped.
 */

const FONT = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;`
const ACCENT = '#ea580c'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface AuthEmail {
  subject: string
  html: string
  text: string
}

/** Shared shell — matches the digest email look (orange header card, white body). */
function renderAuthEmail(opts: {
  eyebrow: string
  heading: string
  bodyHtml: string
  footerNote: string
}): string {
  const { eyebrow, heading, bodyHtml, footerNote } = opts
  const year = new Date().getFullYear()
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="support-color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f4;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;${FONT}">
  <tr><td style="padding:0 8px 12px 12px;">
    <span style="font-size:12px;color:#a8a29e;letter-spacing:0.4px;">Vendora · ${escapeHtml(eyebrow)}</span>
  </td></tr>
  <tr><td style="background-color:${ACCENT};border-radius:16px 16px 0 0;padding:26px 32px;">
    <span style="font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:0.5px;">Vendora</span>
    <span style="display:block;margin-top:6px;font-size:13px;color:rgba(255,255,255,0.85);">The solar energy marketplace.</span>
  </td></tr>
  <tr><td style="background-color:#ffffff;border-left:1px solid #e7e5e4;border-right:1px solid #e7e5e4;padding:30px 32px 8px;">
    <h1 style="margin:0;font-size:21px;line-height:1.3;color:#1c1917;">${escapeHtml(heading)}</h1>
${bodyHtml}
  </td></tr>
  <tr><td style="background-color:#fafaf9;border:1px solid #e7e5e4;border-top:none;border-radius:0 0 16px 16px;padding:22px 32px;">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#78716c;">${escapeHtml(footerNote)}</p>
    <p style="margin:14px 0 0;font-size:11px;color:#d6d3d1;">&copy; ${year} Vendora</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

/** Orange pill CTA button (email-client safe). */
function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px;">
<tr><td style="background-color:${ACCENT};border-radius:10px;">
<a href="${href}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr>
</table>
<p style="margin:12px 0 22px;font-size:12px;line-height:1.7;color:#a8a29e;word-break:break-all;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${href}" style="color:#ea580c;">${href}</a></p>`
}

export function passwordResetEmail(input: { name: string; resetUrl: string }): AuthEmail {
  const { name, resetUrl } = input
  const firstName = name.split(' ')[0] || 'there'
  return {
    subject: 'Reset your Vendora password',
    html: renderAuthEmail({
      eyebrow: 'Password reset',
      heading: `Reset your password`,
      bodyHtml: `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#57534e;">
    Hi ${escapeHtml(firstName)}, we received a request to reset the password on your Vendora account.
  </p>
  ${ctaButton(resetUrl, 'Choose a new password')}
  <p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:#78716c;">
    <strong style="color:#57534e;">This link expires in 60 minutes</strong> and can only be used once.
    If you didn't request a reset, you can safely ignore this email — your current password keeps working.
  </p>`,
      footerNote:
        'You are receiving this because a password reset was requested for your account. Never share this link with anyone.',
    }),
    text: `Hi ${firstName},\n\nWe received a request to reset your Vendora password.\n\nOpen this link to choose a new one (expires in 60 minutes, single use):\n${resetUrl}\n\nIf you didn't request a reset, ignore this email — your current password keeps working.\n\n— Vendora`,
  }
}

export function passwordChangedEmail(input: { name: string }): AuthEmail {
  const { name } = input
  const firstName = name.split(' ')[0] || 'there'
  return {
    subject: 'Your Vendora password was changed',
    html: renderAuthEmail({
      eyebrow: 'Security notice',
      heading: 'Your password was changed',
      bodyHtml: `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#57534e;">
    Hi ${escapeHtml(firstName)}, your Vendora password was just changed successfully.
  </p>
  <p style="margin:16px 0 22px;font-size:13px;line-height:1.6;color:#78716c;">
    For your security, <strong style="color:#57534e;">all active sessions were signed out</strong> — you'll need to sign in again on every device.
    If this wasn't you, reset your password immediately from the "Forgot password?" link on the sign-in screen.
  </p>`,
      footerNote:
        'You are receiving this because your account password changed. No action is needed if you made this change.',
    }),
    text: `Hi ${firstName},\n\nYour Vendora password was changed and all sessions were signed out.\nIf this wasn't you, reset your password immediately via the "Forgot password?" link.\n\n— Vendora`,
  }
}

export function emailVerificationEmail(input: { name: string; verifyUrl: string }): AuthEmail {
  const { name, verifyUrl } = input
  const firstName = name.split(' ')[0] || 'there'
  return {
    subject: 'Verify your email for Vendora',
    html: renderAuthEmail({
      eyebrow: 'Email verification',
      heading: 'Confirm your email address',
      bodyHtml: `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#57534e;">
    Welcome, ${escapeHtml(firstName)}! Confirm your email to secure your Vendora account.
  </p>
  ${ctaButton(verifyUrl, 'Verify my email')}
  <p style="margin:0 0 22px;font-size:13px;line-height:1.6;color:#78716c;">
    <strong style="color:#57534e;">This link expires in 48 hours.</strong>
    You can also request a fresh one anytime from Account → Security.
  </p>`,
      footerNote:
        'You are receiving this because you created a Vendora account (or requested a new verification link).',
    }),
    text: `Welcome, ${firstName}!\n\nConfirm your email address by opening this link (expires in 48 hours):\n${verifyUrl}\n\n— Vendora`,
  }
}
