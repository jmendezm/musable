import bcrypt from 'bcryptjs';
import Database from '../config/database';
import UserModel from '../models/User';
import Settings from '../models/Settings';
import config from '../config/config';
import logger from './logger';

export async function seedDatabase(): Promise<void> {
  try {
    const db = Database;

    // Seed library_paths from LIBRARY_PATHS on every startup (idempotent - only
    // inserts if the table is still empty). This must run unconditionally, not
    // just on first-ever install, so it also applies when upgrading an existing
    // installation that already has an admin user.
    await Settings.initializeDefaultPaths();

    // Check if admin user already exists
    const existingAdmin = await UserModel.findByEmail(config.adminEmail);

    if (existingAdmin) {
      logger.info('Admin user already exists, skipping seed');
      return;
    }

    // Check if any users exist
    const userCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM users'
    );

    if (userCount && userCount.count > 0) {
      logger.info('Users already exist in database, skipping admin creation');
      return;
    }

    // Create default admin user
    logger.info('Creating default admin user...');

    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(config.adminPassword, saltRounds);

    await db.run(
      `INSERT INTO users (username, email, password_hash, is_admin)
       VALUES (?, ?, ?, ?)`,
      ['admin', config.adminEmail, passwordHash, 1]
    );

    logger.info('✅ Default admin user created successfully');
    logger.info(`📧 Email: ${config.adminEmail}`);
    logger.info('🔑 Password: (as configured via ADMIN_PASSWORD)');
    logger.info('⚠️  Please change the default password after first login!');

    // Initialize default settings
    await Settings.initializeDefaultSettings();
    logger.info('✅ Default settings initialized');

  } catch (error) {
    logger.error('Failed to seed database:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => {
      logger.info('Database seeding complete');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database seeding failed:', error);
      process.exit(1);
    });
}