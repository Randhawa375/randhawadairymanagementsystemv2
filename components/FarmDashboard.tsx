import React, { useState, useEffect } from 'react';
import { FarmRecord } from '../types';
import { api } from '../lib/api';
import { formatUrduDate } from '../utils';
import { Milk, Save, ArrowLeft, Calendar, Droplets, Edit2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface FarmDashboardProps {
    onBack: () => void;
}

const FarmDashboard: React.FC<FarmDashboardProps> = ({ onBack }) => {
    const [records, setRecords] = useState<FarmRecord[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [morning, setMorning] = useState('');
    const [evening, setEvening] = useState('');

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        try {
            setLoading(true);
            const data = await api.getFarmRecords();
            setRecords(data);

            // If we have a record for today, pre-fill
            const today = new Date().toISOString().split('T')[0];
            const todayRec = data.find(r => r.date === today);
            if (todayRec) {
                setMorning(todayRec.morningQuantity.toString());
                setEvening(todayRec.eveningQuantity.toString());
            }
        } catch (e) {
            console.error(e);
            alert("ریکارڈ لوڈ نہیں ہو سکا۔");
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        const m = parseFloat(morning) || 0;
        const e = parseFloat(evening) || 0;

        if (m === 0 && e === 0) return;

        const newRecord: FarmRecord = {
            id: uuidv4(),
            date: date,
            morningQuantity: m,
            eveningQuantity: e,
            totalQuantity: m + e,
            timestamp: Date.now()
        };

        // Optimistic Update
        const existingIdx = records.findIndex(r => r.date === date);
        if (existingIdx >= 0) {
            const updated = [...records];
            updated[existingIdx] = newRecord;
            setRecords(updated);
        } else {
            setRecords([newRecord, ...records]);
        }

        try {
            await api.addFarmRecord(newRecord);
            alert("ریکارڈ محفوظ ہو گیا!");
        } catch (e) {
            console.error(e);
            alert("محفوظ نہیں ہو سکا۔");
            loadRecords(); // Revert on fail
        }
    };

    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col fade-in">
            <header className="bg-white border-b border-slate-100 px-6 py-5 flex items-center gap-4 sticky top-0 z-40 backdrop-blur-md shadow-sm">
                <button onClick={onBack} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all active:scale-90 border border-slate-200 shadow-sm">
                    <ArrowLeft size={22} className="text-slate-700" />
                </button>
                <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">پیداوار (Own Farm)</h2>
                    <p className="text-[11px] font-black text-blue-600 uppercase tracking-widest mt-1">
                        DAILY PRODUCTION LOG
                    </p>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 pb-32">
                {/* Input Card */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <Calendar size={20} />
                        </div>
                        <h3 className="font-black text-slate-800 text-lg">آج کی انٹری</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-right text-xs font-black text-slate-400 uppercase tracking-widest mb-2 mr-1">تاریخ</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none border-2 border-slate-100 focus:border-blue-500 transition-all text-right"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-2">صبح (لیٹر)</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={morning}
                                    onChange={(e) => setMorning(e.target.value)}
                                    className="w-full p-4 bg-slate-50 rounded-2xl font-black text-xl text-center text-slate-900 outline-none border-2 border-slate-100 focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-2">شام (لیٹر)</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={evening}
                                    onChange={(e) => setEvening(e.target.value)}
                                    className="w-full p-4 bg-slate-50 rounded-2xl font-black text-xl text-center text-slate-900 outline-none border-2 border-slate-100 focus:border-blue-500 transition-all"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8">
                        <button onClick={handleSave} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 active:scale-95 transition-all flex items-center justify-center gap-3">
                            <Save size={24} />
                            محفوظ کریں
                        </button>
                    </div>
                </div>

                {/* History List */}
                <h3 className="text-right font-black text-slate-400 text-sm uppercase tracking-widest mb-4 mr-2">پچھلا ریکارڈ</h3>
                <div className="space-y-3">
                    {records.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 font-bold">کوئی ریکارڈ موجود نہیں</div>
                    ) : (
                        records.map(rec => (
                            <div key={rec.id} className="bg-white p-5 rounded-2xl border border-slate-100 flex items-center justify-between shadow-sm group">
                                <div className="text-left">
                                    <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-xs font-black inline-block mb-1">
                                        {rec.totalQuantity} L
                                    </div>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">توتل</p>
                                </div>

                                <div className="flex gap-8 text-center">
                                    <div>
                                        <span className="block font-bold text-slate-700">{rec.morningQuantity}</span>
                                        <span className="text-[10px] text-slate-300 uppercase font-black">Morning</span>
                                    </div>
                                    <div>
                                        <span className="block font-bold text-slate-700">{rec.eveningQuantity}</span>
                                        <span className="text-[10px] text-slate-300 uppercase font-black">Evening</span>
                                    </div>
                                </div>

                                <div className="text-right flex flex-col items-end">
                                    <p className="font-bold text-slate-900">{formatUrduDate(rec.date)}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{rec.date}</p>
                                    <button
                                        onClick={() => {
                                            setDate(rec.date);
                                            setMorning(rec.morningQuantity.toString());
                                            setEvening(rec.eveningQuantity.toString());
                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                        }}
                                        className="mt-2 text-xs font-bold text-blue-500 hover:text-blue-700 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                                    >
                                        <Edit2 size={12} /> Edit
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div>
        </div>
    );
};

export default FarmDashboard;
