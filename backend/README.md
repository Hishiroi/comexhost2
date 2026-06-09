# COMEX Approval - Backend

Production-ready Node.js + Express + MySQL backend for the COMEX
Approval / Document Workflow platform. It powers an Angular frontend
that can be deployed on a different host (cross-origin), and it
implements:

- JWT-based authentication with role auto-detection from the database.
- Server-side session termination via a `token_version` counter (logout
  invalidates the JWT, not just the local copy).
- Strict role-based access control for **Teacher (1)**, **Coordinator (2)**,
  **Master (3)** and **Principal/Admin (4)** - enforced on EVERY request.
- PDF upload (with magic-byte verification), listing, viewing, downloading.
- Structured comments / revisions and a forwarding workflow:
  Teacher upload -> Coordinator -> Master -> Principal/Admin (finalize).
- Hardened defaults: helmet security headers, strict CORS allowlist,
  rate limiting, SSR/SQLi/XSS-safe handlers, no stack-trace leakage,
  graceful shutdown, structured logs.

## 1. Requirements

- Node.js 18+
- MySQL 5.7+ / MariaDB 10.4+ (Laragon's default works fine)

## 2. Quick start (local)

```bash
cd backend
npm install
copy .env.example .env       # (Windows) edit .env with your DB credentials
npm run db:init              # creates the database + tables (idempotent)
npm run db:seed              # creates the bootstrap admin account
npm run dev                  # API on http://localhost:3000
```

Default admin (configurable in `.env`):

```
email:    admin@comex.local
password: Admin@12345
```

## 3. Folder layout

```
backend/
├── sql/schema.sql           # full MySQL schema (users / files / comments)
├── uploads/                 # stored PDFs (gitignored)
└── src/
    ├── config/              # env validation + db pool (with optional SSL)
    ├── middleware/          # auth, role gate, multer upload, cors, rate-limit, request-id
    ├── controllers/         # auth / user / file / comment logic
    ├── routes/              # express routers
    ├── utils/               # roles, status, jwt, validate, logger
    ├── scripts/             # db:init (idempotent), db:seed
    ├── app.js               # express app factory
    └── server.js            # entry point + graceful shutdown
```

## 4. Database overview

| Table     | Purpose                                                                 |
| --------- | ----------------------------------------------------------------------- |
| users     | All accounts. `role_level` (1-4) drives permissions. `token_version` is incremented on logout to invalidate JWTs. |
| files     | Uploaded PDFs with `current_level` and `status` describing the workflow.|
| comments  | Comments / revisions / forward / finalize events linked to file + user. |

`files.status` values:

- `uploaded` - just submitted by a Teacher (queue for Coordinator)
- `reviewed_by_coordinator` - Coordinator forwarded to Master
- `reviewed_by_master` - Master forwarded to Principal
- `finalized` - Principal finalized the document
- `returned` - reserved for future "send back" feature

## 5. Authentication & sessions

- Login (`POST /api/auth/login`) returns a signed JWT and the user's
  profile. The token's payload includes `sub` (user id), `role`, `tv`
  (token_version) and the configured `iss` / `aud` claims.
- Every protected request must send `Authorization: Bearer <token>`.
  The `authenticate` middleware verifies the signature, looks the user
  up, ensures the user is still active AND that `payload.tv` matches
  `users.token_version`. Any mismatch returns **401**.
- The Angular frontend re-validates its stored token on app boot via
  `GET /api/auth/me`, so a page refresh keeps the user logged in only
  while the token is still genuinely valid.
- Logout (`POST /api/auth/logout`) increments `token_version`, which
  immediately invalidates every previously issued JWT for that user
  (true server-side session termination on top of stateless JWT).
- Failed logins use a constant-time compare path and a generic error
  message to prevent user enumeration / timing attacks.

## 6. API

All authenticated routes require `Authorization: Bearer <token>`.

### Auth

| Method | Path                | Who      | Description                                  |
| ------ | ------------------- | -------- | -------------------------------------------- |
| POST   | `/api/auth/login`   | public   | `{ email, password }` -> `{ token, user, redirect }` |
| GET    | `/api/auth/me`      | any user | Re-validates the JWT; returns current user.  |
| POST   | `/api/auth/logout`  | any user | Invalidates all tokens for the current user. |

The login response includes a `redirect` hint
(`/teacher/home`, `/coard/dashboard`, `/master/dashboard`, `/admin/dashboard`)
so the frontend can route to the correct dashboard.

### Users (Admin only)

| Method | Path                       | Description                                 |
| ------ | -------------------------- | ------------------------------------------- |
| POST   | `/api/users`               | Create Teacher/Coordinator/Master account.  |
| GET    | `/api/users`               | List users (optional `?role_level=`).       |
| PATCH  | `/api/users/:id/active`    | `{ is_active: boolean }`                    |

Create user payload (admins cannot create another admin via this endpoint):

```json
{ "name": "Jane Doe", "email": "jane@school.edu", "password": "InitialPass123", "role_level": 1 }
```

Passwords must be 8-128 chars and contain letters AND digits; they're
hashed with bcrypt (cost 12 in production).

### Files

| Method | Path                          | Who                       | Description                                       |
| ------ | ----------------------------- | ------------------------- | ------------------------------------------------- |
| POST   | `/api/files`                  | Teacher                   | Multipart PDF upload (`file`, `title`, `description?`). PDF magic bytes are verified server-side. |
| GET    | `/api/files`                  | All                       | Visibility-filtered list. Filters: `status`, `current_level`, `mine=1`. |
| GET    | `/api/files/:id`              | All (visible)             | File metadata + comments timeline.                |
| GET    | `/api/files/:id/download`     | All (visible)             | Streams the stored PDF (inline).                  |
| POST   | `/api/files/:id/comments`     | Coord / Master / Admin    | `{ body, action?: 'comment' \| 'revision' }`      |
| POST   | `/api/files/:id/forward`      | Coord / Master            | Moves file to next level. Optional `body`.        |
| POST   | `/api/files/:id/finalize`     | Admin                     | Marks file finalized. Optional `body`.            |

Visibility rules (enforced at the SQL query level):

- Teacher (1): only files they uploaded.
- Coordinator (2): files at `current_level >= 2`.
- Master (3): files at `current_level >= 3`.
- Admin (4): all files.

Action rules (who can comment / forward / finalize):

- A reviewer can only act when the file's `current_level` matches their role.
- Teachers are read-only on their own files after submission.
- The Principal/Admin can comment on any file and finalize anything.

## 7. Cross-origin deployment

Frontend and backend can live on completely different hosts (e.g.
`https://comex.example.com` -> `https://api.comex.example.com`).

In `backend/.env`, list the frontend origin(s) you want to allow:

```env
CORS_ORIGIN=https://comex.example.com,https://staging.comex.example.com
CORS_CREDENTIALS=false
TRUST_PROXY=1
```

The backend's CORS middleware:

- Accepts a comma-separated allowlist (or `*` for fully public APIs).
- Refuses to combine `*` with `CORS_CREDENTIALS=true` (browsers reject it).
- Whitelists `GET, POST, PATCH, PUT, DELETE, OPTIONS`.
- Allows the headers the frontend actually sends:
  `Content-Type, Authorization, Accept, X-Requested-With, X-Request-Id`.
- Exposes `X-Request-Id` and `Content-Disposition`.
- Caches preflights for 24h.

Any other origin is rejected with 403 and logged for monitoring.

## 8. Security checklist (what's already done)

- [x] Bcrypt password hashing (cost 12 in prod, configurable).
- [x] Strong password policy (length + letters + digits).
- [x] Stateless JWT with `iss` / `aud` claims and HS256.
- [x] Server-side session termination via `token_version` (true logout).
- [x] Boot-time refusal to start with weak `JWT_SECRET` in production.
- [x] Strict CORS allowlist + safe defaults.
- [x] Helmet security headers (HSTS, X-Frame-Options, X-Content-Type-Options).
- [x] Global + per-endpoint rate limiting (`/api/auth/login` is stricter).
- [x] Parameterized SQL everywhere (mysql2 `?` placeholders) - SQLi-safe.
- [x] Input validation + length caps + null-byte stripping.
- [x] Multer + PDF magic-byte verification + path-traversal defense.
- [x] CSRF: not applicable - we use Bearer tokens in the Authorization
      header, not cookies. If you ever switch to cookie sessions, add
      a CSRF token middleware.
- [x] Centralized error handler that NEVER leaks stack traces to the client.
- [x] Structured JSON logging in production with per-request `X-Request-Id`.
- [x] Graceful shutdown (SIGINT/SIGTERM): closes HTTP + DB pool cleanly.
- [x] DB SSL is opt-in via `DB_SSL=true` for managed databases.

## 9. Example end-to-end flow

```bash
# 1) admin login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@comex.local","password":"Admin@12345"}'

# 2) admin creates a teacher
curl -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Tina Teacher","email":"tina@school.edu","password":"Teach1234","role_level":1}'

# 3) teacher uploads a PDF
curl -X POST http://localhost:3000/api/files \
  -H "Authorization: Bearer <TEACHER_TOKEN>" \
  -F "title=Lesson Plan Q1" \
  -F "description=First quarter plan" \
  -F "file=@./lesson_plan.pdf"

# 4) coordinator comments and forwards to master
curl -X POST http://localhost:3000/api/files/1/comments \
  -H "Authorization: Bearer <COORD_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"body":"Please tighten the objectives section","action":"revision"}'

curl -X POST http://localhost:3000/api/files/1/forward \
  -H "Authorization: Bearer <COORD_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"body":"Looks good, forwarding to Master"}'

# 5) admin finalizes
curl -X POST http://localhost:3000/api/files/1/finalize \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"body":"Approved for release"}'

# 6) any logged-in user can log out (invalidates their JWT server-side)
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer <ANY_TOKEN>"
```

## 10. Connecting from the Angular frontend

The Angular app already includes:

- `src/environments/environment*.ts` - configures `apiUrl`.
  - `environment.development.ts`: `http://localhost:3000/api`
  - `environment.ts` (production): set this to your deployed backend URL.
- `core/services/auth.service.ts` - login, refresh, logout, and the
  reactive `user()` / `roleLevel()` signals.
- `core/interceptors/auth.interceptor.ts` - attaches the JWT to every
  API request (and ONLY to URLs that start with `apiUrl`, so the token
  is never leaked to third parties).
- `core/interceptors/error.interceptor.ts` - on 401 it clears the local
  session (no recursive call back to the API) and redirects to `/login`;
  on 403 it routes the user to their own dashboard.
- `core/guards/{auth,login,role}.guard.ts` - all dashboards/sections are
  wrapped with `authGuard` + `roleGuard(N)`. The very first page is
  always `/login`.
- `provideAppInitializer` in `app.config.ts` calls `auth.refresh()` on
  app boot, so a page refresh keeps the user logged in only while the
  backend confirms the token is still valid.

You can deploy the frontend to one host (Vercel, Netlify, Render Static,
S3+CloudFront, ...) and the backend to another (Render, Railway, Fly,
EC2, ...) with no code change - just make sure:

1. The frontend's production build points to the deployed `apiUrl`.
2. The backend's `CORS_ORIGIN` includes the deployed frontend URL.
3. The backend has a strong `JWT_SECRET` and (for managed MySQL) `DB_SSL=true`.
