
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

// Simple .env parser
const env = {};
try {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            env[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
        }
    });
} catch (e) {
    console.error("Could not read .env file at", envPath);
    process.exit(1);
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDuplicates() {
    console.log("Fetching all milk records...");

    // Fetch all records (might need pagination if thousands, but let's assume < 1000 for now or fetch in chunks)
    // Supabase limit is usually 1000. Let's fetch all.
    let allRecords = [];
    let from = 0;
    let step = 1000;

    while (true) {
        const { data, error } = await supabase
            .from('milk_records')
            .select('*')
            .range(from, from + step - 1);

        if (error) {
            console.error("Error fetching records:", error);
            return;
        }

        if (!data || data.length === 0) break;

        allRecords = [...allRecords, ...data];
        from += step;
        console.log(`Fetched ${allRecords.length} records...`);
        if (data.length < step) break;
    }

    console.log(`Total records: ${allRecords.length}`);

    // Group by contact_id + date
    const groups = {};
    allRecords.forEach(r => {
        const key = `${r.contact_id}_${r.date}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    let duplicatesFound = 0;
    let recordsDeleted = 0;

    for (const key in groups) {
        const group = groups[key];
        if (group.length > 1) {
            duplicatesFound++;
            console.log(`Duplicate found for ${key}: ${group.length} records`);

            // Sort: Keep the one with the latest timestamp (edit) or highest ID? 
            // Usually the one with the highest ID is the latest insert.
            // Or if one has data and others are 0?
            // Let's prioritize records with non-zero quantity.
            // If all have entries, keep the latest one (highest ID or created_at).

            group.sort((a, b) => {
                // updated_at might not be there or reliable if we didn't select it, but IDs are usually sequential-ish or we use created_at
                // Let's use created_at if available, else ID
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                return timeB - timeA; // Descending (latest first)
            });

            // Helper to check content
            const hasContent = (r) => r.total_quantity > 0;

            // If the latest one is empty (0) but an older one has data, maybe keep the one with data?
            // Actually, if user deleted (set to 0), we should respect the latest.
            // But here we think these are 'ghost' inserts from rapid typing.
            // Usually rapid typing means: 1, 12, 120. All inserts. 120 is the last one.
            // So Keeping the Latest is usually correct.

            const toKeep = group[0];
            const toDelete = group.slice(1);

            console.log(`  Keeping ID: ${toKeep.id}, Qty: ${toKeep.total_quantity}`);

            const idsToDelete = toDelete.map(r => r.id);
            console.log(`  Deleting IDs: ${idsToDelete.join(', ')}`);

            const { error } = await supabase
                .from('milk_records')
                .delete()
                .in('id', idsToDelete);

            if (error) {
                console.error("  Error deleting:", error);
            } else {
                recordsDeleted += idsToDelete.length;
                console.log("  Deleted successfully.");
            }
        }
    }

    console.log("--------------------------------------------------");
    console.log(`Scan complete.`);
    console.log(`Duplicate Groups Found: ${duplicatesFound}`);
    console.log(`Records Deleted: ${recordsDeleted}`);
}

fixDuplicates();
