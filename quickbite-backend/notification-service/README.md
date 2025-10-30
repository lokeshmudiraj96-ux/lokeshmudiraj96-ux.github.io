# QuickBite Notification Service

Implements LLR-NOTIF-001..006: send notifications (PUSH/EMAIL/SMS), status check, retry failed, priority handling, security, and auditing/logging.

## Endpoints

- POST `/api/notifications/send` → { notification_id, status }
- GET `/api/notifications/status/{notification_id}` → { notification_id, status, timestamp_sent }
- POST `/api/notifications/retry/{notification_id}` → { notification_id, status } or error
- GET `/health` → health check

All endpoints require `Authorization: Bearer <token>` and optionally validate via `AUTH_INTROSPECT_URL`.

## Env

- `PORT` (default 3007)
- `NOTIF_DATABASE_URL` or `DATABASE_URL` (PostgreSQL)
- `AUTH_INTROSPECT_URL` (optional)
- `AUTH_USER_LOOKUP_URL` (optional; e.g., http://localhost:3001/api/users)
- `FAIL_NOTIF` (optional; when `true`, simulates provider failures)

## Run (PowerShell)

```powershell
$env:NOTIF_DATABASE_URL = "postgres://user:pass@localhost:5432/quickbite"
$env:AUTH_INTROSPECT_URL = "http://localhost:3001/api/auth/introspect"  # optional
# $env:AUTH_USER_LOOKUP_URL = "http://localhost:3001/api/users"         # optional
# $env:FAIL_NOTIF = "true"                                              # simulate failures
npm start
```

## Quick test (PowerShell + curl)

```powershell
# Replace <TOKEN> with a valid JWT (or any string if introspection is not enforced)
$headers = @{ Authorization = "Bearer <TOKEN>"; 'Content-Type' = 'application/json' }

# 1) Send notification
$body = '{
  "user_id": "11111111-1111-1111-1111-111111111111",
  "type": "PUSH",
  "title": "Order Update",
  "message": "Your order is being prepared",
  "priority": "HIGH"
}'
Invoke-RestMethod -Method Post -Headers $headers -Uri http://localhost:3007/api/notifications/send -Body $body

# 2) Check status
# Invoke-RestMethod -Method Get -Headers $headers -Uri http://localhost:3007/api/notifications/status/<notification_id>

# 3) Retry if FAILED
# Invoke-RestMethod -Method Post -Headers $headers -Uri http://localhost:3007/api/notifications/retry/<notification_id>
```

## Notes

- Priority HIGH is sent immediately; MEDIUM/LOW also sent immediately in this MVP (no queue yet).
- All events are logged in `notification_events` table for auditing (LLR-NOTIF-006).
