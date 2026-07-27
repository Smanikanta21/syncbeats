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
    console.log('Connected. Running server-side null-byte cleanup...\n');

    // Execute a DO block — runs entirely in PostgreSQL, never sends bad bytes to Node.
    // We use convert_from(convert_to(col, 'UTF8'), 'UTF8') trick won't work either.
    // The correct approach: convert to bytea, remove 0x00 bytes, convert back.
    // regexp_replace(encode(col::bytea, 'escape'), '\\\\000', '', 'g') is too complex.
    //
    // Simplest working approach: use a plpgsql DO block with overlay/replace on bytea level.
    await client.query(`
      DO $$
      DECLARE
        r RECORD;
        clean_text text;
      BEGIN
        -- Clean users.settings (JSON column)
        FOR r IN SELECT id FROM users LOOP
          BEGIN
            -- Try reading the settings — if it throws, the row has null bytes
            PERFORM (SELECT settings FROM users WHERE id = r.id)::text;
          EXCEPTION WHEN others THEN
            -- Can't read it directly; use bytea manipulation
            UPDATE users
            SET settings = (
              convert_from(
                replace(
                  convert_to(settings::text, 'UTF8'),
                  decode('00', 'hex'),
                  ''::bytea
                ),
                'UTF8'
              )
            )::jsonb
            WHERE id = r.id;
          END;
        END LOOP;
      END $$;
    `);
    console.log('users.settings: cleaned (via DO block)');

    await client.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN SELECT id FROM rooms LOOP
          BEGIN
            PERFORM (SELECT id || host_id || COALESCE(track_url,'') FROM rooms WHERE id = r.id);
          EXCEPTION WHEN others THEN
            UPDATE rooms SET
              id             = convert_from(replace(convert_to(id,             'UTF8'), decode('00','hex'), ''::bytea), 'UTF8'),
              host_id        = convert_from(replace(convert_to(host_id,        'UTF8'), decode('00','hex'), ''::bytea), 'UTF8'),
              track_url      = CASE WHEN track_url IS NOT NULL THEN convert_from(replace(convert_to(track_url, 'UTF8'), decode('00','hex'), ''::bytea), 'UTF8') ELSE NULL END,
              playback_state = convert_from(replace(convert_to(playback_state, 'UTF8'), decode('00','hex'), ''::bytea), 'UTF8'),
              repeat_mode    = convert_from(replace(convert_to(repeat_mode,    'UTF8'), decode('00','hex'), ''::bytea), 'UTF8')
            WHERE id = r.id;
          END;
        END LOOP;
      END $$;
    `);
    console.log('rooms: cleaned (via DO block)');

    await client.query(`
      DO $$
      DECLARE
        r RECORD;
      BEGIN
        FOR r IN SELECT id FROM room_queue_items LOOP
          BEGIN
            PERFORM (SELECT id || track_url || title FROM room_queue_items WHERE id = r.id);
          EXCEPTION WHEN others THEN
            UPDATE room_queue_items SET
              track_url = convert_from(replace(convert_to(track_url, 'UTF8'), decode('00','hex'), ''::bytea), 'UTF8'),
              title     = convert_from(replace(convert_to(title,     'UTF8'), decode('00','hex'), ''::bytea), 'UTF8'),
              artist    = CASE WHEN artist IS NOT NULL THEN convert_from(replace(convert_to(artist,    'UTF8'), decode('00','hex'), ''::bytea), 'UTF8') ELSE NULL END,
              file_name = convert_from(replace(convert_to(file_name, 'UTF8'), decode('00','hex'), ''::bytea), 'UTF8'),
              mime_type = convert_from(replace(convert_to(mime_type, 'UTF8'), decode('00','hex'), ''::bytea), 'UTF8')
            WHERE id = r.id;
          END;
        END LOOP;
      END $$;
    `);
    console.log('room_queue_items: cleaned (via DO block)');

    console.log('\n✅ Server-side cleanup complete!');
  } catch (err) {
    console.error('❌ Cleanup failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
