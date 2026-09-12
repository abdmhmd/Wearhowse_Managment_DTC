---
title: LOGIN UX IMPROVEMENT REPORT
phase: Login Error-Messaging & Credential-Handling UX
status: IMPLEMENTED AND SECURE
date: 2026-09-12
branch: remediation/role-model-v2
commits:
  - 429ebb0 feat(auth): add progressive delay on repeated login failures
  - 3d7429a feat(auth): return attempt count and reset hint on login failure
  - c9f6a0e feat(frontend): add login form validation, forgot-password link, error UX
  - 41afd5b feat(i18n): add login error translations (EN + AR)
  - ed11dbc test(auth): add login error UX suite (backend + frontend)
---

# Login UX Improvement Report

## 1. Security Review

| Concern | Status | Notes |
| --- | --- | --- |
| Username enumeration via error text | Resolved | All malformed/not-found/wrong-password logins return the identical `AUTH_INVALID_CREDENTIALS` body. |
| Username enumeration via timing | Mitigated | Unknown usernames run a real bcrypt compare against a fixed dummy hash (`DUMMY_TIMING_HASH`), equalizing response time with the wrong-password path. |
| Username enumeration via format validation | Resolved | Client-side format rules are surfaced ONLY to the legitimate user in the browser; the server performs no stricter pre-validation — malformed input returns the same generic code. |
| Identifies which specific field is wrong | Resolved | Single generic message: "Username or password is incorrect." |
| Rate limiting weakened | No | `loginLimiter` untouched. Existing limit still enforced (per-IP), plus a new progressive response delay per (username, IP). |
| bcrypt cost reduced | No | Still cost-10 bcrypt via `verifyPassword`. |
| session / token_version / revocation touched | No | Unchanged. |
| aggressive vs trusted delay choice | Aggressive | Failures ALWAYS delay (1 s → 8 s from attempt 5), including for wrong-password on real accounts — correct-password users of a targeted account are throttled together with the attacker, at the cost of no early-out optimization. |

## 2. Backend Changes

| File | Change |
| --- | --- |
| `src/modules/auth/loginAttempts.ts` (new) | In-memory `LoginAttemptTracker`: registers failures keyed by `username\|ip` (15-min window), exposes progressive `delayFor(count)`, resets on success, prunes expired entries, caps at 10k keys. Matches the existing express-rate-limit MemoryStore precedent; no migration needed. |
| `src/modules/auth/auth.controller.ts` | Login failure pipeline: parse failures now throw the generic `AUTH_INVALID_CREDENTIALS` (was 400 `VALIDATION_ERROR`); every failure registers the streak + waits the progressive delay; success resets the streak; unknown usernames run dummy-bcrypt timing equalization; `AUTH_INVALID_CREDENTIALS` responses carry `details: { attempt_count, show_reset_hint }`. |
| `tests/integration.test.ts` | Missing-fields login assertion updated 400 → 401 + `error.code === 'AUTH_INVALID_CREDENTIALS'` (Task-3 contract). |
| `tests/auth/auth.test.ts` | Unit-level missing-fields test updated to the same 401 contract. |
| `tests/auth/rate-limit.test.ts` | Window 1000 ms → 6000 ms (reset-wait 1200 ms → 6200 ms). Rationale appended in-file: the mandatory ~200 ms failure floor means a 1 s window expires the first attempts before a 4th arrives, so the 429 could never fire — the semantic under test (max allowed → 429 → free after window) is unchanged. |
| `tests/auth/login-errors.test.ts` (new) | 8 tests: unknown→generic; wrong-password byte-identical to unknown; missing fields generic; 3rd failure shows `attempt_count 3` + `show_reset_hint true`; success resets streak; disabled account; legacy role; progressive delay ≥ 900 ms on the 5th attempt. |

## 3. Frontend Changes

| File | Change |
| --- | --- |
| `src/schemas/auth.schema.ts` | Hardened client validation: username `trim().min(3)` / allow-list regex / `max(50)`; password `min(6)`. Messages are i18n key paths. |
| `src/pages/auth/LoginPage.tsx` | Inline error box (`role="alert"`) with code-specific messages; progressive-delay hints ("N attempt(s) remaining…" from attempt 2, "Try resetting your password." at attempt 3+); `Link` to `/forgot-password`; "Signing in…" + disabled button during submit; `skipApiErrorToast` on the request so the global toast never double-fires. |
| `src/pages/auth/ForgotPasswordPage.tsx` (new) | Stub page with contact placeholder (`auth.login.forgotPasswordHelp` + `auth.forgotPasswordDetails`); wired route `/forgot-password` in `src/App.tsx`. |
| `src/api/auth.api.ts` | Login POST passes `{ skipApiErrorToast: true }`. |
| `src/api/client.ts` | Response interceptor skips its toast when the failing config sets `skipApiErrorToast` (error still rejects for the caller). |
| `src/utils/apiErrors.ts` | New mappings: `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_DISABLED`, `AUTH_ROLE_DISABLED`, `AUTH_RATE_LIMITED`. |

## 4. Error Code Matrix

| Path | HTTP | `error.code` | EN message | AR message |
| --- | --- | --- | --- | --- |
| Malformed/missing fields | 401 | `AUTH_INVALID_CREDENTIALS` | Username or password is incorrect. | اسم المستخدم أو كلمة المرور غير صحيحة. |
| Unknown username | 401 | `AUTH_INVALID_CREDENTIALS` | Username or password is incorrect. | اسم المستخدم أو كلمة المرور غير صحيحة. |
| Wrong password (+ audit log) | 401 | `AUTH_INVALID_CREDENTIALS` | Username or password is incorrect. | اسم المستخدم أو كلمة المرور غير صحيحة. |
| Account inactive | 401 | `AUTH_ACCOUNT_DISABLED` | Your account is disabled. Contact your administrator. | حسابك معطّل. تواصل مع مسؤول النظام. |
| Deactivated legacy role | 401 | `AUTH_ROLE_DISABLED` | Your role is inactive. Contact your administrator. | دورك غير نشط. تواصل مع مسؤول النظام. |
| Rate limited | 429 | `TOO_MANY_REQUESTS` (mapped client-side to `AUTH_RATE_LIMITED`) | Too many login attempts. Please try again later. | محاولات تسجيل دخول كثيرة. يرجى المحاولة لاحقاً. |
| Successful login | 200 | — | Welcome back, {{name}}! | مرحباً بعودتك، {{name}}! |

`details` is ONLY attached to `AUTH_INVALID_CREDENTIALS` (`{ attempt_count, show_reset_hint }`), never to the account/role/rate-limit errors.

## 5. Progressive Delay Table

| Consecutive failures (username+IP) | Additional delay |
| --- | --- |
| 1–4 | 0 ms (constant-time floor 200 ms applies to every failed login) |
| 5 | 1,000 ms |
| 6 | 2,000 ms |
| 7 | 4,000 ms |
| 8+ | 8,000 ms (cap) |
| Successful login | streak reset |

## 6. i18n Coverage

New keys live under `auth.login`, mirrored in `src/locales/en/translation.json` and `src/locales/ar/translation.json`:

| Group | Keys | EN / AR count | Parity |
| --- | --- | --- | --- |
| `auth.login.*` chrome | `title`, `submit`, `submitting`, `forgotPassword` | 4 / 4 | ✔ |
| `auth.login.attempts.*` | `remaining`, `resetHint` | 2 / 2 | ✔ |
| `auth.login.errors.*` | `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_DISABLED`, `AUTH_ROLE_DISABLED`, `AUTH_RATE_LIMITED`, `ERROR` | 5 / 5 | ✔ |
| `auth.login.validation.*` | `USERNAME_TOO_SHORT`, `USERNAME_INVALID_CHARS`, `USERNAME_TOO_LONG`, `PASSWORD_TOO_SHORT` | 4 / 4 | ✔ |
| top-level `auth.*` | `forgotPasswordTitle`, `forgotPasswordHelp`, `forgotPasswordDetails` (kept existing `username`, `password`, `welcomeBack`) | 3 / 3 | ✔ |

Total added: 18 keys per language; EN ↔ AR parity 100%.

## 7. Tests

| Suite | Count | Verifies |
| --- | --- | --- |
| Backend `tests/auth/login-errors.test.ts` | 8 | Generic-code contract (unknown / wrong-password byte-identical, missing fields), attempt metadata, reset-on-success, disabled account, legacy role, progressive delay timing. |
| Backend existing suites | 607 | Unchanged behavior — all pass with the hardened login path (including the aligned integration/auth/rate-limit cases). |
| Frontend `src/test/login.test.tsx` | 12 | Validation messages ×4, successful submission + session storage, `skipApiErrorToast` flag on the real request, generic error, remaining-attempt hint, reset hint, disabled-account message, forgot-password link, pending-state disabled button. |
| Frontend `src/__tests__/apiErrors.test.ts` | +4 | New API-error-code mappings. |

Totals: backend **615** (64 suites), frontend **78** (9 files) — all green.

## 8. Verification

| Command | Result |
| --- | --- |
| Backend `npx tsc --noEmit` | Clean |
| Backend `npm test` (jest) | 615 passed / 64 suites |
| Frontend `npm run typecheck` | Clean |
| Frontend `npm test` (vitest) | 78 passed / 9 files |
| Frontend `npm run build` | Built in 3.38 s |

## 9. Manual Test Scenarios

1. **Valid login** — correct username/password → success toast `Welcome back…`, redirected to `/`.
2. **Wrong password x1** — generic "Username or password is incorrect.", no field/precision hint, no `show_reset_hint`.
3. **Wrong password x2** — generic error + "1 attempt(s) remaining before additional delay."
4. **Wrong password x3** — generic error + "Having trouble? Try resetting your password."
5. **Correct password after 2 failures** — logs in; streak resets (next failure starts at attempt 1).
6. **Unknown username** — message, code and timing indistinguishable from wrong password.
7. **Disabled account** — "Your account is disabled. Contact your administrator." (no attempt metadata).
8. **Rate limit** — 4th rapid attempt in window → 429 "Too many login attempts. Please try again later."
9. **Missing fields / short input** — client-side format message shown; nothing sent to server.
10. **Forgot password** — link visible; `/forgot-password` stub shows the contact placeholders and Back.
11. **Arabic locale** — switch to AR: all login strings render RTL Arabic; parity checked.

## 10. Residual Risks & Observations

- **Timing jitter** — dummy-bcrypt equalization leaves ~10–20 ms bcrypt jitter between the unknown-user and wrong-password paths; a high-volume statistical attacker could still exploit it. A server-side authenticated-token lookup cache or per-username dummy hashes would shrink it further (future work; explicitly noted as residual).
- **In-memory attempt tracker** — `loginAttempts` is process-local: streaks reset on restart and are not shared across multiple app instances. Matching the existing rate-limit MemoryStore, this is intentional and documented; a shared store (Redis/DB table) is the follow-up if multi-instance scaling is required.
- **Missing-fields contract change** — malformed login bodies now return `401 AUTH_INVALID_CREDENTIALS` instead of `400 VALIDATION_ERROR`; the two tests asserting the old code were aligned deliberately and are documented.
- **Rate-limit test alignment** — `rate-limit.test.ts` window widened 1000 → 6000 ms so the limit remains reachable given the mandatory ~200 ms failure floor; the assertions of the limiter's behavior are unchanged.
- **Refresh-token limiter** — `tokenLimiter` also emits `TOO_MANY_REQUESTS`; the frontend maps that code to the rate-limit message only inside the login flow (`TOO_MANY_REQUESTS` is NOT added to the global `apiErrors` mapping, so other endpoints keep generic 429 handling).
- **Audit logging** — `LOGIN_FAILED` audit records remain server-side only (never sent to the client); nothing in the HTTP response reveals the username's existence.

## 11. Sign-off

| Item | Status |
| --- | --- |
| Generic failure message everywhere, no server-side leak | ✔ |
| Attempt metadata only on `AUTH_INVALID_CREDENTIALS` | ✔ |
| Progressive delay wired into every failure path + reset on success | ✔ |
| Rate limiting, bcrypt cost, token_version, role model untouched | ✔ |
| No new migrations; no test-DB schema changes | ✔ |
| EN + AR parity on all new strings | ✔ |
| Existing suites green + new regression coverage complete | ✔ |
| Backend typecheck, frontend typecheck, tests, production build all pass | ✔ |
| LOGIN_UX_REPORT.md written and committed | ✔ |

**Verdict: LOGIN UX IMPROVED AND SECURE**