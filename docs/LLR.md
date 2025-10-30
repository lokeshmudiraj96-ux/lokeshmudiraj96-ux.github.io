# QuickBite Low-Level Requirements (LLR)

Version: 1.0.0  
Date: 2025-10-24

## 1. Scope and assumptions

This document decomposes the SRS into implementable low-level requirements for QuickBite’s MVP across services already present in the repo: API Gateway, Auth Service, Catalog Service, and React Frontend. It aligns with the current tech choices: Node.js/Express, SQL Server (mssql), Redis, JWT auth, Docker, and Azure App Service for Containers.

Assumptions (from codebase and session):
- Auth supports Email/Password and Phone OTP flows. JWT (access + refresh) stored client-side; refresh tokens persisted in DB. Redis available for OTP and blacklists.
- SQL Server is the primary DB; schema file at `quickbite-backend/auth-service/src/database/schema-sqlserver.sql` is applied.
- API Gateway exposes stable routes and forwards auth header to downstreams.
- Frontend is a React app (MUI) with Catalog, Cart, Checkout, Orders (placeholder), Auth pages, and Demo Mode fallback for local runs.

## 2. Cross-cutting concerns

- Authentication: Bearer access token (JWT) required for protected endpoints. Clock skew tolerance: ±60s. Tokens signed with HS256 using `JWT_SECRET` (min 32 chars).
- Authorization: Roles: customer, staff, admin, super_admin. MVP: customer-only front-facing flows.
- Request/Response format: JSON. Error format unified (see Section 9).
- IDs: UUID (DB as UNIQUEIDENTIFIER). Phone format E.164. Email RFC 5322-sane check.
- Timezone: UTC in backend; ISO 8601 strings on API.
- Security headers: Helmet enabled in services and CORS configured via `FRONTEND_URL`.

## 3. API Gateway LLR

- Routes:
  - /api/auth/* → auth-service
  - /api/catalog/* → catalog-service
- Pass-through headers: Authorization, x-request-id, correlation-id. Inject x-request-id if missing.
- Timeouts: 15s upstream timeout; 2 retries for idempotent GETs; no retry for POST/PUT/DELETE.
- Error mapping: Gateway returns upstream status and body unchanged; adds `gateway:true` in an `x-gw` header.
- Health: GET /health returns 200 {status:'ok', service:'api-gateway', time}.

## 4. Auth Service LLR

Base path: /api/auth and /api/users

### 4.1 Data model
- users(id, name, email UNIQUE, phone UNIQUE, password_hash, role, store_id NULL, is_verified BIT, is_active BIT default 1, created_at, updated_at)
- otps(id, phone, otp_code, purpose IN ('login','registration','password_reset'), expires_at, is_used)
- refresh_tokens(id, user_id FK users.id, token UNIQUE, expires_at, is_revoked)
- password_reset_tokens(id, user_id, token UNIQUE, expires_at, is_used)

Constraints:
- Password hash: bcrypt 10 rounds. Email UNIQUE, Phone UNIQUE. Trigger updates `updated_at` on user update.

### 4.2 Endpoints and contracts

- POST /api/auth/register
  - Request: {name, email, phone, password}
  - Validations: name 1..100; email valid, not used; phone E.164; password ≥8, contains letter+number
  - Effects: create user (is_verified=false), optionally send OTP (phase 2)
  - Response 201: {user: {id,name,email,phone,role,isVerified}, tokens: {accessToken, refreshToken, expiresIn}}
  - Errors: 400(validation), 409(email/phone exists)

- POST /api/auth/login
  - Request: {email, password}
  - Validations: email exists, password matches
  - Effects: issue tokens; record refresh token
  - Response 200: {user, tokens}
  - Errors: 401(invalid creds), 423(user inactive)

- POST /api/auth/otp/request
  - Request: {phone, purpose in ['login','registration','password_reset']}
  - Rate-limit: max 5 per phone per hour; min 30s between sends
  - Effects: generate 6-digit OTP, TTL 10 min; store in otps; send via SMS integration (mock in dev)
  - Response 200: {success:true, expiresAt}
  - Errors: 429(rate limit)

- POST /api/auth/otp/verify
  - Request: {phone, otp, purpose, name?, email?, password?}
  - Effects: verify latest unused OTP within TTL; for login: issue tokens; for registration: create user if not exists; set is_verified=true; mark OTP used
  - Response 200: {user, tokens}
  - Errors: 400(invalid/expired OTP), 409(email exists on registration)

- POST /api/auth/refresh
  - Request: {refreshToken}
  - Validations: exists, not revoked, not expired, belongs to user
  - Effects: issue new access + refresh; revoke old refresh
  - Response 200: {tokens}
  - Errors: 401(invalid refresh)

- POST /api/auth/logout
  - Request: {refreshToken}
  - Effects: revoke refresh token
  - Response 200: {success:true}

- GET /api/users/me (protected)
  - Response 200: {user: {id,name,email,phone,role,storeId,isVerified,createdAt}}

- PUT /api/users/me (protected)
  - Request: {name?, email?, phone?}
  - Validations: unique email/phone if changed; 1..100 name
  - Response 200: {user}

- PUT /api/auth/change-password (protected)
  - Request: {currentPassword, newPassword}
  - Validations: current matches; newPassword policy
  - Response 200: {success:true}

Removed: account deactivation endpoint (per cleanup).

### 4.3 Non-functional
- P99 latency: ≤300ms for read ops; ≤600ms for write ops under 50 RPS.
- Availability: 99.9% target (App Service). Health endpoint: GET /health.
- Secrets: DATABASE_URL, REDIS_URL, JWT_SECRET from environment.

## 5. Catalog Service LLR

Base path: /api/catalog

- GET /api/catalog/products
  - Query: page(default 1), pageSize(<=50), q(optional), tags(optional array)
  - Response: {products:[{id,name,price,image,tags}], page, pageSize, total}
  - Sorting: default by popularity desc, then name asc

- GET /api/catalog/products/:id
  - Response 200: {id,name,description,price,image,tags,nutrition?}
  - 404 if not found

- Data: SQL schema with products, categories (to be added). For MVP, stub or seed a few items.

## 6. Frontend LLR (React)

Routes and pages:
- / (Landing): marketing content + CTA to Register/Login and Browse
- /catalog (Catalog): list products; add to cart
- /cart (Cart): edit qty, remove, show totals
- /checkout (Checkout): protected; collect address/name/phone; submit order (MVP: simulate)
- /orders (Orders): protected; placeholder; later fetch order history
- /login and /register: email/password + OTP flows; uses AuthContext

State:
- AuthContext holds user + tokens; Demo Mode supported via `.env`
- CartContext persists to localStorage and computes totals; simple tax (8%) + flat delivery

API:
- Reads `REACT_APP_API_URL`; sets axios defaults; sends Authorization bearer

Accessibility:
- Buttons and inputs have labels/roles; color contrast at least 4.5:1 for text where possible.

## 7. Observability

- Each service exposes GET /health with service name and timestamp.
- Structured logs: JSON with fields: ts, level, service, reqId, method, path, status, latencyMs.
- Correlation: Generate x-request-id at gateway, propagate downstream, include in logs.

## 8. Security

- Helmet enabled; CORS restricted to FRONTEND_URL in prod.
- JWT secret length ≥32 chars; rotate quarterly; store in secret manager.
- OTP codes: random numeric 6 digits; TTL 10 min; store hashed (phase 2) or plaintext (MVP acceptable); single-use.
- Rate limiting: OTP request per phone, login failure per IP (e.g., 10/min), refresh endpoint (30/min per user).

## 9. Error model

- Error response JSON shape:
```
{ "success": false, "message": "human-friendly", "code": "AUTH.INVALID_CREDENTIALS", "details": {...?} }
```
- Common codes:
  - AUTH.INVALID_CREDENTIALS, AUTH.USER_INACTIVE, AUTH.DUPLICATE_EMAIL, AUTH.DUPLICATE_PHONE
  - OTP.INVALID, OTP.EXPIRED, OTP.RATE_LIMITED
  - TOKEN.INVALID, TOKEN.EXPIRED, TOKEN.REVOKED
  - CATALOG.NOT_FOUND
  - VALIDATION.FAILED

## 10. Performance and limits

- Request body size: 1 MB default.
- Pagination default: pageSize=20, max=50.
- OTP rate: 5/hour/phone; resend cooldown 30s.
- Password hashing cost: bcrypt rounds=10 (adjustable by env).

## 11. Edge cases

- Email/phone change should re-verify is_verified=false until confirmed (phase 2).
- Concurrent refresh: only one valid refresh at a time (rotate on refresh; revoke older).
- Deactivated user (if feature reintroduced) must be blocked from auth.
- Clock skew between services up to 60s.

## 12. CI/CD and deployment

- Build containers for services; push to ACR. Web App for Containers (Linux) on Azure App Service.
- App settings:
  - WEBSITES_PORT=3001 (auth-service)
  - FRONTEND_URL, JWT_SECRET, DATABASE_URL, REDIS_URL
- Health check path: /health. Startup command: default `node src/server.js`.
- Quotas: App Service B1 or higher (Linux custom containers). Free (F1) not supported.

## 13. Acceptance criteria (happy path + boundaries)

Auth
- Register → 201 with tokens; duplicate email → 409; invalid email → 400.
- Login (valid) → 200 with tokens; invalid password → 401; inactive → 423.
- OTP request within limits → 200; 6th request within hour → 429.
- OTP verify with correct code within TTL → 200; wrong code → 400.
- Refresh with valid token → 200; using the same refresh again → 401 (revoked).

Users
- GET /users/me with valid access token → 200; without token → 401.
- PUT /users/me change name only → 200; email to duplicate → 409.

Catalog
- GET /catalog/products default → 200 with <=20 items; pageSize>50 → 400.
- GET /catalog/products/:id missing → 404.

Frontend
- Cart totals update on qty change; persistence across reloads.
- Checkout requires auth; redirects to /login when unauthenticated.

## 14. Traceability

- SRS: Auth (registration, login, OTP), Catalog (browse menu), Orders (placeholder), Security (JWT, OTP), NFRs (performance, availability), Deployment (Azure).
- Code: See `quickbite-backend/auth-service/src/*`, `quickbite-backend/frontend/src/*`.

## 15. Future work (beyond MVP)

- Managed Identity to access SQL with AAD; remove SQL auth.
- Full Orders/Payments workflow; webhooks for payment provider.
- OTP hashing and HMAC-based code generation; device fingerprints.
- Multi-tenant stores/restaurants, search, filters.
- Observability: OpenTelemetry traces and metrics; centralized logging.
