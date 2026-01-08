
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

async function checkColumn() {
    console.log("Checking for 'opening_balance' column in 'contacts' table...");

    // We can't always search result of information_schema with anon key due to permissions (sometimes).
    // But let's try RPC or raw query if possible? No/
    // The trick: Try to select the specific column from the table with limit 0.

    const { data, error } = await supabase
        .from('contacts')
        .select('opening_balance')
        .limit(1);

    if (error) {
        console.error("Column check FAILED:", error.message);
        if (error.message.includes('does not exist') || error.code === '42703') {
            console.log("CONCLUSION: The 'opening_balance' column does NOT exist.");
        } else {
            console.log("CONCLUSION: Could not verify due to permission/RLS or other error.");
            console.log("Error Code:", error.code);
        }
    } else {
        console.log("SUCCESS: Column 'opening_balance' appears to exist!");
        console.log("Data snippet:", data);
    }
}

checkColumn();
