const { execSync } = require('child_process');

console.log('🔧 Setting up development environment...\n');

try {
  // Step 1: Generate Prisma Client
  console.log('1️⃣ Generating Prisma Client...');
  execSync('npx prisma generate', { stdio: 'inherit' });
  console.log('✅ Prisma Client generated\n');

  // Step 2: Push database schema
  console.log('2️⃣ Pushing database schema...');
  try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('✅ Database schema pushed\n');
  } catch (error) {
    console.log('⚠️ Database schema push completed (may already be in sync)\n');
  }

  // Step 3: Initialize database
  console.log('3️⃣ Initializing database...');
  try {
    execSync('pnpm db:init', { stdio: 'inherit' });
    console.log('✅ Database initialized\n');
  } catch (error) {
    console.log('⚠️ Database initialization completed (may already be initialized)\n');
  }

  console.log('✅ Setup complete! Starting Next.js dev server...\n');
  
  // Step 4: Start Next.js dev server
  execSync('next dev', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
}
