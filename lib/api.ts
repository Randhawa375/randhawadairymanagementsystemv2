import { supabase } from './supabase';
import { Contact, MilkRecord, Payment, ModuleType } from '../types';

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

export const api = {
    // Profiles
    async getProfile() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        return data;
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
        return mapContact(data);
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
            const { error } = await supabase.from('milk_records').update({
                morning_quantity: record.morningQuantity,
                evening_quantity: record.eveningQuantity,
                total_quantity: record.totalQuantity, // Database stored column (even if computed, good to store cache)
                total_price: record.totalPrice,
            }).eq('id', existing.id);
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
    }
};
