
// Feed incident filtering

const FEED_FIELDS = new Set([
  'incident_id',
  'incident_type',
  'title',
  'description',
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

function filterIncidentForFeed(row, { truncateDescription = true, includeRelevance = false } = {}) {
  const result = {};

  for (const field of FEED_FIELDS) {
    if (!(field in row)) continue;

    // reporter_id: hide completely for anonymous incidents
    if (field === 'reporter_id') {
      if (!row.is_anonymous) {
        result.reporter_id = row.reporter_id; // Non-PII UUID, safe for non-anonymous
      }
      continue;
    }

    // relevance_score: only include when explicitly requested
    if (field === 'relevance_score' && !includeRelevance) continue;

    result[field] = row[field];
  }

  // Truncate description for list view
  if (truncateDescription && result.description && result.description.length > 300) {
    result.description = result.description.substring(0, 297) + '...';
  }

  return result;
}

function filterIncidentsForFeed(rows, opts = {}) {
  return rows.map((row) => filterIncidentForFeed(row, opts));
}

// Expert profile filtering

const EXPERT_PROFILE_PUBLIC_FIELDS = new Set([
  'user_id',
  'first_name',
  'last_name',
  'profile_picture_url',
  'bio',
  'expertise_areas',
  'credentials',
  'availability_status',
  'completed_engagements',
  'total_earned',
  'profile_created_at',
]);

function filterExpertProfile(row) {
  const result = {};
  for (const field of EXPERT_PROFILE_PUBLIC_FIELDS) {
    if (field in row) {
      result[field] = row[field];
    }
  }
  if (!('profile_picture_url' in result)) {
    result.profile_picture_url = null;
  }
  if ('completed_engagements' in result) {
    result.past_jobs_count = result.completed_engagements;
  }
  return result;
}

module.exports = {
  filterIncidentForFeed,
  filterIncidentsForFeed,
  filterExpertProfile,
};
