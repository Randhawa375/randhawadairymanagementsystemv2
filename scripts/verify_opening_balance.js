
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manual .env parsing
function loadEnv() {
    // Try .env first, then .env.local
    const files = ['.env', '.env.local'];
    let env = {};

    for (const file of files) {
        const envPath = path.resolve(process.cwd(), file);
        if (fs.existsSync(envPath)) {
            console.log(`Loading env from ${file}`);
            const content = fs.readFileSync(envPath, 'utf-8');
            content.split('\n').forEach(line => {
                const parts = line.split('=');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts.slice(1).join('=').trim().replace(/^['"](.*)['"]$/, '$1'); // Remove quotes
                    if (key && !key.startsWith('#')) {
                        env[key] = val;
                    }
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
    console.error("Missing Supabase credentials. Checked .env and .env.local");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function verifySchema() {
    console.log("Verifying 'opening_balance' persistence...");

    // 1. Fetch an existing contact to test with
    const { data: contacts, error: fetchError } = await supabase
        .from('contacts')
        .select('*')
        .limit(1);

    if (fetchError) {
        console.error("Error fetching contacts:", fetchError);
        return;
    }

    if (!contacts || contacts.length === 0) {
        console.log("No contacts found to test with. Please add a contact manually first.");
        return;
    }

    const contact = contacts[0];
    console.log(`Testing with contact: ${contact.name} (ID: ${contact.id})`);
    console.log(`Current opening_balance: ${contact.opening_balance}`);

    const originalBalance = contact.opening_balance;
    const newBalance = (Number(originalBalance) || 0) + 10;

    console.log(`Attempting to update opening_balance to ${newBalance}...`);

    const { error: updateError } = await supabase
        .from('contacts')
        .update({ opening_balance: newBalance })
        .eq('id', contact.id);

    if (updateError) {
        console.error("Error updating contact:", updateError);
        // If error is code '42703' (undefined_column), then we know it's missing.
        console.log("If the error mentions 'undefined column' or similar, the schema update is missing.");
        return;
    }

    // Read back
    const { data: updatedContact, error: readError } = await supabase
        .from('contacts')
        .select('opening_balance')
        .eq('id', contact.id)
        .single();

    if (readError) {
        console.error("Error reading back contact:", readError);
        return;
    }

    console.log(`Read back opening_balance: ${updatedContact.opening_balance}`);

    if (Number(updatedContact.opening_balance) === newBalance) {
        console.log("SUCCESS: opening_balance was successfully saved and retrieved.");
        console.log("Reverting changes...");
        await supabase.from('contacts').update({ opening_balance: originalBalance }).eq('id', contact.id);
    } else {
        console.error("FAILURE: opening_balance did NOT match. The column might be missing or ignored.");
        console.log(`Expected: ${newBalance}, Got: ${updatedContact.opening_balance}`);
    }
}

verifySchema();
