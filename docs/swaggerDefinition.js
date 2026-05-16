
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
    { name: 'Admin', description: 'Admin-only user and session management' },
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
          device_id: {
            type: 'string',
            example: 'android_pixel_001',
            description: 'Optional device identifier for refresh-token binding.',
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
              user_type: {
                type: 'string',
                description: 'Alias for role. Always "reporter" for self-registration.',
                example: 'reporter',
              },
              access_token: {
                type: 'string',
                description: 'JWT Access Token, valid 15 min. Email verification is still required before login.',
              },
              refresh_token: {
                type: 'string',
                description: 'JWT Refresh Token, valid 7 days.',
              },
              token_type: {
                type: 'string',
                example: 'Bearer',
              },
              expires_in: {
                type: 'integer',
                example: 900,
                description: 'Access token lifetime in seconds.',
              },
              email_verified: {
                type: 'boolean',
                example: false,
                description: 'Always false at registration. User must verify via POST /auth/verify-email.',
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
              user_type: { type: 'string', description: 'Alias for role.', example: 'reporter' },
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
        description: 'All fields optional. Snake_case and camelCase both accepted for name/phone fields.',
        properties: {
          first_name: {
            type: 'string',
            example: 'Ashini',
          },
          last_name: {
            type: 'string',
            example: 'Perera',
          },
          phone_number: {
            type: 'string',
            example: '+94771234567',
          },
          expertise_areas: {
            type: 'array',
            items: { type: 'string' },
            description: 'Expert-only. Array of expertise area strings.',
            example: ['Phishing', 'DDoS'],
          },
          bio: {
            type: 'string',
            description: 'Expert-only. Short biography.',
            example: 'Certified security consultant with 10 years experience.',
          },
          credentials: {
            type: 'string',
            description: 'Expert-only. Professional certifications.',
            example: 'CISSP, CEH',
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
        required: ['title', 'description', 'incident_type'],
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
          currency: {
            type: 'string',
            enum: ['LKR', 'USD', 'EUR', 'GBP'],
            default: 'LKR',
            example: 'LKR',
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
          currency: {
            type: 'string',
            enum: ['LKR', 'USD', 'EUR', 'GBP'],
            example: 'LKR',
          },
          is_anonymous: {
            type: 'boolean',
            example: true,
          },
        },
      },

      PlaceBidRequest: {
        type: 'object',
        required: ['proposed_approach', 'proposed_fee'],
        description: 'Provide either estimated_time (string, e.g. "5 hours") or estimated_hours (integer). At least one is required.',
        properties: {
          proposed_approach: {
            type: 'string',
            example:
              'I will review the suspicious email headers, check the link, and provide remediation advice.',
          },
          estimated_time: {
            type: 'string',
            description: 'Human-readable estimate, e.g. "5 hours". Accepts a number or string like "3 hours".',
            example: '3 hours',
          },
          estimated_hours: {
            type: 'integer',
            description: 'Numeric hours estimate. Alternative to estimated_time.',
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

    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List all users',
        description: 'Admin-only. Paginated user list with optional filters by role, account status, or search.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['reporter', 'expert', 'admin'] } },
          { name: 'account_status', in: 'query', schema: { type: 'string', enum: ['active', 'suspended'] } },
          { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name or email' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
        ],
        responses: {
          200: {
            description: 'User list returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        users: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              user_id: { type: 'string', format: 'uuid' },
                              email: { type: 'string', format: 'email' },
                              first_name: { type: 'string' },
                              last_name: { type: 'string' },
                              role: { type: 'string' },
                              email_verified: { type: 'boolean' },
                              account_status: { type: 'string' },
                              mfa_enabled: { type: 'boolean' },
                              last_login_at: { type: 'string', format: 'date-time', nullable: true },
                              created_at: { type: 'string', format: 'date-time' },
                            },
                          },
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            total: { type: 'integer' },
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total_pages: { type: 'integer' },
                            has_next_page: { type: 'boolean' },
                            has_prev_page: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: 'Admin role required' },
        },
      },
    },

    '/admin/users/{user_id}': {
      get: {
        tags: ['Admin'],
        summary: 'Get user details',
        description: 'Admin-only. Returns full user profile including expert profile fields if applicable.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'user_id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: {
            description: 'User details returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user_id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        first_name: { type: 'string' },
                        last_name: { type: 'string' },
                        phone_number: { type: 'string', nullable: true },
                        role: { type: 'string' },
                        email_verified: { type: 'boolean' },
                        account_status: { type: 'string' },
                        mfa_enabled: { type: 'boolean' },
                        last_login_at: { type: 'string', format: 'date-time', nullable: true },
                        created_at: { type: 'string', format: 'date-time' },
                        expertise_areas: { type: 'array', items: { type: 'string' }, description: 'Expert only' },
                        credentials: { type: 'string', nullable: true, description: 'Expert only' },
                        bio: { type: 'string', nullable: true, description: 'Expert only' },
                        availability_status: { type: 'string', description: 'Expert only' },
                        completed_engagements: { type: 'integer', description: 'Expert only' },
                        total_earned: { type: 'number', description: 'Expert only' },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: 'Admin role required' },
          404: { description: 'User not found' },
        },
      },
    },

    '/admin/dashboard/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Platform dashboard statistics',
        description: 'Admin-only. Returns aggregate counts for users, incidents, and bids.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Dashboard statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        total_users: { type: 'integer' },
                        total_reporters: { type: 'integer' },
                        total_experts: { type: 'integer' },
                        suspended_users: { type: 'integer' },
                        total_incidents: { type: 'integer' },
                        open_incidents: { type: 'integer' },
                        in_progress_incidents: { type: 'integer' },
                        completed_incidents: { type: 'integer' },
                        total_bids: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: 'Admin role required' },
        },
      },
    },

    '/admin/experts': {
      post: {
        tags: ['Admin'],
        summary: 'Create expert account',
        description: 'Admin-only. Creates a user with role=expert and an expert_profiles row in a single transaction. The expert is auto-verified and receives a welcome email with temporary credentials.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'firstName', 'lastName'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string', description: 'Temporary password. Expert should change after first login.' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  phoneNumber: { type: 'string' },
                  credentials: { type: 'string', example: 'CISSP, CEH' },
                  expertise_areas: { type: 'array', items: { type: 'string' }, example: ['Phishing', 'DDoS'] },
                  bio: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Expert account created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user_id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        first_name: { type: 'string' },
                        last_name: { type: 'string' },
                        role: { type: 'string', example: 'expert' },
                        email_verified: { type: 'boolean', example: true },
                        expertise_areas: { type: 'array', items: { type: 'string' } },
                        credentials: { type: 'string', nullable: true },
                        bio: { type: 'string', nullable: true },
                        created_at: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: 'Admin role required' },
          409: { description: 'Email already exists' },
          422: { description: 'Validation failed' },
        },
      },
    },

    '/admin/sessions/terminate': {
      post: {
        tags: ['Admin'],
        summary: 'Terminate user sessions',
        description: 'Admin-only. Revokes all tokens and sessions for the specified user, forcing re-authentication.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id'],
                properties: {
                  user_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'All sessions terminated' },
          403: { description: 'Admin role required' },
          404: { description: 'User not found' },
        },
      },
    },

    '/admin/users/{user_id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Suspend or reactivate user',
        description: 'Admin-only. Changes account_status. Suspending also revokes all sessions.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'user_id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['account_status'],
                properties: {
                  account_status: { type: 'string', enum: ['active', 'suspended'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Account status updated' },
          403: { description: 'Admin role required' },
          404: { description: 'User not found' },
          422: { description: 'Validation failed' },
        },
      },
    },

    '/admin/audit-logs': {
      get: {
        tags: ['Admin'],
        summary: 'Query audit logs',
        description: 'Admin-only. Returns a paginated, filterable list of audit log entries for all state-changing API actions.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'user_id', in: 'query', schema: { type: 'string', format: 'uuid' }, description: 'Filter by acting user' },
          { name: 'action', in: 'query', schema: { type: 'string', example: 'INCIDENT_CREATE' }, description: 'Filter by action type' },
          { name: 'resource_type', in: 'query', schema: { type: 'string', example: 'incident' }, description: 'Filter by resource type' },
          { name: 'resource_id', in: 'query', schema: { type: 'string' }, description: 'Filter by resource ID' },
          { name: 'start_date', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Inclusive start (ISO 8601)' },
          { name: 'end_date', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Inclusive end (ISO 8601)' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: {
          200: {
            description: 'Audit logs returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        audit_logs: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              audit_id: { type: 'string', format: 'uuid' },
                              user_id: { type: 'string', format: 'uuid', nullable: true },
                              action: { type: 'string', example: 'INCIDENT_CREATE' },
                              resource_type: { type: 'string', example: 'incident' },
                              resource_id: { type: 'string', nullable: true },
                              method: { type: 'string', example: 'POST' },
                              path: { type: 'string', example: '/api/v1/incidents' },
                              status_code: { type: 'integer', example: 201 },
                              ip_address: { type: 'string', nullable: true },
                              user_agent: { type: 'string', nullable: true },
                              details: { type: 'object', nullable: true },
                              created_at: { type: 'string', format: 'date-time' },
                            },
                          },
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            page: { type: 'integer' },
                            limit: { type: 'integer' },
                            total: { type: 'integer' },
                            total_pages: { type: 'integer' },
                            has_next_page: { type: 'boolean' },
                            has_prev_page: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          403: { description: 'Admin role required' },
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
        description: 'Generates a 6-digit OTP and sends it to the user\'s email. The code must be verified via POST /auth/mfa/verify to enable MFA.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'MFA setup code sent successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        message: { type: 'string', example: 'MFA setup initiated. A verification code has been sent to your email.' },
                      },
                    },
                  },
                },
              },
            },
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
                description: 'Provide either otp_code or mfa_code (at least one required).',
                properties: {
                  otp_code: {
                    type: 'string',
                    description: '6-digit one-time password from email.',
                    example: '123456',
                  },
                  mfa_code: {
                    type: 'string',
                    description: 'Alias for otp_code. Either field is accepted.',
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
                        token_type: { type: 'string', example: 'Bearer' },
                        expires_in: { type: 'integer', example: 900, description: 'Access token TTL in seconds.' },
                        session_timeout_seconds: { type: 'integer', example: 1800, description: 'Server-side session idle timeout.' },
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
                  device_id: {
                    type: 'string',
                    description: 'Optional device identifier for refresh-token binding.',
                    example: 'android_pixel_001',
                  },
                },
              },
              example: {
                email: 'testuser10@example.com',
                otp_code: '123456',
                device_id: 'android_pixel_001',
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
                        token_type: { type: 'string', example: 'Bearer' },
                        expires_in: { type: 'integer', example: 900, description: 'Access token TTL in seconds.' },
                        session_timeout_seconds: { type: 'integer', example: 1800, description: 'Server-side session idle timeout.' },
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
                        device_id: { type: 'string', example: 'android_pixel_001' },
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
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponse',
                },
              },
            },
          },
          401: {
            description: 'Biometric not enabled or account inactive',
          },
        },
      },
    },

    '/auth/google': {
      post: {
        tags: ['Auth'],
        summary: 'Login or register via Google Sign-In',
        description:
          'Verifies the Google ID token, creates the account if it does not exist, and returns access/refresh tokens. The account is automatically email-verified.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['idToken'],
                properties: {
                  idToken: {
                    type: 'string',
                    description: 'Google ID token obtained from the client-side Google Sign-In SDK.',
                    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
                  },
                  device_id: {
                    type: 'string',
                    description: 'Optional device identifier for refresh-token binding.',
                    example: 'android_pixel_001',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Google login successful. Returns tokens and user info.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user_id: { type: 'string', format: 'uuid' },
                        role: { type: 'string', example: 'reporter' },
                        user_type: { type: 'string', example: 'reporter' },
                        access_token: { type: 'string' },
                        refresh_token: { type: 'string' },
                        token_type: { type: 'string', example: 'Bearer' },
                        expires_in: { type: 'integer', example: 900 },
                        biometric_enabled: { type: 'boolean', example: false },
                        mfa_required: { type: 'boolean', example: false },
                        session_timeout_seconds: { type: 'integer', example: 1800 },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: 'Missing or invalid Google ID token.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: {
                      type: 'object',
                      properties: {
                        code: { type: 'string', example: 'GOOGLE_ID_TOKEN_REQUIRED' },
                        message: { type: 'string', example: 'Google ID token is required.' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Invalid token or unverified Google email.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: {
                      type: 'object',
                      properties: {
                        code: {
                          type: 'string',
                          enum: ['INVALID_GOOGLE_TOKEN', 'GOOGLE_EMAIL_NOT_VERIFIED'],
                        },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          403: {
            description: 'Account suspended or inactive.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: false },
                    error: {
                      type: 'object',
                      properties: {
                        code: { type: 'string', example: 'ACCOUNT_NOT_ACTIVE' },
                        message: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request password reset OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Reset code sent if account exists (always returns 200 to prevent email enumeration)',
          },
          422: {
            description: 'Validation failed',
          },
          429: {
            description: 'Rate limit exceeded',
          },
        },
      },
    },

    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset password using OTP',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'otp_code', 'new_password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'user@example.com' },
                  otp_code: { type: 'string', example: '123456', description: '6-digit code from email' },
                  new_password: { type: 'string', example: 'NewP@ssw0rd!', description: 'Must have uppercase, lowercase, number, and special char' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Password reset successfully. All sessions revoked.',
          },
          400: {
            description: 'Invalid or expired reset code',
          },
          422: {
            description: 'Validation failed',
          },
          429: {
            description: 'Rate limit exceeded',
          },
        },
      },
    },

    // Legacy auth routes (deprecated)
    '/auth/profile': {
      get: {
        tags: ['Auth'],
        summary: '[Deprecated] Get authenticated user profile',
        deprecated: true,
        description: 'Use GET /profile instead.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Profile returned successfully.' },
          401: { description: 'Access token required.' },
        },
      },
    },

    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: '[Deprecated] Change password',
        deprecated: true,
        description: 'Use PUT /profile/password instead.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', description: 'Must have uppercase, lowercase, number, and special char.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Password changed. All sessions revoked.' },
          401: { description: 'Current password incorrect.' },
          422: { description: 'Validation failed.' },
          429: { description: 'Rate limit exceeded (5/hour).' },
        },
      },
    },

    '/auth/account': {
      delete: {
        tags: ['Auth'],
        summary: '[Deprecated] Delete account',
        deprecated: true,
        description: 'Use DELETE /profile instead.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password', 'confirm_deletion'],
                properties: {
                  password: { type: 'string' },
                  confirm_deletion: { type: 'boolean', example: true, description: 'Must be true.' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Account anonymised. All sessions revoked.' },
          401: { description: 'Incorrect password.' },
          422: { description: 'Validation failed.' },
        },
      },
    },

    '/auth/biometric/register': {
      post: {
        tags: ['Auth'],
        summary: '[Deprecated] Register biometric device',
        deprecated: true,
        description: 'Use POST /auth/biometric/enroll instead.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['device_id'],
                properties: {
                  device_id: { type: 'string', example: 'android_pixel_001' },
                  device_name: { type: 'string', example: 'My Pixel 8' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Biometric enabled for device.' },
          401: { description: 'Access token required.' },
          429: { description: 'Rate limit exceeded (3/15min per user+device).' },
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
        description: 'Permanently anonymises the account (GDPR). Requires password confirmation and explicit confirm_deletion flag.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password', 'confirm_deletion'],
                properties: {
                  password: { type: 'string', description: 'Current account password for verification.' },
                  confirm_deletion: { type: 'boolean', description: 'Must be true to proceed.', example: true },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Account deleted successfully',
          },
          401: {
            description: 'Password confirmation failed',
          },
          422: {
            description: 'Validation failed (missing password or confirm_deletion)',
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
          {
            name: 'sort_by',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['created_at', 'updated_at', 'budget', 'status'],
              default: 'created_at',
            },
          },
          {
            name: 'sort_order',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['asc', 'desc'],
              default: 'desc',
            },
          },
        ],
        responses: {
          200: {
            description: 'Incident list returned',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        incidents: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              incident_id: { type: 'string', format: 'uuid' },
                              reporter_id: { type: 'string', format: 'uuid' },
                              incident_type: { type: 'string', example: 'Phishing' },
                              title: { type: 'string' },
                              description: { type: 'string' },
                              budget: { type: 'number', example: 5000 },
                              currency: { type: 'string', example: 'LKR' },
                              is_anonymous: { type: 'boolean' },
                              status: { type: 'string', example: 'Open' },
                              bid_count: { type: 'integer', example: 3 },
                              bid_window_ends_at: { type: 'string', format: 'date-time' },
                              created_at: { type: 'string', format: 'date-time' },
                              updated_at: { type: 'string', format: 'date-time' },
                            },
                          },
                        },
                        pagination: {
                          type: 'object',
                          properties: {
                            total: { type: 'integer', example: 25 },
                            page: { type: 'integer', example: 1 },
                            limit: { type: 'integer', example: 10 },
                            sort_by: { type: 'string', example: 'created_at' },
                            sort_order: { type: 'string', example: 'desc' },
                            total_pages: { type: 'integer', example: 3 },
                            has_next_page: { type: 'boolean', example: true },
                            has_prev_page: { type: 'boolean', example: false },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
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
            description: 'Incident details with inline bids array and attachments',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        incident: {
                          type: 'object',
                          properties: {
                            incident_id: { type: 'string', format: 'uuid' },
                            reporter_id: { type: 'string', format: 'uuid' },
                            incident_type: { type: 'string', example: 'Phishing' },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            budget: { type: 'number', example: 5000 },
                            currency: { type: 'string', example: 'LKR' },
                            is_anonymous: { type: 'boolean' },
                            status: { type: 'string', example: 'Open' },
                            bid_window_ends_at: { type: 'string', format: 'date-time' },
                            created_at: { type: 'string', format: 'date-time' },
                            updated_at: { type: 'string', format: 'date-time' },
                            bid_count: { type: 'integer', example: 2 },
                            bids: {
                              type: 'array',
                              items: {
                                type: 'object',
                                properties: {
                                  bid_id: { type: 'string', format: 'uuid' },
                                  incident_id: { type: 'string', format: 'uuid' },
                                  expert_id: { type: 'string', format: 'uuid' },
                                  proposed_approach: { type: 'string' },
                                  estimated_hours: { type: 'integer' },
                                  proposed_fee: { type: 'number' },
                                  status: { type: 'string', enum: ['Pending', 'Accepted', 'Declined'] },
                                  submitted_at: { type: 'string', format: 'date-time' },
                                  updated_at: { type: 'string', format: 'date-time' },
                                  expert_first_name: { type: 'string' },
                                  expert_last_name: { type: 'string' },
                                  expert_credentials: { type: 'string' },
                                  expert_expertise_areas: { type: 'array', items: { type: 'string' } },
                                  expert_completed_engagements: { type: 'integer' },
                                },
                              },
                            },
                          },
                        },
                        attachments: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              attachment_id: { type: 'string', format: 'uuid' },
                              file_name: { type: 'string' },
                              file_url: { type: 'string' },
                              file_size: { type: 'integer' },
                              mime_type: { type: 'string' },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
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
                currency: 'LKR',
                is_anonymous: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Incident updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Incident updated successfully.' },
                    data: {
                      type: 'object',
                      properties: {
                        incident: {
                          type: 'object',
                          properties: {
                            incident_id: { type: 'string', format: 'uuid' },
                            reporter_id: { type: 'string', format: 'uuid' },
                            incident_type: { type: 'string', example: 'Phishing' },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            budget: { type: 'number', example: 6500 },
                            currency: { type: 'string', example: 'LKR' },
                            is_anonymous: { type: 'boolean' },
                            status: { type: 'string', example: 'Open' },
                            bid_window_ends_at: { type: 'string', format: 'date-time' },
                            created_at: { type: 'string', format: 'date-time' },
                            updated_at: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Access token required',
          },
          404: {
            description: 'Incident not found',
          },
          409: {
            description: 'Incident cannot be edited (non-Open status)',
          },
          422: {
            description: 'Validation failed',
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
          404: {
            description: 'Incident not found',
          },
          409: {
            description: 'Only Open incidents can be deleted, or incident has an accepted bid',
          },
        },
      },
    },

    '/incidents/{incident_id}/status': {
      patch: {
        tags: ['Incidents'],
        summary: 'Update incident status',
        description: 'Status values are case-insensitive (e.g. "in progress" is accepted and normalised to "In Progress").',
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
                    description: 'Case-insensitive. Stored as title-case.',
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
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: "Incident status updated to 'In Progress'." },
                    data: {
                      type: 'object',
                      properties: {
                        incident: {
                          type: 'object',
                          properties: {
                            incident_id: { type: 'string', format: 'uuid' },
                            status: { type: 'string', example: 'In Progress' },
                            updated_at: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: 'Access token required',
          },
          404: {
            description: 'Incident not found',
          },
          409: {
            description: 'Cannot change status of a Completed or Cancelled incident',
          },
          422: {
            description: 'Validation failed',
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
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Bid placed successfully.' },
                    data: {
                      type: 'object',
                      properties: {
                        bid: {
                          type: 'object',
                          properties: {
                            bid_id: { type: 'string', format: 'uuid' },
                            incident_id: { type: 'string', format: 'uuid' },
                            expert_id: { type: 'string', format: 'uuid' },
                            proposed_approach: { type: 'string' },
                            estimated_hours: { type: 'integer', example: 3 },
                            estimated_time: { type: 'string', example: '3 hours' },
                            proposed_fee: { type: 'number', example: 4500 },
                            status: { type: 'string', example: 'Pending' },
                            submitted_at: { type: 'string', format: 'date-time' },
                            updated_at: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          404: {
            description: 'Incident not found',
          },
          409: {
            description: 'Duplicate bid, incident not open, or bidding window expired',
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
            description: 'Public expert profile with bio, credentials, and expertise areas',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        profile: {
                          type: 'object',
                          properties: {
                            user_id: { type: 'string', format: 'uuid' },
                            first_name: { type: 'string' },
                            last_name: { type: 'string' },
                            profile_picture_url: { type: 'string', nullable: true },
                            bio: { type: 'string', nullable: true },
                            expertise_areas: { type: 'array', items: { type: 'string' } },
                            credentials: { type: 'string', nullable: true },
                            availability_status: { type: 'string', enum: ['Available', 'Unavailable'] },
                            completed_engagements: { type: 'integer' },
                            past_jobs_count: { type: 'integer', description: 'Alias for completed_engagements' },
                            total_earned: { type: 'number' },
                            profile_created_at: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
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
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        notifications: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              notification_id: { type: 'string', format: 'uuid' },
                              type: { type: 'string', enum: ['NEW_BID', 'BID_ACCEPTED', 'BID_DECLINED', 'INCIDENT_UPDATE'] },
                              title: { type: 'string' },
                              message: { type: 'string', description: 'Notification body text' },
                              reference_id: { type: 'string', format: 'uuid', nullable: true },
                              is_read: { type: 'boolean' },
                              created_at: { type: 'string', format: 'date-time' },
                            },
                          },
                        },
                        unread_count: { type: 'integer' },
                        pagination: {
                          type: 'object',
                          properties: {
                            total: { type: 'integer', example: 15 },
                            page: { type: 'integer', example: 1 },
                            limit: { type: 'integer', example: 20 },
                            total_pages: { type: 'integer', example: 1 },
                            has_next_page: { type: 'boolean' },
                            has_prev_page: { type: 'boolean' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    '/notifications/push-token': {
      post: {
        tags: ['Notifications'],
        summary: 'Register or update FCM push token',
        description: 'Registers or updates the Firebase Cloud Messaging token for the authenticated user\'s device. The device is upserted automatically.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['device_id', 'fcm_token'],
                properties: {
                  device_id: { type: 'string', minLength: 3, maxLength: 255, example: 'android_pixel_001', description: 'Stable device identifier.' },
                  fcm_token: { type: 'string', minLength: 10, maxLength: 4096, description: 'FCM registration token obtained from the Firebase SDK on the client.' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Push token registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        device_id: { type: 'string', example: 'android_pixel_001' },
                        push_enabled: { type: 'boolean', example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          404: { description: 'Device not found for this user' },
          422: { description: 'Validation failed' },
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