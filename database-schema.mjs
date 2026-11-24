import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function migrateNamedSchema(db, root) {
  if (db.prepare('SELECT version FROM schema_migrations WHERE version=4').get()) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    const invalid = db.prepare("SELECT id FROM users WHERE role='waiter' AND (staff_code IS NULL OR staff_code NOT GLOB '0[0-9][0-9]' OR staff_code='000')").all();
    if (invalid.length) throw new Error('Correct waiter codes to 001–099 before migration: ' + invalid.map(u => u.id).join(', '));
    db.exec(readFileSync(join(root, 'migrations', '004_named_restaurant_schema.sql'), 'utf8'));
    // Archive old release tables without discarding their data.
    for (const name of ['dining_tables_legacy', 'order_items_legacy', 'sales_legacy']) {
      if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)) {
        db.exec(`ALTER TABLE ${name} RENAME TO Arhiva_${name}`);
      }
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Foreign key check failed during migration');
    db.prepare('INSERT INTO schema_migrations(version) VALUES(4)').run();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function migrateProductImages(db,root) {
 if(db.prepare('SELECT version FROM schema_migrations WHERE version=5').get())return;
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec(readFileSync(join(root,'migrations','005_product_images.sql'),'utf8'));
  db.prepare('INSERT INTO schema_migrations(version) VALUES(5)').run();
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
