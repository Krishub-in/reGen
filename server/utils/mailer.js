import nodemailer from 'nodemailer';

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('SMTP not configured – emails will not be sent');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
};

/**
 * Send welcome credentials email to a newly created company owner.
 */
export const sendCompanyCredentials = async ({ to, companyName, username, password, loginUrl }) => {
  const t = getTransporter();
  if (!t) {
    console.warn(`[MAILER] Skipped email to ${to} – SMTP not configured`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #09090b; color: #e4e4e7; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px;">Welcome to ReGen</h1>
        <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.8);">Your company has been registered</p>
      </div>
      <div style="padding: 32px 24px;">
        <p style="margin: 0 0 20px; font-size: 15px; color: #a1a1aa;">Hello,</p>
        <p style="margin: 0 0 20px; font-size: 15px; color: #d4d4d8;">
          Your company <strong style="color: #fff;">${companyName}</strong> has been added to the ReGen platform by the Super Admin.
          Below are your temporary login credentials:
        </p>
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-size: 13px; color: #71717a; width: 100px;">Username</td>
              <td style="padding: 8px 0; font-size: 15px; color: #fff; font-weight: 600; font-family: monospace;">${username}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-size: 13px; color: #71717a;">Password</td>
              <td style="padding: 8px 0; font-size: 15px; color: #fff; font-weight: 600; font-family: monospace;">${password}</td>
            </tr>
          </table>
        </div>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${loginUrl}" style="display: inline-block; background: #3b82f6; color: #fff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-size: 15px; font-weight: 700;">
            Login to ReGen →
          </a>
        </div>
        <div style="background: #1c1917; border-left: 3px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin: 24px 0;">
          <p style="margin: 0; font-size: 13px; color: #fbbf24; font-weight: 600;">⚠ Important</p>
          <p style="margin: 6px 0 0; font-size: 13px; color: #a8a29e;">
            This is a temporary password. You will be required to change it on your first login.
            Do not share these credentials with anyone.
          </p>
        </div>
        <p style="margin: 24px 0 0; font-size: 12px; color: #52525b; text-align: center;">
          This is an automated message from the ReGen platform. Please do not reply.
        </p>
      </div>
    </div>
  `;

  try {
    const info = await t.sendMail({
      from: `"ReGen Platform" <${from}>`,
      to,
      subject: `Welcome to ReGen – Your login credentials for ${companyName}`,
      html,
    });
    console.log(`[MAILER] Credentials sent to ${to} – messageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[MAILER] Failed to send to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
};
