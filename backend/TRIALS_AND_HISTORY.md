# Trial limits, private test access and guest history

Deploy code and apply `migrations/005_trials_and_guest_history.sql` after 001–004.
The service tolerates only the missing new tester RPC / claim table during rollout,
so existing sign-in and guest chat continue working until 005 is applied. Transfers
and test entitlements remain unavailable until the migration is installed.

- Guest: 5 lifetime generation admissions. Existing usage stays counted.
- Shared network: retains the additional 8 admissions/day ceiling.
- Signed-in Free: 20 lifetime admissions by default (`FREE_TRIAL_LIMIT=20`,
  `FREE_TRIAL_PERIOD=lifetime`). Free models are controlled by `FREE_MODELS`.
- Pro: existing subscription entitlements, daily limits and monetary budgets remain.
- Test accounts: operator-managed `tester_accounts`, no payment or fake subscription
  record. Test users have Pro feature access under the existing Pro usage / spend
  limits. Model-provider requests can still cost money.

## Enable a private test account

In Supabase SQL Editor, after migration 005:

```sql
insert into public.tester_accounts(email, valid_until)
values ('YOUR_GOOGLE_LOGIN_EMAIL', now() + interval '1 year')
on conflict(email) do update set valid_until=excluded.valid_until;
```

Use a lowercase email. The backend accepts only Google's verified email claim.
On sign-in/next authenticated request, the allowlist row binds to the verified
Google subject. It cannot be rebound by a different subject sharing the same
email without an explicit operator change. The allowlist is not exposed publicly.
`/billing/status` returns `plan=pro`, `is_tester=true` and its expiry. The UI labels
this as Test access. To revoke, delete the allowlist row. Never publish personal
allowlist entries in the repository. A private, ignored setup file can be kept in
`backend/.local/`; it is also excluded from container/source uploads.

## Guest history after upgrade

The browser retains its signed guest token through sign-in. After `/billing/status`
confirms a valid Pro entitlement (or test access), it automatically submits that
token to `POST /conversations/claim-guest` under Google authentication. Free users
cannot claim via a forged browser plan flag. Payments remain a template: this code
does not enable checkout or provision paid entitlements.

The SQL transaction transfers conversations, asset ownership and generation records
without deleting the existing signed-in history or changing R2 object keys. Retrieval
still verifies database ownership. Usage counters are not reset. Running jobs delay
the transfer; the UI retries busy jobs, retains the token on failure, and offers a
retry if needed. Repeating a successful transfer is safe; another account cannot
claim it a second time. Old guest tokens are rejected and guest writes racing with
the transfer cannot re-create history under the claimed identity.

Automatic transfer requires the original valid guest token in the same browser.
Clearing browser storage, changing signing keys or guest-token expiry removes that
proof of ownership; the server never guesses ownership by IP, title or email.

After setup, check the 5th/6th guest admission, 20th/21st Free admission, tester
status, and a guest-to-Pro transfer. CI tests these with isolated SQL fixtures;
production calls require an operator-applied migration and actual signed identity.
