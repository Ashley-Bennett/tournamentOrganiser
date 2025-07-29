# Database Migration Guide

## Option 1: Render Persistent Disk (Current Setup)

- ✅ Free tier available
- ✅ Data persists across deployments
- ✅ Simple setup
- ❌ Limited to 1GB storage
- ❌ Only available on paid plans

## Option 2: External Database Services

### A. Supabase (Recommended)

- ✅ Free tier with 500MB
- ✅ PostgreSQL database
- ✅ Real-time features
- ✅ Built-in authentication
- ✅ Dashboard for data management

**Setup:**

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Get connection string
4. Update environment variables

### B. PlanetScale (MySQL)

- ✅ Free tier with 1GB
- ✅ MySQL database
- ✅ Branch-based development
- ✅ Automatic backups

### C. Neon (PostgreSQL)

- ✅ Free tier with 3GB
- ✅ Serverless PostgreSQL
- ✅ Auto-scaling
- ✅ Branch-based development

### D. Railway PostgreSQL

- ✅ Free tier available
- ✅ Easy integration with Railway
- ✅ Automatic backups

## Option 3: Cloud Storage (PostgreSQL)

- ✅ Keep PostgreSQL but store in cloud
- ✅ Use AWS RDS, Google Cloud SQL, etc.
- ❌ More complex setup
- ❌ Requires additional code

## Recommended Migration Path:

1. **Start with Render Persistent Disk** (current setup)
2. **Migrate to Supabase** when you need more features
3. **Backend code already uses PostgreSQL**

## Environment Variables for External DB:

```env
# Supabase
DATABASE_URL=postgresql://user:password@host:port/database

# PostgreSQL is already configured
DATABASE_URL=postgresql://user:password@host:port/database
```
