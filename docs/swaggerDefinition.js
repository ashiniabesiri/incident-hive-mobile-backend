/**
 * docs/swaggerDefinition.js
 * Manual OpenAPI documentation for Incident Hive API.
 */

const API_PREFIX = process.env.API_PREFIX || '/api/v1';
const PORT = process.env.PORT || 3000;

const swaggerDefinition = {
  openapi: '3.0.0',

  info: {
    title: 'Incident Hive API',
    version: '1.0.0',
    description:
      'Backend API for the Incident Hive Cyber Incident Reporting and Tracking mobile application.',
    contact: {
      name: 'Incident Hive Team',
    },
  },

  servers: [
    {
      url: `http://localhost:${PORT}${API_PREFIX}`,
      description: 'Development API server',
    },
  ],

  tags: [
    { name: 'Auth', description: 'Registration, login, refresh token, MFA and logout' },
    { name: 'Profile', description: 'User profile and account management' },
    { name: 'Incidents', description: 'Reporter incident report management' },
    { name: 'Bids', description: 'Expert bidding and engagement flow' },
    { name: 'Expert Feed', description: 'Expert incident discovery and AI-ranked feed' },
    { name: 'Notifications', description: 'In-app notification centre' },
    { name: 'Content', description: 'News and testimonials' },
    { name: 'System', description: 'Health check' },
  ],

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },

    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false,
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_ERROR',
              },
              message: {
                type: 'string',
                example: 'Validation failed.',
              },
              details: {
                type: 'object',
                nullable: true,
              },
            },
          },
        },
      },

      RegisterRequest: {
        type: 'object',
        required: ['email', 'password', 'firstName', 'lastName'],
        properties: {
          email: {
            type: 'string',
            example: 'testuser@example.com',
          },
          password: {
            type: 'string',
            example: 'Test@12345',
          },
          firstName: {
            type: 'string',
            example: 'Test',
          },
          lastName: {
            type: 'string',
            example: 'User',
          },
          phoneNumber: {
            type: 'string',
            example: '+94771234567',
            description: 'Optional. Phone in E.164 format.',
          },
        },
      },

      RegisterResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true,
          },
          data: {
            type: 'object',
            properties: {
              user_id: {
                type: 'string',
                example: 'usr_a1b2c3d4',
              },
              email: {
                type: 'string',
                example: 'testuser@example.com',
              },
              role: {
                type: 'string',
                example: 'reporter',
              },
              access_token: {
                type: 'string',
                description: 'JWT Access Token, valid 15 min.',
              },
              refresh_token: {
                type: 'string',
                description: 'JWT Refresh Token, valid 7 days.',
              },
              session_timeout_seconds: {
                type: 'integer',
                example: 1800,
              },
            },
          },
        },
      },

      LoginRequest: {
        type: 'object',
        required: ['email', 'password', 'device_id'],
        properties: {
          email: {
            type: 'string',
            example: 'testuser@example.com',
          },
          password: {
            type: 'string',
            example: 'Test@12345',
          },
          device_id: {
            type: 'string',
            description: 'Stable device identifier. Binds the Refresh Token to the device.',
            example: 'device_abc123',
          },
        },
      },

      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              user_id: { type: 'string', example: 'usr_a1b2c3d4' },
              role: { type: 'string', example: 'reporter' },
              access_token: { type: 'string', description: 'JWT Access Token valid 15 min.' },
              refresh_token: { type: 'string', description: 'JWT Refresh Token valid 7 days, bound to device_id.' },
              token_type: { type: 'string', example: 'Bearer' },
              expires_in: { type: 'integer', example: 900, description: 'Access token lifetime in seconds.' },
              biometric_enabled: { type: 'boolean', description: 'Whether biometric login is enrolled on this device.' },
              mfa_required: { type: 'boolean', description: 'True if MFA challenge must be completed.' },
              session_timeout_seconds: { type: 'integer', example: 1800 },
            },
          },
        },
      },

      ProfileUpdateRequest: {
        type: 'object',
        properties: {
          firstName: {
            type: 'string',
            example: 'Ashini',
          },
          lastName: {
            type: 'string',
            example: 'Perera',
          },
          phoneNumber: {
            type: 'string',
            example: '+94771234567',
          },
        },
      },

      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: {
            type: 'string',
            example: 'OldPass@123',
          },
          newPassword: {
            type: 'string',
            example: 'NewPass@123',
          },
        },
      },

      CreateIncidentRequest: {
        type: 'object',
        required: ['title', 'description', 'incident_type', 'budget', 'is_anonymous'],
        properties: {
          title: {
            type: 'string',
            example: 'Suspicious phishing email',
          },
          description: {
            type: 'string',
            example:
              'I received an email asking me to reset my password using a suspicious link.',
          },
          incident_type: {
            type: 'string',
            enum: [
              'Phishing',
              'Ransomware',
              'Data Breach',
              'Account Compromise',
              'DDoS',
              'Social Engineering',
              'Other',
            ],
            example: 'Phishing',
          },
          budget: {
            type: 'number',
            example: 5000,
          },
          is_anonymous: {
            type: 'boolean',
            example: true,
          },
        },
      },

      UpdateIncidentRequest: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            example: 'Updated suspicious phishing email',
          },
          description: {
            type: 'string',
            example:
              'I received a suspicious email asking me to reset my password using a suspicious link. I want an expert to check it.',
          },
          incident_type: {
            type: 'string',
            enum: [
              'Phishing',
              'Ransomware',
              'Data Breach',
              'Account Compromise',
              'DDoS',
              'Social Engineering',
              'Other',
            ],
            example: 'Phishing',
          },
          budget: {
            type: 'number',
            example: 6500,
          },
          is_anonymous: {
            type: 'boolean',
            example: true,
          },
        },
      },

      PlaceBidRequest: {
        type: 'object',
        required: ['proposed_approach', 'estimated_hours', 'proposed_fee'],
        properties: {
          proposed_approach: {
            type: 'string',
            example:
              'I will review the suspicious email headers, check the link, and provide remediation advice.',
          },
          estimated_hours: {
            type: 'integer',
            example: 3,
          },
          proposed_fee: {
            type: 'number',
            example: 4500,
          },
        },
      },

      AvailabilityRequest: {
        type: 'object',
        required: ['availability'],
        properties: {
          availability: {
            type: 'string',
            enum: ['Available', 'Unavailable'],
            example: 'Available',
          },
        },
      },
    },
  },

  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Health check',
        description: 'Checks whether the backend, PostgreSQL, and Redis are running.',
        responses: {
          200: {
            description: 'System is healthy',
          },
          503: {
            description: 'System is degraded',
          },
        },
      },
    },

    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new reporter account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RegisterRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Account created. Token pair issued.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RegisterResponse',
                },
              },
            },
          },
          409: {
            description: 'Email already registered',
          },
          422: {
            description: 'Validation failed',
          },
        },
      },
    },

    '/auth/verify-email': {
      post: {
        tags: ['Auth'],
        summary: 'Verify user email using OTP code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'verificationCode'],
                properties: {
                  email: {
                    type: 'string',
                    example: 'testuser@example.com',
                  },
                  verificationCode: {
                    type: 'string',
                    example: '123456',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Email verified successfully',
          },
          400: {
            description: 'Invalid or expired verification code',
          },
        },
      },
    },

    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/LoginRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful or MFA required',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponse',
                },
              },
            },
          },
          401: {
            description: 'Invalid credentials',
          },
          403: {
            description: 'Email not verified or account suspended',
          },
          429: {
            description: 'Rate limit exceeded',
          },
        },
      },
    },

    '/auth/mfa/setup': {
      post: {
        tags: ['Auth'],
        summary: 'Start MFA setup for authenticated user',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'MFA setup code sent successfully',
          },
          401: {
            description: 'Access token required',
          },
        },
      },
    },

    '/auth/mfa/verify': {
      post: {
        tags: ['Auth'],
        summary: 'Verify MFA OTP for step-up authentication',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['otp_code'],
                properties: {
                  otp_code: {
                    type: 'string',
                    description: '6-digit one-time password from email.',
                    example: '123456',
                  },
                },
              },
              example: {
                otp_code: '123456',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'MFA verified. New token pair with updated amr claim issued.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        access_token: { type: 'string', description: 'New Access Token with amr claim.' },
                        refresh_token: { type: 'string', description: 'New Refresh Token.' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Invalid or expired OTP',
          },
          403: {
            description: 'MFA session expired. User must restart login.',
          },
        },
      },
    },

    '/auth/mfa/login': {
      post: {
        tags: ['Auth'],
        summary: 'Complete MFA login using email and OTP code',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp_code'],
                properties: {
                  email: {
                    type: 'string',
                    example: 'testuser10@example.com',
                  },
                  otp_code: {
                    type: 'string',
                    description: '6-digit one-time password from email.',
                    example: '123456',
                  },
                },
              },
              example: {
                email: 'testuser10@example.com',
                otp_code: '123456',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'MFA login successful',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponse',
                },
              },
            },
          },
          401: {
            description: 'Invalid or expired MFA code',
          },
        },
      },
    },

    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Silently refresh the Access Token using the Refresh Token',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refresh_token', 'device_id'],
                properties: {
                  refresh_token: {
                    type: 'string',
                    description: 'Current valid Refresh Token from encrypted device storage.',
                    example: 'refresh_token_here',
                  },
                  device_id: {
                    type: 'string',
                    description: 'Must match the device_id bound to the Refresh Token.',
                    example: 'device_abc123',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'New token pair issued',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        access_token: { type: 'string' },
                        refresh_token: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Token invalid, expired, or device_id mismatch',
          },
          403: {
            description: 'Replay detected — entire token family revoked',
          },
          429: {
            description: 'Rate limit exceeded (10 attempts / 15 min per device_id)',
          },
        },
      },
    },

    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout and revoke the Refresh Token',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refresh_token'],
                properties: {
                  refresh_token: {
                    type: 'string',
                    description: 'Active Refresh Token to be blacklisted via its jti claim.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Refresh Token revoked',
          },
          401: {
            description: 'Access token required',
          },
        },
      },
    },

    '/auth/biometric/enroll': {
      post: {
        tags: ['Auth'],
        summary: 'Enable biometric login for a device',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['device_id'],
                properties: {
                  device_id: {
                    type: 'string',
                    example: 'android_pixel_001',
                  },
                  device_name: {
                    type: 'string',
                    example: 'Pixel 4a',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Biometric flag set',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        biometric_enabled: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Access Token missing or expired',
          },
          429: {
            description: '3 attempts per 15 min (user_id + device_id)',
          },
        },
      },
    },

    '/auth/biometric/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login using biometric-enabled device',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id', 'device_id'],
                properties: {
                  user_id: {
                    type: 'string',
                    example: '00000000-0000-0000-0000-000000000000',
                  },
                  device_id: {
                    type: 'string',
                    example: 'android_pixel_001',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Biometric login successful',
          },
          401: {
            description: 'Biometric not enabled or account inactive',
          },
        },
      },
    },

    '/profile': {
      get: {
        tags: ['Profile'],
        summary: 'Get authenticated user profile',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Profile returned successfully',
          },
          401: {
            description: 'Access token required',
          },
        },
      },

      put: {
        tags: ['Profile'],
        summary: 'Update authenticated user profile',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ProfileUpdateRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Profile updated successfully',
          },
          422: {
            description: 'Validation failed',
          },
        },
      },

      delete: {
        tags: ['Profile'],
        summary: 'Delete authenticated user account',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Account deleted successfully',
          },
          401: {
            description: 'Access token required',
          },
        },
      },
    },

    '/profile/password': {
      put: {
        tags: ['Profile'],
        summary: 'Change account password',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ChangePasswordRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Password changed successfully',
          },
          401: {
            description: 'Current password incorrect',
          },
        },
      },
    },

    '/profile/picture': {
      post: {
        tags: ['Profile'],
        summary: 'Upload profile picture',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['picture'],
                properties: {
                  picture: {
                    type: 'string',
                    format: 'binary',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Profile picture uploaded successfully',
          },
          422: {
            description: 'Invalid file',
          },
        },
      },
    },

    '/profile/availability': {
      patch: {
        tags: ['Profile'],
        summary: 'Update expert availability',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/AvailabilityRequest',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Availability updated successfully',
          },
          403: {
            description: 'Expert role required',
          },
        },
      },
    },

    '/incidents': {
      get: {
        tags: ['Incidents'],
        summary: 'List reporter incidents',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['Open', 'In Progress', 'Completed', 'Cancelled'],
            },
          },
          {
            name: 'incident_type',
            in: 'query',
            schema: {
              type: 'string',
            },
          },
          {
            name: 'search',
            in: 'query',
            schema: {
              type: 'string',
            },
          },
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              example: 1,
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              example: 20,
            },
          },
        ],
        responses: {
          200: {
            description: 'Incident list returned',
          },
          401: {
            description: 'Access token required',
          },
        },
      },

      post: {
        tags: ['Incidents'],
        summary: 'Create new incident report',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                allOf: [
                  {
                    $ref: '#/components/schemas/CreateIncidentRequest',
                  },
                  {
                    type: 'object',
                    properties: {
                      attachments: {
                        type: 'array',
                        items: {
                          type: 'string',
                          format: 'binary',
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Incident created successfully',
          },
          422: {
            description: 'Validation failed',
          },
        },
      },
    },

    '/incidents/{incident_id}': {
      get: {
        tags: ['Incidents'],
        summary: 'Get incident details',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Incident details returned',
          },
          404: {
            description: 'Incident not found',
          },
        },
      },

      put: {
        tags: ['Incidents'],
        summary: 'Update incident',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdateIncidentRequest',
              },
              example: {
                title: 'Updated suspicious phishing email',
                description:
                  'I received a suspicious email asking me to reset my password using a suspicious link. I want an expert to check it.',
                incident_type: 'Phishing',
                budget: 6500,
                is_anonymous: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Incident updated successfully',
          },
          400: {
            description: 'Validation failed',
          },
          401: {
            description: 'Access token required',
          },
          404: {
            description: 'Incident not found',
          },
          409: {
            description: 'Incident cannot be edited',
          },
        },
      },

      delete: {
        tags: ['Incidents'],
        summary: 'Delete incident',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Incident deleted successfully',
          },
          409: {
            description: 'Only Open incidents can be deleted',
          },
        },
      },
    },

    '/incidents/{incident_id}/status': {
      patch: {
        tags: ['Incidents'],
        summary: 'Update incident status',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'string',
                    enum: ['In Progress', 'Completed', 'Cancelled'],
                    example: 'In Progress',
                  },
                },
              },
              example: {
                status: 'Cancelled',
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Status updated successfully',
          },
          400: {
            description: 'Validation failed',
          },
          401: {
            description: 'Access token required',
          },
        },
      },
    },

    '/incidents/{incident_id}/bids': {
      get: {
        tags: ['Bids'],
        summary: 'List bids for reporter incident',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Bids returned successfully',
          },
        },
      },

      post: {
        tags: ['Bids'],
        summary: 'Expert places bid on incident',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/PlaceBidRequest',
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Bid placed successfully',
          },
          409: {
            description: 'Duplicate bid or incident not open',
          },
        },
      },
    },

    '/incidents/{incident_id}/bids/{bid_id}/accept': {
      post: {
        tags: ['Bids'],
        summary: 'Reporter accepts a bid',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              example: '19632438-53ac-493b-8e2d-94ac4d27905c',
            },
          },
          {
            name: 'bid_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              example: '53a4fa3b-b6c1-4790-ba51-5c0d64e31f6f',
            },
          },
        ],
        responses: {
          200: {
            description: 'Bid accepted successfully',
          },
          403: {
            description: 'MFA step-up required',
          },
        },
      },
    },

    '/incidents/{incident_id}/bids/{bid_id}/decline': {
      post: {
        tags: ['Bids'],
        summary: 'Reporter declines a bid',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
          {
            name: 'bid_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Bid declined successfully',
          },
        },
      },
    },

    '/incidents/{incident_id}/complete': {
      post: {
        tags: ['Bids'],
        summary: 'Expert marks engagement complete',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Engagement completed successfully',
          },
        },
      },
    },

    '/feed/incidents': {
      get: {
        tags: ['Expert Feed'],
        summary: 'Get expert incident feed',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_type',
            in: 'query',
            schema: {
              type: 'string',
            },
          },
          {
            name: 'search',
            in: 'query',
            schema: {
              type: 'string',
            },
          },
          {
            name: 'ai_ranked',
            in: 'query',
            schema: {
              type: 'boolean',
              example: true,
            },
          },
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              example: 1,
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              example: 20,
            },
          },
        ],
        responses: {
          200: {
            description: 'Expert feed returned successfully',
          },
          403: {
            description: 'Expert role required',
          },
        },
      },
    },

    '/feed/incidents/{incident_id}': {
      get: {
        tags: ['Expert Feed'],
        summary: 'Get expert feed incident detail',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'incident_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Feed incident detail returned',
          },
          404: {
            description: 'Incident not found or no longer accepting bids',
          },
        },
      },
    },

    '/experts/{expert_id}/profile': {
      get: {
        tags: ['Expert Feed'],
        summary: 'Get public expert profile',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'expert_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Expert profile returned',
          },
          404: {
            description: 'Expert profile not found',
          },
        },
      },
    },

    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get user notifications',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'unread_only',
            in: 'query',
            schema: {
              type: 'boolean',
              example: false,
            },
          },
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              example: 1,
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              example: 20,
            },
          },
        ],
        responses: {
          200: {
            description: 'Notifications returned successfully',
          },
        },
      },
    },

    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'All notifications marked as read',
          },
        },
      },
    },

    '/notifications/{notification_id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark one notification as read',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'notification_id',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          200: {
            description: 'Notification marked as read',
          },
          404: {
            description: 'Notification not found',
          },
        },
      },
    },

    '/news': {
      get: {
        tags: ['Content'],
        summary: 'Get AI-summarised cyber news',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              example: 1,
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              example: 20,
            },
          },
        ],
        responses: {
          200: {
            description: 'News returned successfully',
          },
        },
      },
    },

    '/testimonials': {
      get: {
        tags: ['Content'],
        summary: 'Get active testimonials',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'page',
            in: 'query',
            schema: {
              type: 'integer',
              example: 1,
            },
          },
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              example: 20,
            },
          },
        ],
        responses: {
          200: {
            description: 'Testimonials returned successfully',
          },
        },
      },
    },
  },
};

module.exports = swaggerDefinition;