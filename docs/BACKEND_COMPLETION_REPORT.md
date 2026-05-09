# Incident Hive Backend — Completion Report

**Date:** 2026-05-10
**Version:** 1.0
**Overall Completion:** 93%

---

## Executive Summary

The Incident Hive backend is functionally complete across all core modules: authentication, incident management, bidding, notifications, admin, and user profiles. Token security (RS256/HS256 dual-algorithm, jti blacklisting, refresh token rotation with replay detection, device binding) is fully implemented. Database schema is fully aligned with the API layer. The remaining 7% consists of rate limiting gaps on two auth endpoints, one pagination inconsistency, missing Joi validation on one endpoint, dead code cleanup, Swagger documentation gaps, and two production hardening items.

---

## Module Completion Summary

| Module                  | Completion | Status                                                    |
|-------------------------|------------|-----------------------------------------------------------|
| Token & Session Security| 100%       | RS256, jti blacklisting, replay detection, device binding |
| Incident CRUD           | 100%       | Field names, statuses, sort, pagination, delete guards    |
| Notifications           | 100%       | Exact counts, standard envelope, field naming             |
| Admin Endpoints         | 100%       | 7 endpoints including dashboard stats and audit logs      |
| Profile System          | 100%       | CRUD, expert fields, past_jobs_count alias, GDPR deletion |
| Database Schema         | 100%       | All tables, columns, and constraints aligned              |
| Bid System              | 95%        | Pagination envelope inconsistency in listBids             |
| Auth Endpoints          | 95%        | Missing rate limiters, google validation, legacy guards   |
| Rate Limiting           | 90%        | Missing dedicated limiters on 2 endpoints                 |
| Security Configuration  | 90%        | SSL cert validation, CSP unsafe-inline, Swagger exposure  |
| Swagger Documentation   | 85%        | Google endpoint missing, field gaps, legacy routes        |

---

## Remaining Items

### Category 1: Security (HIGH Priority)

These items address security gaps that could be exploited in production.

---

#### 1.1 Add Dedicated Rate Limiter for POST /auth/biometric/login

- **File:** `middleware/rateLimit.js`, `routes/authRoutes.js`
- **Current State:** Only the baseline `authLimiter` (100 requests/15 min per IP) protects this endpoint.
- **Risk:** The endpoint accepts a plain `user_id` + `device_id` with no cryptographic challenge. The only server-side guard is the `biometric_enabled` flag in the database. Without tighter rate limiting, a stolen user_id + device_id pair allows 100 login attempts per 15-minute window.
- **Required Change:** Create a `biometricLoginLimiter` (e.g., 5 requests/15 min per `user_id + device_id` composite key) and apply it to the `/biometric/login` route.
- **Effort:** ~10 minutes

---

#### 1.2 Add Dedicated Rate Limiter for POST /auth/verify-email

- **File:** `middleware/rateLimit.js`, `routes/authRoutes.js`
- **Current State:** Only the baseline `authLimiter` (100 requests/15 min per IP) protects this endpoint.
- **Risk:** The endpoint validates a 6-digit numeric OTP. With 100 guesses per 15-minute window, an attacker has a 0.01% chance per window — low but non-trivial when automated across IPs.
- **Required Change:** Create a `verifyEmailLimiter` (e.g., 5 requests/15 min per email) and apply it to the `/verify-email` route.
- **Effort:** ~5 minutes

---

#### 1.3 Secure Legacy DELETE /auth/account Endpoint

- **File:** `controllers/authController.js`, `routes/authRoutes.js`
- **Current State:** Any authenticated user can delete their account by sending a single POST to `DELETE /auth/account` with no request body validation, no password confirmation, and no `confirm_deletion` flag. The canonical `DELETE /profile` endpoint correctly requires both.
- **Risk:** Accidental or malicious account deletion without confirmation.
- **Required Change:** Either (a) add password confirmation + `confirm_deletion` validation matching the `/profile` DELETE endpoint, or (b) remove the legacy route entirely since `/profile` DELETE serves the same purpose with proper guards.
- **Effort:** ~15 minutes

---

#### 1.4 Enable SSL Certificate Validation for Production Database

- **File:** `config/database.js` (line 27)
- **Current State:** `ssl: { rejectUnauthorized: false }` is used in production, which disables TLS certificate verification for PostgreSQL connections.
- **Risk:** Man-in-the-middle attacks on the database connection in production environments.
- **Required Change:** Set `rejectUnauthorized: true` for production. Ensure the proper CA certificate chain is available via `ssl.ca` option or system trust store.
- **Effort:** ~5 minutes

---

### Category 2: API Consistency (MEDIUM Priority)

These items address inconsistencies in API contracts that could confuse client developers.

---

#### 2.1 Fix listBids Pagination Envelope

- **File:** `controllers/bidController.js` (~line 154-159)
- **Current State:** The `GET /incidents/:id/bids` response returns:
  ```json
  {
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
  ```
- **Issue:** Uses `totalPages` (camelCase) instead of `total_pages` (snake_case). Missing `has_next_page` and `has_prev_page` fields.
- **Standard Envelope (used by all other list endpoints):**
  ```json
  {
    "total": 25,
    "page": 1,
    "limit": 20,
    "total_pages": 3,
    "has_next_page": true,
    "has_prev_page": false
  }
  ```
- **Required Change:** Update the response object to use snake_case key and add the two boolean fields.
- **Effort:** ~10 minutes

---

#### 2.2 Add Joi Validation Schema for POST /auth/google

- **File:** `controllers/authController.js`, `utils/validationSchemas.js`, `routes/authRoutes.js`
- **Current State:** The Google login handler validates `idToken` with a manual `if (!idToken)` check. The `device_id` field is destructured but not validated. No Joi schema is applied via the `validate()` middleware.
- **Required Change:** Create a `googleLoginSchema` in `validationSchemas.js`:
  ```javascript
  const googleLoginSchema = Joi.object({
    idToken: Joi.string().required(),
    device_id: Joi.string().min(3).max(255).optional().allow(null, ''),
  });
  ```
  Apply via `validate(googleLoginSchema)` middleware on the route.
- **Effort:** ~10 minutes

---

#### 2.3 Remove Dead Validation Schemas

- **File:** `utils/validationSchemas.js`
- **Current State:** The file exports `createIncidentSchema`, `updateIncidentSchema`, `updateStatusSchema`, and `placeBidSchema`. However, the incident and bid controllers define their own inline Joi schemas and do not import or use these exports.
- **Risk:** Schema divergence — the exported schemas may drift from the actual inline schemas, misleading developers who reference the utils file.
- **Required Change:** Either (a) remove the unused schemas from `validationSchemas.js` and their exports, or (b) refactor the controllers to import and use the centralized schemas instead of inline definitions.
- **Effort:** ~15 minutes

---

### Category 3: Documentation (LOW Priority)

These items address Swagger/OpenAPI documentation gaps.

---

#### 3.1 Add Swagger Documentation for POST /auth/google

- **File:** `docs/swaggerDefinition.js`
- **Current State:** The Google login endpoint has no Swagger documentation. It is the only non-legacy auth endpoint without docs.
- **Required Change:** Add a complete Swagger path entry documenting:
  - Request body: `idToken` (required string), `device_id` (optional string)
  - 200 response: Standard `LoginResponse` shape (user_id, role, tokens, biometric_enabled, mfa_required, session_timeout_seconds)
  - 400 response: GOOGLE_ID_TOKEN_REQUIRED
  - 401 response: INVALID_GOOGLE_TOKEN, GOOGLE_EMAIL_NOT_VERIFIED
  - 403 response: ACCOUNT_NOT_ACTIVE
- **Effort:** ~15 minutes

---

#### 3.2 Fix Swagger Request Schema Gaps

- **File:** `docs/swaggerDefinition.js`
- **Current State:** Several request schemas are missing fields that the API actually accepts:
  - `RegisterRequest` schema is missing the `device_id` field
  - MFA login (`/auth/mfa/login`) request schema is missing the `device_id` field
- **Required Change:** Add `device_id` as an optional string field to both request schemas.
- **Effort:** ~10 minutes

---

#### 3.3 Fix Swagger Response Schema Gaps

- **File:** `docs/swaggerDefinition.js`
- **Current State:** Several 200 response schemas omit fields the API actually returns:
  - `POST /auth/refresh` response is missing `token_type`, `expires_in`, `session_timeout_seconds`
  - `POST /auth/mfa/verify` response is missing `token_type`, `expires_in`, `session_timeout_seconds`
  - `POST /incidents` — `CreateIncidentRequest` marks `budget` as required but code treats it as optional
- **Required Change:** Add the missing fields to each response schema. Remove `budget` from the required array in `CreateIncidentRequest`.
- **Effort:** ~10 minutes

---

#### 3.4 Disable Swagger in Production

- **File:** `server.js` (~line 82-89)
- **Current State:** Swagger UI and JSON spec are served in all environments, including production.
- **Risk:** Exposes the full API surface, request/response schemas, and error codes to unauthenticated users.
- **Required Change:** Wrap the Swagger setup in an environment check:
  ```javascript
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));
  }
  ```
- **Effort:** ~5 minutes

---

#### 3.5 Document or Remove Legacy Auth Routes

- **File:** `routes/authRoutes.js`, `docs/swaggerDefinition.js`
- **Current State:** Four legacy routes remain active but have no Swagger documentation:
  - `GET /auth/profile` — superseded by `GET /profile`
  - `POST /auth/change-password` — superseded by `PUT /profile/password`
  - `DELETE /auth/account` — superseded by `DELETE /profile`
  - `POST /auth/biometric/register` — alias of `/auth/biometric/enroll`
- **Required Change:** Either (a) add deprecation notices in Swagger docs and mark with `deprecated: true`, or (b) remove the legacy routes and update any clients still using them.
- **Effort:** ~20 minutes

---

### Category 4: Production Hardening (NICE-TO-HAVE)

These items improve security posture but are not functional gaps.

---

#### 4.1 Tighten Content Security Policy

- **File:** `server.js` (~line 49-50)
- **Current State:** Helmet CSP uses `'unsafe-inline'` for both `scriptSrc` and `styleSrc`.
- **Impact:** Reduces XSS protection — inline scripts injected by an attacker would execute.
- **Required Change:** Replace `'unsafe-inline'` with nonce-based or hash-based script/style policies. This requires generating a nonce per request and passing it to any inline scripts or styles.
- **Effort:** ~30 minutes

---

#### 4.2 Enable Cross-Origin-Embedder-Policy

- **File:** `server.js` (~line 54)
- **Current State:** `crossOriginEmbedderPolicy: false` — disabled.
- **Impact:** Reduced isolation from cross-origin resources. May be intentional if embedding third-party content.
- **Required Change:** Set to `true` unless third-party embeds require it disabled. Test with frontend to verify no breakage.
- **Effort:** ~5 minutes

---

## Implementation Priority Matrix

| Priority | Items       | Effort    | Completion After |
|----------|-------------|-----------|------------------|
| **P0**   | 1.1 — 1.4   | ~35 min   | 93% → 96%       |
| **P1**   | 2.1 — 2.3   | ~35 min   | 96% → 98%       |
| **P2**   | 3.1 — 3.5   | ~60 min   | 98% → 100%      |
| **P3**   | 4.1 — 4.2   | ~35 min   | Hardening bonus  |

**Total estimated effort to 100%: ~2.5 hours**
**Total estimated effort including hardening: ~3 hours**

---

## Appendix: What Is Complete

For reference, the following areas require no further work:

- JWT dual-algorithm signing (RS256 with HS256 fallback)
- Access token jti claims with Redis blacklisting
- Refresh token SHA-256 hashed storage in Redis
- Refresh token rotation with replay detection (409 status)
- device_id binding in all token-issuing flows
- Token response fields (token_type, expires_in, session_timeout_seconds)
- biometric_enabled queried per-device from user_devices table
- amr claim set per auth method (pwd, mfa, google, bio)
- Session sliding window via Redis TTL
- All 6 incident CRUD endpoints with field name alignment
- Case-insensitive status/type normalization
- Accepted-bid guard on incident deletion
- 5 bid endpoints with MFA step-up on accept
- PII filtering via whitelist middleware
- 4 notification endpoints with exact-count pagination
- 7 admin endpoints including dashboard stats
- 5 profile endpoints with GDPR-compliant deletion
- past_jobs_count alias for completed_engagements
- Database schema fully aligned (all 10 tables)
- Audit logging middleware covering 32 actions
- RBAC middleware (requireAdmin, requireExpert, requireReporter, requireReporterOnly)
- Input validation with Joi (stripUnknown, abortEarly: false)
- Anti-enumeration on forgot-password (always 200)
- Timing-safe OTP comparison
- 7 rate limiters on sensitive endpoints
