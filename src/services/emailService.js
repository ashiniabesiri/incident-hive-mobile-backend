/**
 * services/emailService.js
 * Sends transactional emails via Nodemailer (SMTP) or the Brevo (Sendinblue) REST API.
 * Toggle between providers using the USE_BREVO environment variable.
 */

const nodemailer = require('nodemailer');
const https = require('https');
const logger = require('../utils/logger');

// ─── Nodemailer Transporter ───────────────────────────────────────────────────
// Lazily created so tests don't require real credentials.
let _transporter;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST  || 'smtp.gmail.com',
      port:   parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: process.env.EMAIL_PORT  === '465',  // true for port 465, false for 587 (STARTTLS)
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
  return _transporter;
}

// ─── Brevo REST helper ────────────────────────────────────────────────────────
function sendViaBrevo(to, subject, html) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender:   { name: 'Incident Hive', email: process.env.EMAIL_USER },
      to:       [{ email: to }],
      subject,
      htmlContent: html,
    });

    const options = {
      hostname: 'api.brevo.com',
      path:     '/v3/smtp/email',
      method:   'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'api-key':       process.env.BREVO_API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Brevo API error ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Primary send function ────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const useBrevo = process.env.USE_BREVO === 'true';

  try {
    if (useBrevo) {
      await sendViaBrevo(to, subject, html);
    } else {
      await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || `"Incident Hive" <${process.env.EMAIL_USER}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]+>/g, ''), // Strip HTML as plain-text fallback
      });
    }
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    throw error;
  }
}

// ─── Email Templates ──────────────────────────────────────────────────────────

/**
 * Branded wrapper for all outgoing emails.
 */
function baseTemplate(content) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Incident Hive</title>
    </head>
    <body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0"
                   style="background:#1e293b;border-radius:12px;overflow:hidden;">
              <!-- Header -->
              <tr>
                <td style="background:#6366f1;padding:24px 32px;">
                  <h1 style="margin:0;color:#fff;font-size:22px;letter-spacing:1px;">
                    🐝 INCIDENT HIVE
                  </h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:32px;color:#e2e8f0;font-size:15px;line-height:1.6;">
                  ${content}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="padding:16px 32px;background:#0f172a;color:#64748b;font-size:12px;">
                  This is an automated message from Incident Hive. Do not reply to this email.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

// ─── Exported Email Actions ───────────────────────────────────────────────────

/**
 * Send the 6-digit email verification code after registration.
 */
async function sendVerificationEmail(email, code, firstName) {
  const html = baseTemplate(`
    <p>Hello <strong>${firstName}</strong>,</p>
    <p>Welcome to Incident Hive! Please verify your email address using the code below.</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="display:inline-block;background:#6366f1;color:#fff;
                   font-size:32px;font-weight:bold;letter-spacing:8px;
                   padding:16px 32px;border-radius:8px;">
        ${code}
      </span>
    </div>
    <p>This code expires in <strong>15 minutes</strong>.</p>
    <p>If you did not create an account, please ignore this email.</p>
  `);

  await sendEmail({
    to: email,
    subject: 'Verify your Incident Hive account',
    html,
  });
}

/**
 * Send a 6-digit MFA challenge code.
 */
async function sendMfaCode(email, code, firstName) {
  const html = baseTemplate(`
    <p>Hello <strong>${firstName}</strong>,</p>
    <p>Use the following code to complete your sign-in:</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="display:inline-block;background:#0ea5e9;color:#fff;
                   font-size:32px;font-weight:bold;letter-spacing:8px;
                   padding:16px 32px;border-radius:8px;">
        ${code}
      </span>
    </div>
    <p>This code expires in <strong>15 minutes</strong>. Do not share it with anyone.</p>
    <p>If you did not attempt to log in, please change your password immediately.</p>
  `);

  await sendEmail({
    to: email,
    subject: 'Your Incident Hive login code',
    html,
  });
}

/**
 * Notify user that their account has been scheduled for deletion.
 */
async function sendAccountDeletionEmail(email) {
  const html = baseTemplate(`
    <p>Your Incident Hive account has been deleted as requested.</p>
    <p>All personal data has been anonymised in accordance with GDPR regulations.</p>
    <p>If you believe this was done in error, please contact our support team immediately.</p>
  `);

  await sendEmail({
    to: email,
    subject: 'Your Incident Hive account has been deleted',
    html,
  });
}

module.exports = {
  sendVerificationEmail,
  sendMfaCode,
  sendAccountDeletionEmail,
};
