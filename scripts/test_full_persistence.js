
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnv() {
    const files = ['.env', '.env.local'];
    let env = {};
    for (const file of files) {
        const envPath = path.resolve(process.cwd(), file);
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim().replace(/^['"](.*)['"]$/, '$1');
                    if (key && !key.startsWith('#')) env[key] = val;
                }
            });
        }
    }
    return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing credentials.");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testPersistence() {
    console.log("Starting Full Persistence Test...");
    const TEST_BALANCE = 9999;

    // 1. Need a user ID for RLS usually. Attempt to get session or use a known one.
    // We'll try to insert with a random fake user_id if we can't auth. 
    // NOTE: If RLS is strict, this might fail on 'user_id' FK constraint or Policy.
    // But let's try auth first.

    const { data: { session }, error: authError } = await supabase.auth.getSession();
    let userId = session?.user?.id;

    if (!userId) {
        console.log("No active session found in environment. Trying to fetch ANY valid user_id from existing contacts just to satisfy FK constraints if needed...");
        // Compromise: Read one contact to get a valid user_id (the owner)
        const { data: existing } = await supabase.from('contacts').select('user_id').limit(1);
        if (existing && existing.length > 0) {
            userId = existing[0].user_id;
            console.log("Using existing user_id for test:", userId);
        } else {
            console.log("No existing data to scrape user_id from. Generating a random one (might fail FK).");
            userId = '00000000-0000-0000-0000-000000000000';
        }
    }

    const payload = {
        name: 'TEST_OPENING_BALANCE_BOT',
        type: 'SALE',
        price_per_liter: 100,
        opening_balance: TEST_BALANCE,
        user_id: userId
    };

    console.log("Inserting dummy contact:", payload);

    const { data, error: insertError } = await supabase
        .from('contacts')
        .insert(payload)
        .select()
        .single();

    if (insertError) {
        console.error("INSERT FAILED:", insertError);
        console.log("Potential Causes: RLS Policy blocking INSERT, or 'opening_balance' column missing.");
        return;
    }

    console.log("Insert successful. ID:", data.id);
    console.log("Returned opening_balance:", data.opening_balance);

    if (Number(data.opening_balance) === TEST_BALANCE) {
        console.log("✅ SUCCESS: opening_balance persisted correctly.");
    } else {
        console.error("❌ FAILURE: opening_balance was ignored (returned 0 or null).");
        console.log("Likely cause: The column is missing in the DB schema.");
    }

    // Cleanup
    console.log("Cleaning up test data...");
    const { error: deleteError } = await supabase.from('contacts').delete().eq('id', data.id);
    if (deleteError) console.error("Cleanup failed:", deleteError);
}

testPersistence();
