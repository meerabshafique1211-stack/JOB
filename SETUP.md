# JobsApply — setup guide

Private, single-user AI job search and outreach platform.
Stack: Next.js 15 (App Router, TypeScript) · Tailwind · Supabase (Postgres, Auth, Storage) · Claude API · Gmail API · Vercel.

What is already done for you:

- **Supabase project `Jobsapply`** (`hadewvoqkypsiwemihsz`, Tokyo): every table, row-level security that only lets the owner's
  account read/write, a private `documents` storage bucket, a database trigger that blocks sign-ups from any other email,
  your profile and both CVs (SQA Engineer and Project Manager) imported as master CVs.
- **Vercel project** with these environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `ALLOWED_EMAIL`, `TOKEN_ENCRYPTION_KEY`, `CLAUDE_MODEL`.

Steps that need you (credentials only you can create):

## 1. Supabase: set the site URL (2 minutes, needed for email sign-in links)

Supabase dashboard → **Authentication → URL Configuration**

- **Site URL:** your Vercel URL, e.g. `https://jobsapply-xxxx.vercel.app`
- **Redirect URLs:** add `https://jobsapply-xxxx.vercel.app/auth/callback`

Then open the site and use **Create account** (email + password) with your Gmail address, confirm the email, and sign in.

Optional, "Continue with Google" sign-in: Supabase → Authentication → Providers → Google → enable, paste the same Google
OAuth client ID/secret from step 3, and add `https://hadewvoqkypsiwemihsz.supabase.co/auth/v1/callback` as an authorized
redirect URI in Google Cloud.

## 2. Claude API key

1. https://console.anthropic.com → API Keys → Create key.
2. Vercel → project **jobsapply** → Settings → Environment Variables → add `ANTHROPIC_API_KEY` (Production, Sensitive).
3. Optional: `CLAUDE_MODEL` (default `claude-sonnet-5-5`). You can also override the model per profile in Settings.
4. Redeploy (Deployments → ⋯ → Redeploy).

## 3. Google Cloud project, Gmail API and OAuth consent screen

1. https://console.cloud.google.com → create a project, e.g. "JobsApply".
2. **APIs & Services → Library →** enable **Gmail API**.
3. **Google Auth Platform / OAuth consent screen:**
   - User type **External**, app name "JobsApply", support email = your Gmail.
   - Scopes: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`, `https://www.googleapis.com/auth/gmail.readonly`.
   - **Test users:** add your own Gmail address.
   - Leave the app in **Testing** status. Personal use doesn't need Google verification.
     Important: in Testing status Google expires the refresh token after **7 days**, so you will have to click
     *Connect Gmail* again about once a week. To stop that, publish the app ("In production"). Because
     `gmail.readonly` is a *restricted* scope, Google will then show an "unverified app" warning for your own
     account (you can click through it). Full verification with a security assessment is only needed for public apps.
4. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized redirect URI: `https://<your-vercel-domain>/api/gmail/callback`
5. Copy the client ID and secret into Vercel env vars `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Sensitive), then redeploy.
6. In the app: **Settings → Integrations → Connect Gmail.** The dashboard shows the connected account. Your password is never
   requested. Tokens are encrypted with AES-256-GCM (`TOKEN_ENCRYPTION_KEY`) and used only on the server.

## 4. Optional: Hunter.io for verified recruiter emails

Add `HUNTER_API_KEY`. This turns on "Find verified emails" on company pages and "Verify" on contacts.
Without it, add contacts manually with the public page where you found them. Emails are sent **only** to addresses
marked *verified* (by Hunter's verifier) or *published on a public page* (you supply the source URL).

## 5. GitHub repository

This session could read `meerabshafique1211-stack/JOB` but **could not push** (the Claude GitHub App is not installed
for that account). To get the code into the repo:

- Install the Claude GitHub App: https://github.com/apps/claude/installations/select_target, select the `JOB` repo,
  then ask Claude to push; **or**
- download the source zip from the conversation and push it yourself:
  ```bash
  unzip jobsapply-source.zip && cd job
  git remote add origin https://github.com/meerabshafique1211-stack/JOB.git
  git push -u origin main
  ```
  Then in Vercel → Project → Settings → Git → Connect the repository so every push redeploys.

## 6. Database migrations

The schema is already applied to the Supabase project. `supabase/migrations/` contains the SQL for reference or to
recreate it in a fresh project (Supabase → SQL Editor → run the files in order).

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server (publishable key, protected by RLS) | no |
| `ALLOWED_EMAIL` | server | no |
| `TOKEN_ENCRYPTION_KEY` | server | **yes** |
| `ANTHROPIC_API_KEY` | server | **yes** |
| `CLAUDE_MODEL` | server | no |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server | **yes** |
| `HUNTER_API_KEY` (optional) | server | **yes** |

No secret is ever sent to the browser. The only `NEXT_PUBLIC_*` values are the Supabase URL and publishable key.

## How the workflow runs

1. **Discover:** Job Discovery → *Run discovery now* pulls live listings from Remotive, Remote OK, Himalayas, Jobicy,
   Arbeitnow (including its visa-sponsorship feed) and We Work Remotely. It filters them by your title keywords, removes
   local Pakistani on-site jobs, labels remote/Pakistan eligibility, sponsorship and relocation **with the evidence text**,
   and de-duplicates by canonical URL and company+title. LinkedIn/Indeed/Glassdoor etc. are **user-assisted**: open the search
   link, then paste the URL and description into *Import a vacancy*.
2. **Match:** *Score with Claude* gives a 0–100 score, skills, gaps and fit notes against your master CV.
3. **Research contacts:** Company page → LinkedIn/Google search links per priority role → add each person with the source URL
   (or use Hunter.io).
4. **Write:** generate cold emails (tone adapts to the recipient's role), LinkedIn notes, tailored CVs, cover letters and
   application answers. Nothing is invented; unknown answers say "NEEDS YOUR INPUT".
5. **Review & approve a batch:** Batch Approval Center → select items → review each email/application → one
   *Approve N Emails and M Applications* button. The approved list is frozen.
6. **Execute:** sends only approved emails through Gmail, one at a time. It skips unverified addresses and Do-Not-Contact
   entries, blocks duplicates, and records every result. Applications with an email address are sent with the tailored CV
   and cover letter. Applications on employer websites cannot be auto-submitted without bypassing their security, so they
   become "awaiting your action": open the link, paste the prepared answers, submit, then *Mark submitted* with the
   confirmation. Anything involving an assessment, signature, fee or sensitive documents stops for your extra approval.
7. **Track:** *Check for replies & bounces* reads Gmail thread metadata. Replies and opt-outs cancel follow-ups, and opt-outs
   go to Do-Not-Contact. Follow-ups are drafted at 5 and then 8 business days and are sent only through a new approved batch.
