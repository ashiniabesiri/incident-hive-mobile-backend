/**
 * scripts/create-expert-user.js
 *
 * One-off helper to seed an expert account directly into the database.
 * Skips OTP/email-verification: the new row is created with
 * email_verified = true and account_status = 'active' so the app can
 * sign in immediately.
 *
 * Usage:
 *   node scripts/create-expert-user.js \
 *     --email dilanka@gmail.com \
 *     --password 'Dilanka@123' \
 *     [--first-name Dilanka] [--last-name Liyanage]
 *
 * Re-running with the same email updates the password / role rather
 * than failing on the unique-email constraint, so it's safe to use as
 * a "reset this account" tool too.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, connectDB } = require('../config/database');

const SALT_ROUNDS = 10;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.replace(/^--/, '');
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const email = (args.email || 'dilanka@gmail.com').toLowerCase().trim();
  const password = args.password || 'Dilanka@123';
  const firstName = args['first-name'] || 'Dilanka';
  const lastName = args['last-name'] || 'Liyanage';

  await connectDB();

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Upsert the user row.
  const userSql = `
    INSERT INTO users
      (email, password_hash, first_name, last_name, role,
       email_verified, account_status)
    VALUES
      ($1, $2, $3, $4, 'expert', true, 'active')
    ON CONFLICT (email) DO UPDATE
      SET password_hash   = EXCLUDED.password_hash,
          first_name      = EXCLUDED.first_name,
          last_name       = EXCLUDED.last_name,
          role            = 'expert',
          email_verified  = true,
          account_status  = 'active',
          updated_at      = NOW()
    RETURNING user_id, email, role
  `;
  const { rows } = await query(userSql, [email, passwordHash, firstName, lastName]);
  const user = rows[0];

  // Random expertise / credentials / bio so the seeded expert has a
  // realistic-looking public profile. Re-running this script reshuffles
  // them, which is handy for demos.
  const ALL_AREAS = [
    'Phishing',
    'Ransomware',
    'Data Breach',
    'Account Compromise',
    'DDoS',
    'Social Engineering',
    'Other',
  ];
  const CREDENTIAL_POOL = [
    'CISSP (Certified Information Systems Security Professional)',
    'CEH (Certified Ethical Hacker)',
    'OSCP (Offensive Security Certified Professional)',
    'GIAC GCIH (Incident Handler)',
    'CompTIA Security+',
    'ISO/IEC 27001 Lead Auditor',
    'BSc (Hons) in Cyber Security, University of Colombo',
    'MSc in Information Security, SLIIT',
  ];
  const BIO_POOL = [
    'Incident responder with 7+ years helping SMEs in Sri Lanka recover from ransomware and phishing campaigns.',
    'Former SOC analyst turned independent consultant. Focused on rapid triage, evidence preservation, and clear post-incident reporting.',
    'Specialises in account takeover investigations and email-borne threats. Comfortable working with both technical and non-technical stakeholders.',
    'Hands-on DFIR practitioner. Past engagements span fintech, healthcare, and public-sector clients.',
  ];

  const pickN = (arr, n) =>
    [...arr].sort(() => Math.random() - 0.5).slice(0, n);
  const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const expertiseAreas = pickN(ALL_AREAS, 3 + Math.floor(Math.random() * 2)); // 3 or 4
  const credentials = pickN(CREDENTIAL_POOL, 3).join('\n');
  const bio = pickOne(BIO_POOL);

  await query(
    `INSERT INTO expert_profiles
       (user_id, credentials, bio, expertise_areas, availability_status)
     VALUES ($1, $2, $3, $4, 'Available')
     ON CONFLICT (user_id) DO UPDATE
       SET credentials     = EXCLUDED.credentials,
           bio             = EXCLUDED.bio,
           expertise_areas = EXCLUDED.expertise_areas,
           updated_at      = NOW()`,
    [user.user_id, credentials, bio, expertiseAreas]
  );

  console.log('Expert user ready:');
  console.log({
    user_id: user.user_id,
    email: user.email,
    role: user.role,
    password: password, // echoed once so you can copy it
    expertise_areas: expertiseAreas,
    credentials,
    bio,
  });

  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create expert user:', err);
  process.exit(1);
});
