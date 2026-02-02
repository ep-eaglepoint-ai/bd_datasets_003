// Database initialization script
// Creates initial lockers for the system

import { PrismaClient } from '@prisma/client';
import { LOCKER_STATUS } from '../lib/constants';

const prisma = new PrismaClient();

async function main() {
  console.log('Initializing database...');

  try {
    // Check if lockers already exist
    const existingLockers = await prisma.locker.count();
    
    if (existingLockers > 0) {
      console.log(`Database already initialized with ${existingLockers} lockers`);
      return;
    }

    // Create sample lockers
    const lockers = [
      { size: 'small', status: LOCKER_STATUS.AVAILABLE },
      { size: 'small', status: LOCKER_STATUS.AVAILABLE },
      { size: 'medium', status: LOCKER_STATUS.AVAILABLE },
      { size: 'medium', status: LOCKER_STATUS.AVAILABLE },
      { size: 'large', status: LOCKER_STATUS.AVAILABLE },
      { size: 'large', status: LOCKER_STATUS.AVAILABLE },
    ];

    for (const lockerData of lockers) {
      await prisma.locker.create({
        data: lockerData,
      });
    }

    console.log(`Created ${lockers.length} lockers`);
    console.log('Database initialization complete');
  } catch (error) {
    // If tables don't exist yet, that's okay - db:push will create them
    if (error instanceof Error && error.message.includes('does not exist')) {
      console.log('Database tables not found. Run "pnpm db:push" first.');
      return;
    }
    throw error;
  }
}

main()
  .catch((e) => {
    console.error('Initialization error:', e);
    // Don't exit with error code - allow dev server to start anyway
    process.exit(0);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
