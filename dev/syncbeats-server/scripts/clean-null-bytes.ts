/**
 * clean-null-bytes.ts
 * One-time script: strips null bytes server-side using a DO $$ block.
 * The entire UPDATE happens inside Postgres — no corrupt data is transmitted
 * to Node.js over the wire.
 * Run with: npx tsx scripts/clean-null-bytes.ts
 */

import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const client = await pool.connect();
  try {
    console.log('Connected. Creating clean_null_bytes function and purging null bytes...\n');

    // Create helper function in PostgreSQL
    await client.query(`
      CREATE OR REPLACE FUNCTION clean_null_bytes(t text) RETURNS text AS $$
      DECLARE
        b bytea;
        clean_b bytea := ''::bytea;
        i int;
        c int;
      BEGIN
        IF t IS NULL THEN RETURN NULL; END IF;
        b := convert_to(t, 'UTF8');
        FOR i IN 0..length(b)-1 LOOP
          c := get_byte(b, i);
          IF c != 0 THEN
            clean_b := clean_b || set_byte('\\x00'::bytea, 0, c);
          END IF;
        END LOOP;
        RETURN convert_from(clean_b, 'UTF8');
      EXCEPTION WHEN OTHERS THEN
        RETURN t;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Clean users table
    await client.query(`
      UPDATE users SET
        name  = clean_null_bytes(name),
        email = clean_null_bytes(email);
    `);
    console.log('✅ users: cleaned');

    // Clean songs table
    await client.query(`
      UPDATE songs SET
        title             = clean_null_bytes(title),
        artist            = clean_null_bytes(artist),
        album             = clean_null_bytes(album),
        youtube_id        = clean_null_bytes(youtube_id),
        youtube_thumbnail = clean_null_bytes(youtube_thumbnail),
        album_art         = clean_null_bytes(album_art);
    `);
    console.log('✅ songs: cleaned');

    // Clean playlists table
    await client.query(`
      UPDATE playlists SET
        name        = clean_null_bytes(name),
        description = clean_null_bytes(description);
    `);
    console.log('✅ playlists: cleaned');

    // Clean rooms table
    await client.query(`
      UPDATE rooms SET
        id             = clean_null_bytes(id),
        host_id        = clean_null_bytes(host_id),
        track_url      = clean_null_bytes(track_url),
        playback_state = clean_null_bytes(playback_state),
        repeat_mode    = clean_null_bytes(repeat_mode);
    `);
    console.log('✅ rooms: cleaned');

    // Clean room_queue_items table
    await client.query(`
      UPDATE room_queue_items SET
        track_url = clean_null_bytes(track_url),
        title     = clean_null_bytes(title),
        artist    = clean_null_bytes(artist),
        file_name = clean_null_bytes(file_name),
        mime_type = clean_null_bytes(mime_type);
    `);
    console.log('✅ room_queue_items: cleaned');

    console.log('\n🎉 Complete database null-byte purge finished!');
  } catch (err) {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
