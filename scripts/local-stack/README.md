# Local dev stack

Supabase-compatible backend from images already on disk (GoTrue, PostgREST,
Storage, Mailpit, Supabase Postgres) plus a tiny gateway. Used for end-to-end
simulator testing without touching the production project.

    bash scripts/local-stack/up.sh "$ANON" "$SERVICE"   # containers + migrations
    node scripts/local-stack/gateway.mjs                # http://127.0.0.1:55321
    npm run start:local                                 # Metro pointed at the stack

Dev-only JWT secret: `filo-local-dev-jwt-secret-not-for-production-use`.
The anon/service keys are HS256 JWTs signed with it (generate with
`node scripts/local-stack/keys.mjs`). Sign-in codes land in Mailpit:
http://127.0.0.1:55025. The `filo.test` domain is allow-listed **locally only**.

**Hosted project:** the "Magic Link" and "Confirm signup" email templates must
contain `{{ .Token }}`, since the app signs in with a 6-digit code.
