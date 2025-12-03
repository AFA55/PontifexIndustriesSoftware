# Database Migrations

This folder contains SQL migration files for the Pontifex Industries platform.

## How to Apply Migrations

### Using Supabase CLI

1. Make sure you have the Supabase CLI installed:
   ```bash
   npm install -g supabase
   ```

2. Link your project (if not already linked):
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Apply all pending migrations:
   ```bash
   supabase db push
   ```

### Manual Application via Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of the migration file
4. Paste and execute the SQL

## Migration Files

- `20250130_add_autocomplete_tables.sql` - Adds autocomplete suggestion tables for:
  - Customer job titles
  - Company names
  - General contractors

  These tables store frequently used values and provide autocomplete suggestions in the dispatch scheduling form.

## Important Notes

- Migrations should be run in order by timestamp
- Always backup your database before running migrations
- Test migrations in a development environment first
