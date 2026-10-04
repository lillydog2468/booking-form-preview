# Booking Form

A lightweight booking management tool for tracking tour groups, hotels, flights, expenses, and payments.

## What it does

- Create, edit, and delete bookings with full details: group info, members, flights, hotel stays, and expenses
- Track payments (deposits, final payments) and auto-calculate totals, costs, and profit
- Manage hotels and users from a dedicated admin panel
- Support for mixed currencies (CZK / GBP) per field
- Export bookings to CSV
- Dark mode, auto-save, and multi-tab editing

## How it's built

**Frontend** — Static HTML files with vanilla JavaScript and CSS. No build step, no framework, no dependencies beyond a Google Font and the Supabase client library.

| File | Purpose |
|------|---------|
| `booking-form.html` | Main app — login, booking form, table view, CSV export |
| `admin.html` | Admin panel — manage users and hotels |
| `tour-planner.html` | Day planner for a tour group (phone and detailed views). Sign in to open a tour. |

**Backend** — [Supabase](https://supabase.com) (PostgreSQL + Auth + REST API). The `sql/` folder contains all table definitions, triggers, indexes, and RLS policies.

**Database schema** — 6 tables:

| Table | Role |
|-------|------|
| `profiles` | User accounts with roles (admin/user) |
| `hotels` | Admin-managed hotel list |
| `bookings` | Main booking records |
| `members` | Group members per booking |
| `flights` | Flight details per booking |
| `booking_expenses` | Hotel costs and additional expenses per booking |

## Getting started

1. Create a free Supabase project
2. Run the SQL migrations in order (see `SQL_GUIDE.md`)
3. Create your first admin user (see `DEPLOY.md`)
4. Host the HTML files on any static host (Netlify, Vercel, GitHub Pages)

Full setup instructions are in [`DEPLOY.md`](DEPLOY.md). Database schema details are in [`SQL_GUIDE.md`](SQL_GUIDE.md).

## Stack

- HTML / CSS / JavaScript (no framework)
- Supabase (PostgreSQL, Auth, auto-generated REST API)
- Free tier friendly — runs entirely within Supabase's free plan for low traffic
