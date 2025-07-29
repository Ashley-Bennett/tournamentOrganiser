# PostgreSQL Migration Guide

## Overview

This guide helps you migrate from SQLite to Render PostgreSQL for persistent, scalable database storage.

## Benefits of PostgreSQL

- ✅ **Persistent data** - survives deployments and restarts
- ✅ **Better performance** - optimized for concurrent access
- ✅ **Scalable** - can handle more users and data
- ✅ **Automatic backups** - point-in-time recovery
- ✅ **Free tier** - 1GB storage, 100 connections
- ✅ **Built-in monitoring** - metrics and logs

## Setup Steps

### 1. Deploy with PostgreSQL

The `render.yaml` is already configured with:

- PostgreSQL database service
- Environment variables for connection
- Free tier plan

### 2. Install Dependencies

The backend needs PostgreSQL driver:

```bash
cd backend
npm install pg @types/pg
```

### 3. Database Schema

The PostgreSQL schema includes:

- **Users table** - authentication and user management
- **Leagues table** - tournament organization
- **Tournaments table** - tournament details and status
- **Players table** - player information
- **Tournament_players table** - many-to-many relationship
- **Matches table** - match results and pairings

### 4. Key Differences from SQLite

| Feature         | SQLite              | PostgreSQL                |
| --------------- | ------------------- | ------------------------- |
| **Connection**  | File-based          | Client-server             |
| **Concurrency** | Single writer       | Multiple writers          |
| **Data Types**  | Basic               | Rich (JSON, arrays, etc.) |
| **Performance** | Good for small apps | Excellent for scale       |
| **Backups**     | Manual              | Automatic                 |

### 5. Environment Variables

The backend will automatically use:

- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - Production/development mode
- `JWT_SECRET` - Authentication secret

### 6. Migration Process

1. **Deploy the new configuration**
2. **Database tables are created automatically**
3. **Test registration and login**
4. **Verify data persistence**

## Testing the Migration

### Health Check

```bash
curl https://your-backend-url.onrender.com/api/health
```

### Registration Test

```bash
curl -X POST https://your-backend-url.onrender.com/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

## Troubleshooting

### Common Issues

1. **Connection Errors**

   - Check `DATABASE_URL` environment variable
   - Verify SSL configuration for production

2. **Table Creation Errors**

   - Check PostgreSQL permissions
   - Verify database exists

3. **Performance Issues**
   - Monitor connection pool usage
   - Check query performance

### Logs to Monitor

- Database connection logs
- Table creation logs
- Query execution logs
- Error logs

## Next Steps

After successful migration:

1. **Monitor performance** - Check Render dashboard metrics
2. **Set up alerts** - Database health monitoring
3. **Plan scaling** - Consider paid plans for growth
4. **Backup strategy** - Verify automatic backups work

## Support

- [Render PostgreSQL Docs](https://render.com/docs/postgresql-creating-connecting)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Node.js pg Driver](https://node-postgres.com/)
