import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from '../../config/supabase.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
    try {
        // Create migrations table if it doesn't exist
        await supabase.rpc('create_migrations_table_if_not_exists');
        
        // Get executed migrations
        const { data: executedMigrations } = await supabase
            .from('migrations')
            .select('name')
            .order('executed_at');
        
        const executedNames = new Set(executedMigrations.map(m => m.name));
        
        // Get migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const migrationFiles = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort();
        
        // Run pending migrations
        for (const file of migrationFiles) {
            if (!executedNames.has(file)) {
                logger.info(`Running migration: ${file}`);
                
                const migrationSQL = fs.readFileSync(
                    path.join(migrationsDir, file), 
                    'utf8'
                );
                
                const { error } = await supabase.rpc('execute_migration', {
                    migration_name: file,
                    migration_sql: migrationSQL
                });
                
                if (error) {
                    throw new Error(`Migration ${file} failed: ${error.message}`);
                }
                
                logger.info(`Migration completed: ${file}`);
            }
        }
        
        logger.info('All migrations completed successfully');
        
    } catch (error) {
        logger.error('Migration failed:', error);
        throw error;
    }
}
