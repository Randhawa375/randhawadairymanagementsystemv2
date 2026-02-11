import React, { useState, useEffect } from 'react';
import { FarmRecord } from '../types';
import { api } from '../lib/api';
import { formatUrduDate } from '../utils';
import { Milk, Save, ArrowLeft, Calendar, Droplets, Edit2, X, Trash2, Camera, Image as ImageIcon, Loader2 } from 'lucide-react';
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
    const [isEditing, setIsEditing] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // File Input Ref
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Calculate Totals
    const { totalMorning, totalEvening, grandTotal } = React.useMemo(() => {
        return records.reduce((acc, rec) => {
            acc.totalMorning += rec.morningQuantity || 0;
            acc.totalEvening += rec.eveningQuantity || 0;
            acc.grandTotal += rec.totalQuantity || 0;
            return acc;
        }, { totalMorning: 0, totalEvening: 0, grandTotal: 0 });
    }, [records]);

    useEffect(() => {
        loadRecords();
    }, []);

    const loadRecords = async () => {
        try {
            setLoading(true);
            const data = await api.getFarmRecords();
            setRecords(data);

            // If we have a record for today, pre-fill ONLY if not editing something else
            if (!isEditing) {
                const today = new Date().toISOString().split('T')[0];
                const todayRec = data.find(r => r.date === today);
                if (todayRec) {
                    setMorning(todayRec.morningQuantity.toString());
                    setEvening(todayRec.eveningQuantity.toString());
                    setImageUrl(todayRec.imageUrl || null);
                }
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

        // Allow saving 0 if we really mean to clear it? Or assume deletion? 
        // For now, let's allow it but typically 0 means no record.
        // if (m === 0 && e === 0) return; 

        const newRecord: FarmRecord = {
            id: uuidv4(),
            date: date,
            morningQuantity: m,
            eveningQuantity: e,
            totalQuantity: m + e,
            imageUrl: imageUrl || undefined,
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
            setIsEditing(false); // Clear edit mode

            // If we were editing, maybe clear form?
            // If we just saved "Today", we keep it there.
            if (date !== new Date().toISOString().split('T')[0]) {
                // Reset to today if we edited a past record
                setDate(new Date().toISOString().split('T')[0]);
                setMorning('');
                setEvening('');
                setImageUrl(null);
            }
        } catch (e) {
            console.error(e);
            alert("محفوظ نہیں ہو سکا۔");
            loadRecords(); // Revert on fail
        }
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setDate(new Date().toISOString().split('T')[0]);
        setMorning('');
        setEvening('');
        setImageUrl(null);
        loadRecords(); // Reload to ensure 'today' default logic runs
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsUploading(true);
            const url = await api.uploadImage(file);
            setImageUrl(url);
        } catch (err) {
            console.error(err);
            alert("تصویر اپ لوڈ نہیں ہو سکی۔");
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
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
                        روزانہ پیداوار کا ریکارڈ
                    </p>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 pb-32">
                {/* Input Card */}
                <div className={`bg-white rounded-3xl p-6 shadow-sm border ${isEditing ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-100'} mb-8 transition-all`}>
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full ${isEditing ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'} flex items-center justify-center transition-colors`}>
                                {isEditing ? <Edit2 size={20} /> : <Calendar size={20} />}
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 text-lg">{isEditing ? 'ریکارڈ میں تبدیلی' : 'آج کی انٹری'}</h3>
                                {isEditing && <p className="text-xs text-blue-600 font-bold">آپ ماضی کا ریکارڈ تبدیل کر رہے ہیں</p>}
                            </div>
                        </div>
                        {isEditing && (
                            <button onClick={handleCancelEdit} className="text-slate-400 hover:text-slate-600 p-2 bg-slate-100 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-right text-xs font-black text-slate-400 uppercase tracking-widest mb-2 mr-1">تاریخ</label>
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className={`w-full p-4 bg-slate-50 rounded-2xl font-bold text-slate-900 outline-none border-2 ${isEditing ? 'border-blue-200 focus:border-blue-500' : 'border-slate-100 focus:border-blue-500'} transition-all text-right`}
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
                                    className={`w-full p-4 bg-slate-50 rounded-2xl font-black text-xl text-center text-slate-900 outline-none border-2 ${isEditing ? 'border-blue-200 focus:border-blue-500' : 'border-slate-100 focus:border-blue-500'} transition-all`}
                                />
                            </div>
                            <div>
                                <label className="block text-center text-xs font-black text-slate-400 uppercase tracking-widest mb-2">شام (لیٹر)</label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={evening}
                                    onChange={(e) => setEvening(e.target.value)}
                                    className={`w-full p-4 bg-slate-50 rounded-2xl font-black text-xl text-center text-slate-900 outline-none border-2 ${isEditing ? 'border-blue-200 focus:border-blue-500' : 'border-slate-100 focus:border-blue-500'} transition-all`}
                                />
                            </div>
                        </div>

                        {/* Image Upload Section */}
                        <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-4">
                                <div onClick={() => fileInputRef.current?.click()} className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm cursor-pointer hover:bg-slate-100 transition-colors border border-slate-200 text-slate-400">
                                    {isUploading ? <Loader2 className="animate-spin" size={20} /> : (imageUrl ? <img src={imageUrl} className="w-full h-full object-cover rounded-xl" /> : <Camera size={20} />)}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-700 text-sm">تصویر (Optional)</p>
                                    <p className="text-[10px] text-slate-400 font-bold max-w-[200px] truncate">{imageUrl ? "Image Attached" : "Tap camera to upload receipt"}</p>
                                </div>
                            </div>

                            {imageUrl && (
                                <button onClick={() => setImageUrl(null)} className="text-rose-500 bg-rose-50 p-2 rounded-lg hover:bg-rose-100 font-bold text-xs">Remove</button>
                            )}

                            <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
                        </div>
                    </div>

                    <div className="mt-8 flex gap-3">
                        {isEditing && (
                            <button onClick={handleCancelEdit} className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black text-lg hover:bg-slate-200 active:scale-95 transition-all">
                                منسوخ
                            </button>
                        )}
                        <button onClick={handleSave} className={`flex-[2] ${isEditing ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'} text-white py-4 rounded-2xl font-black text-lg shadow-xl shadow-blue-100 active:scale-95 transition-all flex items-center justify-center gap-3`}>
                            <Save size={24} />
                            {isEditing ? 'اپ ڈیٹ کریں' : 'محفوظ کریں'}
                        </button>
                    </div>
                </div>

                {/* History List - Summary Card */}
                <div className="grid grid-cols-3 gap-3 mb-8">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-[2rem] shadow-xl shadow-slate-200 flex flex-col items-center justify-center relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/5 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500"></div>
                        <span className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] mb-1">Total Milk</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-2xl font-black text-white">{grandTotal}</span>
                            <span className="text-[10px] font-bold text-white/50">L</span>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-100 p-4 rounded-[2rem] shadow-sm flex flex-col items-center justify-center hover:shadow-md transition-all">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Morning</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-slate-800">{totalMorning}</span>
                            <span className="text-[10px] font-bold text-slate-400">L</span>
                        </div>
                    </div>
                    <div className="bg-white border border-slate-100 p-4 rounded-[2rem] shadow-sm flex flex-col items-center justify-center hover:shadow-md transition-all">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Evening</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-xl font-black text-slate-800">{totalEvening}</span>
                            <span className="text-[10px] font-bold text-slate-400">L</span>
                        </div>
                    </div>
                </div>

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

                                {rec.imageUrl && (
                                    <div className="mx-4 h-8 w-px bg-slate-100 md:block hidden"></div>
                                )}

                                {rec.imageUrl && (
                                    <div className="hidden md:block">
                                        <a href={rec.imageUrl} target="_blank" rel="noreferrer" className="text-blue-500 flex items-center gap-1 text-xs font-bold bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100">
                                            <ImageIcon size={12} /> View
                                        </a>
                                    </div>
                                )}

                                <div className="text-right">
                                    <p className="font-bold text-slate-900">{formatUrduDate(rec.date)}</p>
                                    <div className="flex items-center justify-end gap-2 mt-1">
                                        <p className="text-xs text-slate-400">{rec.date}</p>
                                        <button
                                            onClick={() => {
                                                setDate(rec.date);
                                                setMorning(rec.morningQuantity.toString());
                                                setEvening(rec.eveningQuantity.toString());
                                                setImageUrl(rec.imageUrl || null);
                                                setIsEditing(true);
                                                window.scrollTo({ top: 0, behavior: 'smooth' });
                                            }}
                                            className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-blue-100 hover:text-blue-600 transition-colors"
                                            title="Edit Record"
                                        >
                                            <Edit2 size={14} />
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (window.confirm("کیا آپ واقعی یہ ریکارڈ حذف کرنا چاہتے ہیں؟")) {
                                                    try {
                                                        await api.deleteFarmRecord(rec.id);
                                                        setRecords(records.filter(r => r.id !== rec.id));
                                                    } catch (e) {
                                                        alert("حذف نہیں ہو سکا۔");
                                                    }
                                                }
                                            }}
                                            className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-rose-100 hover:text-rose-600 transition-colors"
                                            title="Delete Record"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

            </div >
        </div >
    );
};

export default FarmDashboard;
