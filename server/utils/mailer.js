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

/**
 * Send an Attendance or Payment/Payroll Report Email with formatted summary and CSV attachment
 */
export const sendReportEmail = async ({
  to,
  subject,
  companyName = 'Company',
  reportType = 'Report', // 'Attendance Report' | 'Payment & Payroll Report'
  periodLabel = '',
  summaryMetrics = [], // [{ label: 'Total Paid', value: '₹50,000' }, ...]
  notes = '',
  csvContent = '',
  filename = 'report.csv',
}) => {
  const t = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@regenai.com';

  const metricsHtml = summaryMetrics.length > 0 ? `
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin: 24px 0;">
      ${summaryMetrics.map(m => `
        <div style="background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 14px 16px;">
          <div style="font-size: 11px; text-transform: uppercase; color: #a1a1aa; font-weight: 600; letter-spacing: 0.5px;">${m.label}</div>
          <div style="font-size: 20px; font-weight: 700; color: #14b8a6; margin-top: 4px;">${m.value}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; background: #09090b; color: #e4e4e7; border-radius: 16px; overflow: hidden; border: 1px solid #27272a;">
      <div style="background: linear-gradient(135deg, #0d9488, #0284c7); padding: 32px 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${reportType}</h1>
        <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.9); font-weight: 500;">
          ${companyName} • Period: ${periodLabel}
        </p>
      </div>

      <div style="padding: 28px 24px;">
        <p style="margin: 0 0 16px; font-size: 15px; color: #d4d4d8;">
          Hello,
        </p>
        <p style="margin: 0 0 16px; font-size: 14px; color: #a1a1aa; line-height: 1.5;">
          Please find enclosed the formal <strong>${reportType}</strong> for <strong>${companyName}</strong> covering <strong>${periodLabel}</strong>.
          The complete line-by-line detailed dataset is attached as a CSV file (<strong>${filename}</strong>).
        </p>

        ${notes ? `
          <div style="background: #1c1917; border-left: 3px solid #14b8a6; border-radius: 8px; padding: 12px 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 12px; color: #14b8a6; font-weight: 700; text-transform: uppercase;">Message from Management</p>
            <p style="margin: 6px 0 0; font-size: 13px; color: #d4d4d8;">${notes}</p>
          </div>
        ` : ''}

        <h3 style="margin: 20px 0 8px; font-size: 14px; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">Executive Summary</h3>
        ${metricsHtml}

        <div style="background: #18181b; border: 1px dashed #3f3f46; border-radius: 10px; padding: 16px; text-align: center; margin-top: 24px;">
          <p style="margin: 0; font-size: 13px; color: #e4e4e7; font-weight: 600;">📎 Attached File: ${filename}</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #71717a;">Open the attached CSV spreadsheet in Microsoft Excel, Google Sheets, or any analytics software.</p>
        </div>

        <p style="margin: 32px 0 0; font-size: 12px; color: #52525b; text-align: center; border-top: 1px solid #1f2937; pt: 16px;">
          Generated automatically by reGen Attendance & Payroll System on ${new Date().toLocaleString()}.
        </p>
      </div>
    </div>
  `;

  if (!t) {
    console.log(`[MAILER-SIMULATED] Report email to ${to} (${subject}) – Attached: ${filename} (SMTP not configured)`);
    return {
      sent: true,
      simulated: true,
      message: `Report prepared and sent to ${to} (Simulated mode: SMTP credentials not set in server .env)`
    };
  }

  try {
    const attachments = [];
    if (csvContent) {
      attachments.push({
        filename,
        content: csvContent,
        contentType: 'text/csv; charset=utf-8',
      });
    }

    const info = await t.sendMail({
      from: `"${companyName} Payroll & Attendance via reGen" <${from}>`,
      to,
      subject: subject || `${reportType} - ${companyName} (${periodLabel})`,
      html,
      attachments,
    });
    console.log(`[MAILER] Report sent to ${to} – messageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId, simulated: false };
  } catch (err) {
    console.error(`[MAILER] Failed to send report to ${to}:`, err.message);
    return { sent: false, reason: err.message };
  }
};

