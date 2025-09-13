# Supabase Setup Guide for Pontifex Equipment Management

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new account
2. Create a new project
3. Choose a project name (e.g., "pontifex-equipment")
4. Choose a region close to your users
5. Set a database password (save this securely)

## 2. Get Your Supabase Credentials

1. Go to your project dashboard
2. Click on "Settings" in the sidebar
3. Click on "API"
4. Copy the following values:
   - **Project URL** (something like `https://your-project-ref.supabase.co`)
   - **anon public** key (the long JWT token under "Project API keys")

## 3. Set Up Environment Variables

1. Create a `.env.local` file in your project root
2. Add your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

**Important:** Never commit the `.env.local` file to version control!

## 4. Run Database Schema

1. In your Supabase project dashboard, go to "SQL Editor"
2. Copy and paste the contents of `src/lib/setup-database.sql`
3. Click "Run" to execute the SQL commands
4. This will create the `equipment`, `equipment_notes`, and `maintenance_records` tables with sample data

## 5. Test the Connection

1. Restart your development server: `npm run dev`
2. Try adding a new equipment item through the form
3. Check the Supabase dashboard under "Table Editor" to see if the data was saved

## 6. Optional: Set Up Row Level Security (RLS)

For production use, enable Row Level Security:

1. Go to "Authentication" > "Policies" in Supabase
2. Enable RLS for each table
3. Create policies based on your user roles

## Current Fallback Behavior

The application is designed to work with or without Supabase:

- **With Supabase configured**: Data is saved to and retrieved from your Supabase database
- **Without Supabase configured**: Data is stored in browser localStorage for demo purposes

Check the browser console for messages about which mode is being used.

## Troubleshooting

1. **"Missing Supabase environment variables" error**: Make sure your `.env.local` file is in the project root and contains the correct variable names
2. **Database errors**: Ensure you've run the SQL schema from `src/lib/database.sql`
3. **CORS errors**: Make sure you're using the correct project URL and API key
4. **Connection refused**: Verify your Supabase project is active and the URL is correct