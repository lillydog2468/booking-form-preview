# Deploying the Booking Form to Supabase

## Can I host this for free?

**Yes.** Supabase has a generous free tier that includes:

| Resource | Free Tier Limit |
|---|---|
| Database | 500 MB |
| Auth | 50,000 monthly active users |
| Storage | 1 GB |
| API requests | Unlimited (fair use) |
| Edge Functions | 500K invocations/month |
| Bandwidth | 5 GB |
| Realtime | 200 concurrent connections |

For a low-traffic booking form used by a small team, the free tier is more than enough. You won't need to pay anything unless your usage grows significantly. The main constraint is that **free-tier projects pause after 1 week of inactivity** — they resume automatically on the next request but with a ~10 second cold-start delay.

For the **frontend hosting** (the HTML files), you can use any free static hosting service (Netlify, Vercel, Cloudflare Pages, GitHub Pages) at zero cost.

---

## Overview

```
┌──────────────────────┐         ┌──────────────────────┐
│  Frontend (Static)   │         │  Supabase (Backend)  │
│                      │  HTTPS  │                      │
│  booking-form.html   │◄───────►│  PostgreSQL Database │
│  admin.html          │         │  Auth (email/pass)   │
│                      │         │  Row Level Security  │
│  Hosted on:          │         │  REST API (auto)     │
│  Netlify / Vercel /  │         │                      │
│  Cloudflare Pages    │         │  Free tier works     │
└──────────────────────┘         └──────────────────────┘
```

---

## Step 1 — Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign up / log in.
2. Click **New Project**.
3. Choose your organization (or create one).
4. Fill in:
   - **Project name**: e.g. `booking-form`
   - **Database password**: save this somewhere safe
   - **Region**: pick the one closest to you
   - **Plan**: Free
5. Click **Create new project** and wait ~2 minutes for provisioning.

---

## Step 2 — Run the SQL migrations (create tables)

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar).
2. Run each SQL file **in order**. Click **New query**, paste the contents, and click **Run**.

| Order | File | What it does |
|---|---|---|
| 1 | `sql/02_updated_at_trigger.sql` | Creates the `update_updated_at()` trigger function |
| 2 | `sql/10_profiles_table.sql` | Creates the `profiles` table + auto-create trigger |
| 3 | `sql/11_hotels_table.sql` | Creates the `hotels` table with seed data |
| 4 | `sql/01_create_table.sql` | Creates the main `bookings` table |
| 5 | `sql/03_rls_policies.sql` | Adds RLS policies to the `bookings` table |
| 6 | `sql/12_members_table.sql` | Creates the `members` child table |
| 7 | `sql/13_flights_table.sql` | Creates the `flights` child table |
| 8 | `sql/14_booking_expenses_table.sql` | Creates the `booking_expenses` child table |
| 9 | `sql/08_indexes.sql` | Adds performance indexes |

> **Important**: Run them in this order because of foreign key dependencies (`bookings` references `hotels`, child tables reference `bookings`, etc.).

---

## Step 3 — Create your first admin user

Since there is no sign-up page (users are managed from the admin panel), you need to create the first admin user manually.

### Option A: Via the Supabase Dashboard

1. Go to **Authentication** > **Users** in the dashboard.
2. Click **Add user** > **Create new user**.
3. Enter the admin email and password.
4. Click **Create user**.
5. Now manually set their role to admin. Go to **SQL Editor** and run:

```sql
UPDATE profiles
SET role = 'admin'
WHERE email = 'your-admin@email.com';
```

### Option B: Via SQL Editor

```sql
-- Create the user via Supabase Auth admin API (dashboard is easier)
-- Then set role:
UPDATE profiles
SET role = 'admin'
WHERE email = 'your-admin@email.com';
```

> The `handle_new_user()` trigger automatically creates a profile row with `role = 'user'` when a user signs up, so you only need to update it to `'admin'`.

---

## Step 4 — Get your Supabase credentials

1. In the Supabase dashboard, go to **Settings** > **API**.
2. Copy these two values:
   - **Project URL** — looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon (public) key** — a long JWT string starting with `eyJ...`

These are safe to use in frontend code. The anon key only grants access allowed by your RLS policies.

---

## Step 5 — Connect the frontend to Supabase

Open `booking-form.html` and `admin.html`. Near the top of the `<script>` section, find the Supabase placeholder comments and replace them.

### Add the Supabase client library

Add this to the `<head>` of both HTML files:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

### Initialize the client

At the top of your `<script>` block (in both files), add:

```javascript
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';   // your project URL
const SUPABASE_KEY = 'eyJ...';                              // your anon key
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
```

### Replace the dummy auth

In `booking-form.html` and `admin.html`, replace the dummy login logic with real Supabase auth calls:

```javascript
// Sign in
async function handleAuth() {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    showLoginError(error.message);
    return;
  }

  // Fetch the user's profile to get their role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', data.user.id)
    .single();

  if (profile?.status === 'disabled') {
    showLoginError('Your account has been disabled.');
    await supabase.auth.signOut();
    return;
  }

  currentUser = {
    email: data.user.email,
    role: profile?.role || 'user',
    id: data.user.id,
  };

  onAuthSuccess(currentUser);
}

// Sign out
async function handleLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  sessionStorage.removeItem('session');
  showLogin();
}

// Check existing session on page load
async function checkExistingSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', session.user.id)
      .single();

    currentUser = {
      email: session.user.email,
      role: profile?.role || 'user',
      id: session.user.id,
    };
    onAuthSuccess(currentUser);
  }
}
```

### Replace dummy CRUD with Supabase calls

In `booking-form.html`, uncomment the Supabase sections inside `loadBookings()`, `saveBooking()`, and `deleteBooking()`, and remove/comment-out the `localStorage` calls. The placeholder comments already contain the correct Supabase code.

### Replace the admin page dummy data

In `admin.html`, replace the dummy user/hotel arrays with Supabase queries:

```javascript
// Load users
const { data: users } = await supabase
  .from('profiles')
  .select('*')
  .order('created_at');

// Load hotels
const { data: hotels } = await supabase
  .from('hotels')
  .select('*')
  .order('name');
```

---

## Step 6 — Tighten RLS policies for production

The default `03_rls_policies.sql` allows public (anonymous) access. For production, replace with authenticated-only policies. Run this in the SQL Editor:

```sql
-- Drop the permissive public policies
DROP POLICY IF EXISTS "Allow public read" ON bookings;
DROP POLICY IF EXISTS "Allow public insert" ON bookings;
DROP POLICY IF EXISTS "Allow public update" ON bookings;
DROP POLICY IF EXISTS "Allow public delete" ON bookings;

-- Authenticated-only access
CREATE POLICY "Authenticated read" ON bookings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert" ON bookings
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated update" ON bookings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated delete" ON bookings
  FOR DELETE TO authenticated USING (true);
```

Do the same for `members`, `flights`, and `booking_expenses` if they currently use public policies.

---

## Step 7 — Host the frontend (free)

Your frontend is just two static HTML files. Pick any of these free options:

### Option A: Netlify (recommended for simplicity)

1. Go to [https://app.netlify.com](https://app.netlify.com) and sign up.
2. Drag and drop your project folder onto the Netlify dashboard.
3. Done. You get a URL like `https://your-site.netlify.app`.
4. (Optional) Connect a custom domain under **Domain settings**.

### Option B: Vercel

1. Push your project to a GitHub repo.
2. Go to [https://vercel.com](https://vercel.com), sign up, and import the repo.
3. It auto-deploys. You get a URL like `https://your-site.vercel.app`.

### Option C: Cloudflare Pages

1. Push to GitHub.
2. Go to [https://pages.cloudflare.com](https://pages.cloudflare.com), connect the repo.
3. Set build output to `/` (root), no build command needed.
4. Deploy.

### Option D: GitHub Pages

1. Push to a GitHub repo.
2. Go to **Settings** > **Pages** > set source to the main branch.
3. Your site is live at `https://username.github.io/repo-name/`.

> All of these options are **completely free** for static sites with low traffic.

---

## Step 8 — Environment variables (optional but recommended)

Instead of hardcoding your Supabase URL and anon key directly in the HTML, you can use a simple build step or a config file:

**Simple approach** — create a `config.js` file:

```javascript
const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Add `<script src="config.js"></script>` before your main script in both HTML files. This keeps credentials in one place and makes them easy to update.

> **Note**: The anon key is designed to be public — it only grants access that your RLS policies allow. Your database password should **never** appear in frontend code.

---

## Quick reference — Supabase JS cheat sheet

```javascript
// Initialize
const supabase = supabase.createClient(URL, KEY);

// Auth
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signOut();
await supabase.auth.getSession();

// Read
const { data, error } = await supabase.from('bookings').select('*');

// Read with join
const { data } = await supabase.from('bookings').select('*, hotels(name)');

// Insert
const { data, error } = await supabase.from('bookings').insert([row]).select();

// Update
const { error } = await supabase.from('bookings').update(changes).eq('id', id);

// Delete
const { error } = await supabase.from('bookings').delete().eq('id', id);

// Create user (admin only, from Edge Function or dashboard)
const { data, error } = await supabase.auth.admin.createUser({
  email: 'user@example.com',
  password: 'securepassword',
  email_confirm: true,
});
```

---

## Checklist

- [ ] Supabase project created
- [ ] All SQL files run in order (Step 2)
- [ ] First admin user created and role set (Step 3)
- [ ] Supabase URL and anon key copied (Step 4)
- [ ] `supabase-js` script tag added to both HTML files
- [ ] Supabase client initialized in both files
- [ ] Dummy auth replaced with real Supabase auth
- [ ] Dummy CRUD replaced with Supabase queries
- [ ] RLS policies tightened for production (Step 6)
- [ ] Frontend deployed to Netlify / Vercel / etc. (Step 7)
- [ ] Test login, create booking, edit, delete
- [ ] Test admin page: manage users and hotels
