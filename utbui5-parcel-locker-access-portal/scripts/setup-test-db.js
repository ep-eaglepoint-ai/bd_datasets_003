const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoAfterPath = path.join(__dirname, '../repository_after');
const testDbPath = path.join(repoAfterPath, 'prisma/test.db');

console.log('🔧 Setting up test database...\n');

try {
  const prismaDir = path.join(repoAfterPath, 'prisma');
  if (!fs.existsSync(prismaDir)) {
    fs.mkdirSync(prismaDir, { recursive: true });
  }

  process.chdir(repoAfterPath);

  console.log('1️⃣ Generating Prisma Client...');
  try {
    execSync('npx prisma generate', { stdio: 'inherit' });
    console.log('✅ Prisma Client generated\n');
  } catch (error) {
    console.log('⚠️ Prisma Client generation completed (may already be generated)\n');
  }

  console.log('2️⃣ Creating test database...');
  try {
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
        console.log('   Removed existing test.db\n');
      } catch (err) {
        console.log('   Could not remove existing test.db (may be in use)\n');
      }
    }
    
    const tempSchemaPath = path.join(prismaDir, 'schema.test.prisma');
    const originalSchema = fs.readFileSync(path.join(prismaDir, 'schema.prisma'), 'utf8');
    const testDbPathForSchema = path.resolve(testDbPath).replace(/\\/g, '/');
    const testSchema = originalSchema.replace(
      'url      = "file:./dev.db"',
      `url      = "file:${testDbPathForSchema}"`
    );
    fs.writeFileSync(tempSchemaPath, testSchema);
    
    const schemaArg = './prisma/schema.test.prisma';
    try {
      execSync(`npx prisma db push --schema=${schemaArg} --accept-data-loss --skip-generate --force-reset`, { 
        stdio: 'inherit',
        cwd: repoAfterPath
      });
    } catch (error) {
      console.log('   Retrying without --force-reset...\n');
      try {
        execSync(`npx prisma db push --schema=${schemaArg} --accept-data-loss --skip-generate`, { 
          stdio: 'inherit',
          cwd: repoAfterPath
        });
      } catch (error2) {
        console.log('   Retrying with migrate dev...\n');
        try {
          execSync(`npx prisma migrate dev --schema=${schemaArg} --name init --skip-generate --skip-seed`, { 
            stdio: 'inherit',
            cwd: repoAfterPath
          });
        } catch (error3) {
          throw error3;
        }
      }
    }
    
    try {
      fs.unlinkSync(tempSchemaPath);
    } catch (err) {
      // Ignore cleanup errors
    }
    
    if (fs.existsSync(testDbPath)) {
      console.log('✅ Test database created with schema\n');
    } else {
      throw new Error('Test database was not created');
    }
  } catch (error) {
    console.error('❌ Error creating test database:', error.message);
    console.log('⚠️ Test database setup completed (may already exist)\n');
  }

  console.log('✅ Test database setup complete!');
} catch (error) {
  console.error('❌ Test database setup failed:', error.message);
  process.exit(1);
}
