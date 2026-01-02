# Database Migration Guide

## Your Data Has Been Exported

The file `full-export.sql` contains all your data from the development database (427KB, 1265 rows across all tables).

## Step-by-Step Instructions

### Step 1: Create Production Database

1. Open the **Database** tool in Replit (database icon in the left panel)
2. Click on **"Create Production Database"** or look for a production option
3. Wait for the database to be provisioned (usually takes a few seconds)

### Step 2: Run Schema Migrations

1. After creating the production database, **Publish your app** once
2. This will automatically run the schema migrations to create all the tables in production
3. Wait for the deployment to complete

### Step 3: Import Your Data

1. Go back to the **Database** tool
2. Switch to the **Production Database** view
3. Find the **SQL Runner** or **Query** option
4. Open the file `database-export/full-export.sql` in your editor
5. Copy the entire contents
6. Paste into the SQL Runner
7. Click **Run** to execute

**Note:** The import uses `ON CONFLICT DO NOTHING` so it's safe to run multiple times - it won't create duplicate records.

### Step 4: Verify

1. Check a few tables in the production database to confirm data was imported
2. Test your published app to make sure everything works

## Troubleshooting

**If you see foreign key errors:**
- Make sure you ran the schema migration first (Step 2)
- The export is ordered to handle dependencies correctly

**If some data is missing:**
- Re-run the export script: `npx tsx scripts/export-database.ts`
- Then repeat Step 3

**Need help?**
Ask me and I can assist with any issues!
