# ELITE / ONE — Full-Stack stage

The original Apple Fitness+-style public site is preserved. Its client and trainer surfaces now use an Express API, PostgreSQL, Prisma and signed HTTP-only session cookies. Public editorial pages remain static by design; all account, profile, plan, progress and note data is read from PostgreSQL.

## Audit of the inherited project

| Area | Original state | Current state |
| --- | --- | --- |
| Stack | Static HTML, CSS and vanilla JS hash SPA | Same visual SPA plus Express API and Prisma |
| Dependencies | No `package.json` or Node runtime | `package.json` with runtime and Prisma dependencies |
| Data | Hard-coded arrays and `localStorage` notes | PostgreSQL models and API queries |
| Auth | Link to a demo client screen | Registration, login, logout, HTTP-only JWT cookie |
| Private notes | Browser-local and reachable by URL | Server authorisation and trainer-scoped database queries |

The previous unfinished/demo pieces were the contact form, login link, client cabinet, trainer client list/search, progress display, nutrition display and notes. They had no backend, persistence or server access checks. The contact enquiry itself is intentionally still a non-persistent marketing form; it is not presented as submitted to a CRM.

## Prerequisites

- Node.js **20.19+** and npm
- PostgreSQL 15+ (local or managed)

On Windows with winget:

```powershell
winget install OpenJS.NodeJS.LTS
winget install PostgreSQL.PostgreSQL
```

Restart PowerShell after Node installation and create a PostgreSQL database/user. Do not use the example password outside local development.

## Local setup

```powershell
Copy-Item .env.example .env
# Edit .env: DATABASE_URL and JWT_SECRET are mandatory.
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run check
npm run dev
```

Open `http://localhost:3000` — do not open `index.html` directly, because the full application uses same-origin API requests and secure cookies.

`npm run prisma:seed` creates a development ADMIN plus the exercise catalogue. Its credentials come from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; replace them before sharing an environment. The seed does not create a fake session or bypass authentication.

## Data model

Prisma models: `User`, `ClientProfile`, `TrainerProfile`, `Workout`, `Exercise`, `TrainingProgram`, `NutritionPlan`, `ProgressRecord`, `TrainerNote`, `Appointment`, and the necessary `WorkoutExercise` join model. The schema adds indexes for client/trainer ownership and time-series reads, and preserves historical plans and progress data rather than overwriting them.

## Access policy

- `CLIENT` requests never accept an arbitrary client id: every query is constrained to the authenticated user's `clientProfile.id`.
- `TRAINER` client queries first verify `trainerId === authenticated trainer profile id` and return 404 for another trainer's client.
- Trainer notes require `TRAINER` (not merely an admin UI role), are queried by `author trainerId`, and client API routes never select them.
- `ADMIN` may inspect client management data but has no notes endpoint. UI visibility is never used as an authorisation mechanism.
- Passwords use bcrypt (12 rounds); the JWT is signed, short-lived and kept in an HTTP-only, same-site cookie.

## Verification checklist after services are available

```powershell
npm run check
Invoke-RestMethod http://localhost:3000/api/health
```

Then test from two distinct client accounts and two trainers:

1. A client reads `/api/client/*` and cannot request another profile by id.
2. A trainer can create/search/edit only their assigned clients.
3. Trainer B requests Trainer A's client or note id and receives 404.
4. A client calling `/api/trainer/notes` receives 403.
5. A trainer creates a programme, workout, nutrition plan, progress record, appointment and private note; the assigned client sees only the intended workout/nutrition/progress/appointment.

## Environment / external services

The only required external service is PostgreSQL. A production deployment also needs a deployment-specific `JWT_SECRET`, HTTPS (`NODE_ENV=production` makes the cookie secure), and a managed PostgreSQL `DATABASE_URL`. Email invitations, password reset and production admin provisioning are intentionally not wired to an email provider; add one such as Resend/Postmark before offering those flows publicly.
