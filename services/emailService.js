const nodemailer = require('nodemailer');
const https      = require('https');
const logger     = require('../utils/logger');

let _transporter;
function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.EMAIL_PORT || '587', 10),
      secure: process.env.EMAIL_PORT === '465',
      auth:   { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASSWORD },
    });
  }
  return _transporter;
}

function sendViaBrevo(to, subject, html) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sender:      { name: 'Incident Hive', email: process.env.EMAIL_USER },
      to:          [{ email: to }],
      subject,
      htmlContent: html,
    });
    const req = https.request(
      { hostname: 'api.brevo.com', path: '/v3/smtp/email', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY,
                   'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => res.statusCode < 300 ? resolve(JSON.parse(data)) : reject(new Error(`Brevo ${res.statusCode}: ${data}`)));
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function sendEmail({ to, subject, html }) {
  try {
    if (process.env.USE_BREVO === 'true') {
      await sendViaBrevo(to, subject, html);
    } else {
      await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || `"Incident Hive" <${process.env.EMAIL_USER}>`,
        to, subject, html,
        text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      });
    }
    logger.info(`Email sent → ${to} | "${subject}"`);
  } catch (err) {
    logger.error(`Email failed → ${to} | "${subject}": ${err.message}`);
    throw err;
  }
}

function wrap(content) {
  return `<!DOCTYPE html><html><body style="margin:0;background:#0f172a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="560" style="background:#1e293b;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#6366f1;padding:24px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">🐝 INCIDENT HIVE</h1>
        </td></tr>
        <tr><td style="padding:32px;color:#e2e8f0;font-size:15px;line-height:1.7;">${content}</td></tr>
        <tr><td style="padding:16px 32px;background:#0f172a;color:#64748b;font-size:12px;">
          Automated message — do not reply.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

function codeBox(code, colour = '#6366f1') {
  return `<div style="margin:28px 0;text-align:center;">
    <span style="display:inline-block;background:${colour};color:#fff;font-size:34px;
                 font-weight:bold;letter-spacing:10px;padding:16px 36px;border-radius:8px;">
      ${code}
    </span>
  </div>`;
}

async function sendVerificationEmail(email, code, firstName) {
  await sendEmail({
    to:      email,
    subject: 'Verify your Incident Hive account',
    html:    wrap(`
      <p>Hello <strong>${firstName}</strong>,</p>
      <p>Use the code below to verify your email address.</p>
      ${codeBox(code)}
      <p>Expires in <strong>15 minutes</strong>.</p>
      <p style="color:#94a3b8;font-size:13px;">Didn't create an account? Ignore this email.</p>
    `),
  });
}

async function sendMfaCode(email, code, firstName) {
  await sendEmail({
    to:      email,
    subject: 'Your Incident Hive login code',
    html:    wrap(`
      <p>Hello <strong>${firstName}</strong>,</p>
      <p>Use the code below to complete sign-in.</p>
      ${codeBox(code, '#0ea5e9')}
      <p>Expires in <strong>15 minutes</strong>. Never share this code.</p>
      <p style="color:#94a3b8;font-size:13px;">Didn't attempt to log in? Change your password immediately.</p>
    `),
  });
}

async function sendPasswordResetEmail(email, code, firstName) {
  await sendEmail({
    to:      email,
    subject: 'Reset your Incident Hive password',
    html:    wrap(`
      <p>Hello <strong>${firstName || 'there'}</strong>,</p>
      <p>We received a request to reset your password. Use the code below to proceed.</p>
      ${codeBox(code, '#ef4444')}
      <p>Expires in <strong>15 minutes</strong>. If you did not request this, ignore this email.</p>
      <p style="color:#94a3b8;font-size:13px;">Never share this code with anyone.</p>
    `),
  });
}

async function sendExpertWelcomeEmail(email, temporaryPassword, firstName) {
  await sendEmail({
    to:      email,
    subject: 'Welcome to Incident Hive — Your Expert Account',
    html:    wrap(`
      <p>Hello <strong>${firstName || 'there'}</strong>,</p>
      <p>An administrator has created an expert account for you on <strong>Incident Hive</strong>.</p>
      <p>You can log in immediately with the credentials below:</p>
      <div style="margin:24px 0;padding:20px;background:#0f172a;border-radius:8px;">
        <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">Email</p>
        <p style="margin:0 0 16px;color:#fff;font-size:15px;font-weight:bold;">${email}</p>
        <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;">Temporary Password</p>
        <p style="margin:0;color:#fff;font-size:15px;font-weight:bold;">${temporaryPassword}</p>
      </div>
      <p style="color:#f59e0b;font-weight:bold;">⚠️ Please change your password after your first login.</p>
      <p style="color:#94a3b8;font-size:13px;">If you did not expect this account, please contact support.</p>
    `),
  });
}

async function sendAccountDeletionEmail(email) {
  await sendEmail({
    to:      email,
    subject: 'Your Incident Hive account has been deleted',
    html:    wrap(`
      <p>Your account has been permanently deleted as requested.</p>
      <p>All personal data has been anonymised per <strong>GDPR</strong> regulations.</p>
      <p style="color:#94a3b8;font-size:13px;">If this was a mistake, contact support immediately — data cannot be recovered.</p>
    `),
  });
}

module.exports = { sendVerificationEmail, sendMfaCode, sendPasswordResetEmail, sendExpertWelcomeEmail, sendAccountDeletionEmail };
