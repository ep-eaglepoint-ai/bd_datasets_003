# Deployment Guide

## Production Deployment with Docker

This guide covers deploying the Appointment Booking System to production using Docker and Docker Compose.

### Prerequisites

- Docker and Docker Compose installed
- SSL certificates (for HTTPS)
- Environment variables configured
- Domain name configured (optional)

### Environment Setup

1. Copy the environment template:
```bash
cp .env.example .env.production
```

2. Edit `.env.production` with your production values:
```bash
# Database
POSTGRES_PASSWORD=your-secure-password
DATABASE_URL=postgresql://postgres:your-secure-password@postgres:5432/appointment_booking

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-key
SESSION_SECRET=your-super-secure-session-key

# Redis
REDIS_PASSWORD=your-redis-password
REDIS_URL=redis://:your-redis-password@redis:6379
```

### SSL Certificates

Generate SSL certificates for HTTPS:

```bash
# Create SSL directory
mkdir -p deploy/nginx/ssl

# Generate self-signed certificates (for development)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/nginx/ssl/key.pem \
  -out deploy/nginx/ssl/cert.pem

# OR use Let's Encrypt for production
certbot certonly --standalone -d yourdomain.com
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem deploy/nginx/ssl/cert.pem
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem deploy/nginx/ssl/key.pem
```

### Database Initialization

Create the database initialization script:

```bash
mkdir -p deploy/scripts
cat > deploy/scripts/init-db.sql << EOF
-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS appointment_booking;

-- Create user if it doesn't exist
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'postgres') THEN

      CREATE ROLE postgres LOGIN PASSWORD 'your-secure-password';
   END IF;
END
$do$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE appointment_booking TO postgres;
EOF
```

### Deployment Commands

1. **Build and start all services:**
```bash
docker-compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build
```

2. **Run database migrations:**
```bash
docker-compose -f deploy/docker-compose.prod.yml exec api yarn rw prisma migrate deploy
```

3. **Seed the database (optional):**
```bash
docker-compose -f deploy/docker-compose.prod.yml exec api yarn rw prisma db seed
```

4. **Check service status:**
```bash
docker-compose -f deploy/docker-compose.prod.yml ps
```

5. **View logs:**
```bash
# All services
docker-compose -f deploy/docker-compose.prod.yml logs -f

# Specific service
docker-compose -f deploy/docker-compose.prod.yml logs -f web
docker-compose -f deploy/docker-compose.prod.yml logs -f api
docker-compose -f deploy/docker-compose.prod.yml logs -f postgres
```

### Health Checks

Monitor service health:

```bash
# Check web application
curl http://localhost/health

# Check API
curl http://localhost/api/health

# Check individual containers
docker-compose -f deploy/docker-compose.prod.yml exec web curl http://localhost:8910
docker-compose -f deploy/docker-compose.prod.yml exec api curl http://localhost:8911
```

### Scaling

Scale individual services:

```bash
# Scale web servers
docker-compose -f deploy/docker-compose.prod.yml up -d --scale web=3

# Scale API servers
docker-compose -f deploy/docker-compose.prod.yml up -d --scale api=2
```

### Backup and Recovery

#### Database Backup

```bash
# Create backup
docker-compose -f deploy/docker-compose.prod.yml exec postgres pg_dump -U postgres appointment_booking > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker-compose -f deploy/docker-compose.prod.yml exec -T postgres psql -U postgres appointment_booking < backup_file.sql
```

#### Volume Backup

```bash
# Backup volumes
docker run --rm -v appointment_booking_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
docker run --rm -v appointment_booking_redis_data:/data -v $(pwd):/backup alpine tar czf /backup/redis_backup.tar.gz -C /data .
```

### Monitoring

#### Basic Monitoring

```bash
# Resource usage
docker stats

# Container health
docker-compose -f deploy/docker-compose.prod.yml exec web curl http://localhost:8910/health
docker-compose -f deploy/docker-compose.prod.yml exec api curl http://localhost:8911/health
```

#### Log Monitoring

```bash
# Monitor error logs
docker-compose -f deploy/docker-compose.prod.yml logs -f | grep ERROR

# Monitor access logs
docker-compose -f deploy/docker-compose.prod.yml logs -f nginx | grep -v "GET /health"
```

### Security Considerations

1. **Change all default passwords**
2. **Use HTTPS in production**
3. **Configure firewall rules**
4. **Regularly update containers**
5. **Monitor access logs**
6. **Implement rate limiting**
7. **Use environment variables for secrets**

### Troubleshooting

#### Common Issues

1. **Database connection errors:**
   - Check DATABASE_URL format
   - Verify PostgreSQL is running
   - Check network connectivity

2. **Application won't start:**
   - Check environment variables
   - Review container logs
   - Verify port availability

3. **SSL certificate issues:**
   - Verify certificate paths
   - Check certificate expiration
   - Ensure proper permissions

#### Debug Commands

```bash
# Enter container shell
docker-compose -f deploy/docker-compose.prod.yml exec web sh
docker-compose -f deploy/docker-compose.prod.yml exec api sh

# Check environment variables
docker-compose -f deploy/docker-compose.prod.yml exec web env | grep NODE_ENV
docker-compose -f deploy/docker-compose.prod.yml exec api env | grep DATABASE_URL

# Test database connection
docker-compose -f deploy/docker-compose.prod.yml exec postgres psql -U postgres -d appointment_booking -c "SELECT version();"
```

### Performance Optimization

1. **Enable caching**
2. **Use CDN for static assets**
3. **Optimize database queries**
4. **Configure connection pooling**
5. **Monitor resource usage**

### Maintenance

#### Updates

```bash
# Pull latest images
docker-compose -f deploy/docker-compose.prod.yml pull

# Restart with new images
docker-compose -f deploy/docker-compose.prod.yml up -d
```

#### Cleanup

```bash
# Remove unused images
docker image prune -f

# Remove unused volumes (careful!)
docker volume prune -f
```

This deployment setup provides a production-ready environment with:
- High availability
- Load balancing
- SSL termination
- Health monitoring
- Log management
- Backup capabilities
- Security features
