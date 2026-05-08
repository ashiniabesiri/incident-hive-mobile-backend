/**
 * middleware/piiFilter.js
 * PII (Personally Identifiable Information) filtering utilities for feed responses.
 *
 * Policy references:
 *   N002 — Expert email and phone are never exposed in list/detail responses;
 *           only revealed to the reporter after bid acceptance.
 *   N016 — Reporter name, email, and phone are never exposed to experts.
 *   GDPR — Anonymous incident reporters must not be identifiable in any response.
 *
 * ─── Feed PII rules (incidents shown to experts) ──────────────────────────────
 *   ALWAYS stripped:
 *     reporter_first_name, reporter_last_name, reporter_email, reporter_phone
 *
 *   Conditionally stripped:
 *     reporter_id — hidden when incident.is_anonymous = true
 *                   present (as a UUID, no PII by itself) when is_anonymous = false
 *
 *   Description:
 *     Truncated to 300 chars for list view; full text in detail view.
 *
 *   bid_window_ends_at → renamed to expires_at in all feed responses.
 *
 * ─── Expert profile PII rules ─────────────────────────────────────────────────
 *   ALWAYS stripped:  email, phone_number, password_hash, mfa_secret
 *   Permitted:        expert_id, first_name, last_name, expertise_areas,
 *                     credentials, availability_status, completed_engagements,
 *                     total_earned (optional), profile_picture_url
 */

// ─── Feed incident filtering ───────────────────────────────────────────────────

/**
 * FEED_FIELDS
 * Whitelist of columns returned in the expert feed.
 * Anything not in this set is dropped, even if it appears in the DB row.
 */
const FEED_FIELDS = new Set([
  'incident_id',
  'incident_type',
  'title',
  'description',       // truncated in list view; full in detail view
  'budget',
  'is_anonymous',
  'status',
  'expires_at',        // renamed from bid_window_ends_at
  'created_at',
  'bid_count',
  'relevance_score',   // only present when ai_ranked=true
  'reporter_id',       // conditionally included (excluded for anonymous)
  // detail-only additions:
  'has_bid',
  'updated_at',
]);

/**
 * filterIncidentForFeed
 * Apply all feed PII rules to a single incident row.
 *
 * @param {Object}  row                         Raw DB row (may contain reporter columns from JOINs)
 * @param {Object}  [opts]
 * @param {boolean} [opts.truncateDescription]  True for list view (truncates description to 300 chars)
 * @param {boolean} [opts.includeRelevance]     True when ai_ranked=true (keep relevance_score)
 * @returns {Object} Cleaned incident safe for expert consumption
 */
function filterIncidentForFeed(row, { truncateDescription = true, includeRelevance = false } = {}) {
  const result = {};

  for (const field of FEED_FIELDS) {
    if (!(field in row)) continue;

    // ── reporter_id: hide completely for anonymous incidents ───────────────
    if (field === 'reporter_id') {
      if (!row.is_anonymous) {
        result.reporter_id = row.reporter_id; // Non-PII UUID, safe for non-anonymous
      }
      continue;
    }

    // ── relevance_score: only include when explicitly requested ────────────
    if (field === 'relevance_score' && !includeRelevance) continue;

    result[field] = row[field];
  }

  // ── Truncate description for list view ────────────────────────────────────
  if (truncateDescription && result.description && result.description.length > 300) {
    result.description = result.description.substring(0, 297) + '...';
  }

  return result;
}

/**
 * filterIncidentsForFeed
 * Apply filterIncidentForFeed to an array of rows.
 *
 * @param {Object[]} rows
 * @param {Object}   [opts]  Forwarded to filterIncidentForFeed
 * @returns {Object[]}
 */
function filterIncidentsForFeed(rows, opts = {}) {
  return rows.map((row) => filterIncidentForFeed(row, opts));
}

// ─── Expert profile filtering ──────────────────────────────────────────────────

/**
 * EXPERT_PROFILE_PUBLIC_FIELDS
 * Whitelist for public expert profile responses.
 * Email and phone are never included — they are only revealed to reporters
 * via the acceptBid response (N016 / N002).
 */
const EXPERT_PROFILE_PUBLIC_FIELDS = new Set([
  'user_id',
  'first_name',
  'last_name',
  'profile_picture_url',  // nullable until DB column is added
  'expertise_areas',
  'credentials',
  'availability_status',
  'completed_engagements',
  'total_earned',
  'profile_created_at',
]);

/**
 * filterExpertProfile
 * Strip all PII from a combined user+expert_profile row.
 *
 * @param {Object} row  Combined row from ExpertProfileModel.findWithUser()
 * @returns {Object}    PII-safe expert profile
 */
function filterExpertProfile(row) {
  const result = {};
  for (const field of EXPERT_PROFILE_PUBLIC_FIELDS) {
    if (field in row) {
      result[field] = row[field];
    }
  }
  // profile_picture_url is not yet in the DB schema — return null until added
  if (!('profile_picture_url' in result)) {
    result.profile_picture_url = null;
  }
  return result;
}

module.exports = {
  filterIncidentForFeed,
  filterIncidentsForFeed,
  filterExpertProfile,
};
