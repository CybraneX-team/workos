import nodemailer from 'nodemailer';
import { env } from '../config.js';

const port = Number(env.SMTP_PORT);
const transporter = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: port === 587,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : null;

if (transporter) {
  transporter.verify().then(() => {
    console.log('[mailer] SMTP connection verified ✓');
  }).catch((err) => {
    console.error('[mailer] SMTP connection FAILED:', err.message);
  });
}

export async function sendMail(opts: { to: string; subject: string; html: string }) {
  if (!transporter) {
    console.warn('[mailer] SMTP not configured, skipping send to', opts.to);
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });
    console.log('[mailer] sent to', opts.to, 'messageId:', info.messageId);
  } catch (err: any) {
    console.error('[mailer] send FAILED to', opts.to, err.message);
    throw err;
  }
}

function layout(title: string, bodyHtml: string): string {
  return `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1a1a1a;">
      <h2 style="margin: 0 0 16px;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top: 32px; font-size: 12px; color: #888;">Startup Digital Twin</p>
    </div>
  `;
}

export function joinRequestEmail(opts: {
  founderName: string;
  requesterName: string;
  companyName: string;
  reviewUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `${opts.requesterName} wants to join ${opts.companyName}`,
    html: layout('New join request', `
      <p>Hi ${opts.founderName},</p>
      <p><strong>${opts.requesterName}</strong> has requested to join <strong>${opts.companyName}</strong>.</p>
      <p>Log in and review the request from your team page:</p>
      <p><a href="${opts.reviewUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Review request</a></p>
    `),
  };
}

export function inviteCredentialsEmail(opts: {
  email: string;
  password: string;
  companyName: string;
  loginUrl: string;
}): { subject: string; html: string } {
  return {
    subject: `You've been invited to view ${opts.companyName}'s dashboard`,
    html: layout(`Welcome to ${opts.companyName}`, `
      <p>You've been given view-only access to <strong>${opts.companyName}</strong>'s dashboard on Startup Digital Twin.</p>
      <p>Your login details:</p>
      <p>Email: <strong>${opts.email}</strong><br/>Password: <strong>${opts.password}</strong></p>
      <p><a href="${opts.loginUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Log in</a></p>
      <p>We recommend changing your password after your first login.</p>
    `),
  };
}

export function startupInviteEmail(opts: {
  incubatorName: string;
  startupName: string;
  cohortName?: string | null;
  joinUrl: string;
}): { subject: string; html: string } {
  const cohortLine = opts.cohortName
    ? `<p>You're being invited into the <strong>${opts.cohortName}</strong> cohort.</p>`
    : '';
  return {
    subject: `${opts.incubatorName} invited ${opts.startupName} to join their program on WorkOS`,
    html: layout(`${opts.incubatorName} invited you`, `
      <p>Hi ${opts.startupName} team,</p>
      <p><strong>${opts.incubatorName}</strong> has added you to their program on WorkOS and would like you to create your company profile.</p>
      ${cohortLine}
      <p><a href="${opts.joinUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Create your profile</a></p>
      <p style="font-size:13px;color:#555;">This link expires in 30 days. Once you claim your profile, ${opts.incubatorName} will be able to see your company's metrics for program oversight — you're in control of what you upload.</p>
    `),
  };
}
