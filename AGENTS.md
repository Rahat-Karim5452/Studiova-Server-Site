# AGENTS.md

## Run / verify

- The entire API is `index.js` (Express 5, ESM). There is no build step, no `start` script, no lint/typecheck, and no CI; start it with `node index.js` (default `PORT=8000`).
- `npm test` is the untouched scaffold stub (`echo "Error: no test specified" && exit 1`) — it always fails. Verify with a manual smoke test instead: `GET /` should return `{ "message": "Server is running fine!" }`.
- `jose` is a direct dependency because `index.js` imports it for JWT verification; keep it in `package.json`/`package-lock.json` or startup fails with `ERR_MODULE_NOT_FOUND`.
- `.env` is loaded by `dotenv/config`. Required: `MONGODB_URI`, `CLIENT_URL`; optional `PORT`. `CLIENT_URL` is not just a CORS value — auth fetches JWKS from `${CLIENT_URL}/api/auth/jwks` (BetterAuth), so protected routes need a reachable client auth endpoint.
- Local dev pairs with sibling `../Studiova-Client-Site`: its `NEXT_PUBLIC_API_URL` is `http://localhost:8000`. Keep this API running on that port, and keep `CLIENT_URL` pointing at the client dev server (default `http://localhost:3000`) or browser `fetch` calls and auth breaks.

## Architecture facts that are easy to miss

- One file owns the API: Mongo connection at module load (top-level `await`), middleware, all routes, and error handler. `app.listen` is guarded by `!process.env.VERCEL`, so importing locally starts a server but importing on Vercel does not.
- Database is `studiospace_db`, but the collections are `creative_spaces` (studios) and `reservations` (bookings). Old names `studios` / `bookings` only appear in comments — do not "fix" the code to use them.
- `creative_spaces.json` is seed/reference data only; no source file imports it. Editing it does not affect the API.
- Auth: send `Authorization: Bearer <token>`; `verifyToken` puts the JWT payload on `req.user`. Email-scoped routes (`/my-studios/:email`, `/my-bookings/:email`, `/host-bookings/:email`) additionally require the URL email to equal `req.user.email` (`verifyEmail`). Studio update/delete and booking status changes compare `ownerEmail` / `hostEmail` against `req.user.email` directly.
- Booking rules: only whole-hour `:00` start/end times and `YYYY-MM-DD` dates are accepted; new bookings are `Pending` with a snapshot of studio title/image/location/host email and computed `hours`/`totalPrice`. Overlap conflicts are checked only against `Confirmed` reservations, both on creation and again when a host confirms.
- The final error middleware hides details: clients get `{ "msg": "Server Error!" }`, so check server console output (`console.error(err)`) when debugging failures.

## Deployment

- `.vercel/project.json` links this directory to a Vercel project; it is gitignored locally.
- Vercel does not treat root `index.js` as a function. `api/index.js` imports the Express app and is the serverless handler; `vercel.json` rewrites all paths to it. Without that file/config committed, Vercel static-serves `index.js` as raw source at `/`. Commit `vercel.json` + `api/index.js` and redeploy; never rely on a local-only untracked config.
- Vercel needs `MONGODB_URI` and `CLIENT_URL` set in the dashboard (local `.env` is gitignored); in production `CLIENT_URL` must be the deployed client origin, not `localhost:3000`, or JWKS-based auth fails. Dependencies come from the lockfile, including `jose`.
