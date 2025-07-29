# Deployment Guide for Render

This guide will help you deploy your Tournament Organizer app to Render.

## Prerequisites

1. A Render account (free tier available)
2. Your code pushed to a Git repository (GitHub, GitLab, etc.)

## Deployment Steps

### 1. Connect to Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" and select "Blueprint"
3. Connect your Git repository

### 2. Deploy Backend

1. Create a new **Web Service**
2. Configure the service:

   - **Name**: `tournament-organizer-backend`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free

3. Add Environment Variables:
   - `NODE_ENV`: `production`
   - `PORT`: `10000`
   - `FRONTEND_URL`: `https://your-frontend-service-name.onrender.com`
   - `JWT_SECRET`: (generate a secure random string)
   - `DATABASE_URL`: `postgresql://username:password@host:port/database`

### 3. Deploy Frontend

1. Create a new **Static Site**
2. Configure the service:

   - **Name**: `tournament-organizer-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`
   - **Plan**: Free

3. Add Environment Variables:
   - `VITE_API_URL`: `https://your-backend-service-name.onrender.com`

### 4. Update URLs

After deployment, update the URLs in your `render.yaml` file with the actual service URLs provided by Render.

## Environment Variables

### Backend (.env)

```env
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://your-frontend-service-name.onrender.com
JWT_SECRET=your-secure-jwt-secret
DATABASE_URL=postgresql://username:password@host:port/database
```

### Frontend (.env)

```env
VITE_API_URL=https://your-backend-service-name.onrender.com
```

## Important Notes

1. **Database**: The PostgreSQL database will be created automatically via the DATABASE_URL environment variable
2. **CORS**: The backend is configured to accept requests from the frontend URL
3. **JWT Secret**: Generate a secure random string for production
4. **Free Tier Limitations**:
   - Services may sleep after 15 minutes of inactivity
   - Limited bandwidth and build minutes
   - Database files may be reset on service restarts

## Troubleshooting

### Common Issues

1. **Build Failures**: Check that all dependencies are in package.json
2. **CORS Errors**: Verify FRONTEND_URL is set correctly
3. **Database Issues**: Ensure DATABASE_URL is correctly configured
4. **Port Conflicts**: Use PORT environment variable

### Logs

Check the logs in your Render dashboard for detailed error messages.

## Local Development

To test the production build locally:

```bash
# Backend
cd backend
npm install
npm run build
npm start

# Frontend
cd frontend
npm install
npm run build
npm run preview
```
