import { supabase } from './supabase';
import { Contact, MilkRecord, Payment, ModuleType, FarmRecord } from '../types';

// Helper to map DB contact to App Contact
const mapContact = (data: any): Contact => ({
    id: data.id,
    name: data.name,
    pricePerLiter: Number(data.price_per_liter),
    records: [],
    payments: [],
    openingBalance: Number(data.opening_balance || 0),
    createdAt: new Date(data.created_at).getTime(),
});

// Helper to map DB record to App MilkRecord
const mapRecord = (data: any): MilkRecord => ({
    id: data.id,
    date: data.date,
    morningQuantity: Number(data.morning_quantity),
    eveningQuantity: Number(data.evening_quantity),
    totalQuantity: Number(data.total_quantity),
    totalPrice: Number(data.total_price),
    pricePerLiter: data.price_per_liter ? Number(data.price_per_liter) : undefined,
    imageUrl: data.image_url,
    timestamp: new Date(data.created_at).getTime(),
});

// Helper to map DB payment to App Payment
const mapPayment = (data: any): Payment => ({
    id: data.id,
    amount: Number(data.amount),
    date: data.date,
    description: data.description,
    timestamp: new Date(data.created_at).getTime(),
});

// Helper to map DB farm record
const mapFarmRecord = (data: any): FarmRecord => ({
    id: data.id,
    date: data.date,
    morningQuantity: Number(data.morning_quantity),
    eveningQuantity: Number(data.evening_quantity),
    totalQuantity: Number(data.total_quantity),
    openingStock: data.opening_stock ? Number(data.opening_stock) : 0,
    imageUrl: data.image_url,
    timestamp: new Date(data.created_at).getTime(),
});

export const api = {
    // Profiles
    async getProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        return data;
    },

    // Storage
    async uploadImage(file: File): Promise<string> {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('receipts')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
        return data.publicUrl;
    },

    // Contacts
    async getContacts(type: ModuleType): Promise<Contact[]> {
        const { data: contacts, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('type', type);

        if (error) throw error;
        if (!contacts) return [];

        const contactIds = contacts.map(c => c.id);

        if (contactIds.length === 0) return contacts.map(mapContact);

        const { data: records } = await supabase
            .from('milk_records')
            .select('*')
            .in('contact_id', contactIds);

        const { data: payments } = await supabase
            .from('payments')
            .select('*')
            .in('contact_id', contactIds);

        return contacts.map(c => {
            const mapped = mapContact(c);
            mapped.records = records?.filter(r => r.contact_id === c.id).map(mapRecord) || [];
            mapped.payments = payments?.filter(p => p.contact_id === c.id).map(mapPayment) || [];
            return mapped;
        });
    },

    async createContact(contact: Contact, type: ModuleType) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Remove UUID if it was generated client-side, let DB handle it? 
        // Or keep client UUID. Let's keep client UUID to simplify migration mapping 
        // IF valid UUID. If not, omit ID.
        const payload: any = {
            user_id: user.id,
            name: contact.name,
            type: type,
            price_per_liter: contact.pricePerLiter,
            opening_balance: contact.openingBalance || 0,
        };
        if (contact.id) payload.id = contact.id;

        const { data, error } = await supabase
            .from('contacts')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

        const mapped = mapContact(data);

        // Validation: Check if DB actually saved the opening balance
        if (contact.openingBalance && contact.openingBalance !== 0 && mapped.openingBalance === 0) {
            console.error("CRITICAL: Opening balance was sent but DB returned 0. Column likely missing.");
            alert("Database Warning: Previous Balance was NOT saved. The database schema is missing the 'opening_balance' column. Please run the SQL migration script.");
        }

        return mapped;
    },

    async updateContact(contact: Contact) {
        const { error } = await supabase
            .from('contacts')
            .update({
                name: contact.name,
                price_per_liter: contact.pricePerLiter,
                opening_balance: contact.openingBalance || 0,
            })
            .eq('id', contact.id);

        if (error) throw error;

        // Validation: Verify it stuck
        const { data: verifyData } = await supabase.from('contacts').select('opening_balance').eq('id', contact.id).single();
        if (contact.openingBalance && contact.openingBalance !== 0 && (!verifyData || verifyData.opening_balance === 0)) {
            console.error("CRITICAL: Opening balance update not persisted. Column missing?");
            alert("Database Warning: Previous Balance was NOT saved. The database schema is missing the 'opening_balance' column. Please run the SQL migration script.");
        }
    },

    async deleteContact(id: string) {
        const { error } = await supabase.from('contacts').delete().eq('id', id);
        if (error) throw error;
    },

    // Records
    async addRecord(contactId: string, record: MilkRecord) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check if existing record for this date
        const { data: existing } = await supabase
            .from('milk_records')
            .select('id')
            .eq('contact_id', contactId)
            .eq('date', record.date)
            .maybeSingle();

        if (existing) {
            const updatePayload: any = {
                morning_quantity: record.morningQuantity,
                evening_quantity: record.eveningQuantity,
                total_quantity: record.totalQuantity,
                total_price: record.totalPrice,
            };

            // Allow updating or clearing the image
            if (record.imageUrl !== undefined) {
                updatePayload.image_url = record.imageUrl;
            }

            // Only update price if it's explicitly provided in the record object
            if (record.pricePerLiter !== undefined) {
                updatePayload.price_per_liter = record.pricePerLiter;
            }

            const { error } = await supabase.from('milk_records').update(updatePayload).eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('milk_records').insert({
                contact_id: contactId,
                user_id: user.id,
                date: record.date,
                morning_quantity: record.morningQuantity,
                evening_quantity: record.eveningQuantity,
                total_quantity: record.totalQuantity,
                total_price: record.totalPrice,
                price_per_liter: record.pricePerLiter, // Save the snapshot
                image_url: record.imageUrl
            });
            if (error) throw error;
        }
    },

    // Payments
    async addPayment(contactId: string, payment: Payment) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const { error } = await supabase.from('payments').insert({
            contact_id: contactId,
            user_id: user.id,
            amount: payment.amount,
            date: payment.date,
            description: payment.description
        });

        if (error) throw error;
    },

    async updatePayment(payment: Payment) {
        const { error } = await supabase.from('payments').update({
            amount: payment.amount,
            description: payment.description,
            date: payment.date
        }).eq('id', payment.id);

        if (error) throw error;
    },

    async deletePayment(id: string) {
        const { error } = await supabase.from('payments').delete().eq('id', id);
        if (error) throw error;
    },

    // Farm Records
    async getFarmRecords(): Promise<FarmRecord[]> {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('farm_records')
            .select('*')
            .order('date', { ascending: false });

        if (error) throw error;
        return (data || []).map(mapFarmRecord);
    },

    async addFarmRecord(record: FarmRecord) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        // Check for existing record on this date
        const { data: existing } = await supabase
            .from('farm_records')
            .select('id')
            .eq('date', record.date)
            .maybeSingle();

        const payload: any = {
            morning_quantity: record.morningQuantity,
            evening_quantity: record.eveningQuantity,
            total_quantity: record.totalQuantity
        };

        if (record.imageUrl) {
            payload.image_url = record.imageUrl;
        }

        // Allow passing null to clear the manual override
        if (record.openingStock !== undefined) {
            payload.opening_stock = record.openingStock;
        }

        if (existing) {
            const { error } = await supabase.from('farm_records').update(payload).eq('id', existing.id);
            if (error) throw error;
        } else {
            payload.user_id = user.id;
            payload.date = record.date;
            // Default: if undefined, set to 0. If null, set to null (auto)
            if (payload.opening_stock === undefined) payload.opening_stock = 0;

            const { error } = await supabase.from('farm_records').insert(payload);
            if (error) throw error;
        }
    },

    async deleteFarmRecord(id: string) {
        const { error } = await supabase.from('farm_records').delete().eq('id', id);
        if (error) throw error;
    }
};
