
import React, { useState, useMemo, useEffect } from 'react';
import { Contact, MilkRecord, ModuleType, Payment } from '../types';
import { formatUrduDate, getMonthLabel, getEnglishMonthLabel } from '../utils';
import { ChevronRight, Save, Edit2, X, Download, Milk, Loader2, DollarSign, Wallet, ArrowLeft, History, Plus, Trash2, FileText, ReceiptText } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { api } from '../lib/api';

interface BuyerProfileProps {
  buyer: Contact;
  moduleType: ModuleType;
  selectedMonthDate: Date;
  onBack: () => void;
  onUpdateBuyer: (updatedBuyer: Contact) => void;
}

const BuyerProfile: React.FC<BuyerProfileProps> = ({ buyer, moduleType, selectedMonthDate, onBack, onUpdateBuyer }) => {
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState(buyer.pricePerLiter.toString());
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isGeneratingPaymentPDF, setIsGeneratingPaymentPDF] = useState(false);

  // Payment UI state
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'PAYMENTS'>('LEDGER');

  const isSale = moduleType === 'SALE';
  const colorClass = isSale ? 'text-emerald-600' : 'text-rose-600';
  const bgSoftClass = isSale ? 'bg-emerald-50' : 'bg-rose-50';
  const ringClass = isSale ? 'ring-emerald-500' : 'ring-rose-500';
  const btnClass = isSale ? 'bg-emerald-600' : 'bg-rose-600';

  const currentMonthPrefix = useMemo(() => {
    return `${selectedMonthDate.getFullYear()}-${String(selectedMonthDate.getMonth() + 1).padStart(2, '0')}`;
  }, [selectedMonthDate]);

  const isPastMonth = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const selectedYear = selectedMonthDate.getFullYear();
    const selectedMonth = selectedMonthDate.getMonth();

    if (selectedYear < currentYear) return true;
    if (selectedYear === currentYear && selectedMonth < currentMonth) return true;
    return false;
  }, [selectedMonthDate]);

  const daysInMonth = useMemo(() => {
    const year = selectedMonthDate.getFullYear();
    const month = selectedMonthDate.getMonth();
    const days = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) =>
      `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    );
  }, [selectedMonthDate]);

  const handleRecordUpdate = async (dateStr: string, field: 'morning' | 'evening', value: string) => {
    if (isPastMonth) return;
    let val = parseFloat(value) || 0;
    const updatedRecords = [...buyer.records];
    const index = updatedRecords.findIndex(r => r.date === dateStr);

    let newRecord: MilkRecord;

    if (index >= 0) {
      const rec = updatedRecords[index];
      const m = field === 'morning' ? val : rec.morningQuantity;
      const e = field === 'evening' ? val : rec.eveningQuantity;
      newRecord = {
        ...rec,
        morningQuantity: m,
        eveningQuantity: e,
        totalQuantity: m + e,
        totalPrice: Math.round((m + e) * buyer.pricePerLiter)
      };
      updatedRecords[index] = newRecord;
    } else {
      const m = field === 'morning' ? val : 0;
      const e = field === 'evening' ? val : 0;
      newRecord = {
        id: uuidv4(), // Client generated ID, acceptable for upsert if consistent
        date: dateStr,
        morningQuantity: m,
        eveningQuantity: e,
        totalQuantity: m + e,
        totalPrice: Math.round((m + e) * buyer.pricePerLiter),
        timestamp: Date.now()
      };
      updatedRecords.push(newRecord);
    }

    // Optimistic Update
    onUpdateBuyer({ ...buyer, records: updatedRecords });

    // API Call
    try {
      await api.addRecord(buyer.id, newRecord);
    } catch (e) {
      console.error("Failed to save record", e);
      // Revert logic could be added here
    }
  };

  const handleSavePayment = async () => {
    if (isPastMonth) return;
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;

    let updatedPayments = [...(buyer.payments || [])];
    let paymentToSave: Payment;

    if (editingPaymentId) {
      const existing = updatedPayments.find(p => p.id === editingPaymentId);
      if (!existing) return;
      paymentToSave = { ...existing, amount, description: paymentDescription.trim() || undefined };
      updatedPayments = updatedPayments.map(p => p.id === editingPaymentId ? paymentToSave : p);
    } else {
      paymentToSave = {
        id: uuidv4(),
        amount,
        date: new Date().toISOString().split('T')[0],
        description: paymentDescription.trim() || undefined,
        timestamp: Date.now()
      };
      updatedPayments.push(paymentToSave);
    }

    // Optimistic Update
    onUpdateBuyer({ ...buyer, payments: updatedPayments });
    resetPaymentForm();

    // API Call
    try {
      if (editingPaymentId) {
        await api.updatePayment(paymentToSave);
      } else {
        await api.addPayment(buyer.id, paymentToSave);
      }
    } catch (e) {
      console.error("Failed to save payment", e);
      alert("پیمنٹ محفوظ نہیں ہو سکی۔");
      // Revert logic needed ideally
    }
  };

  const resetPaymentForm = () => {
    setPaymentAmount('');
    setPaymentDescription('');
    setEditingPaymentId(null);
    setIsAddingPayment(false);
  };

  const handleEditPayment = (payment: Payment) => {
    if (isPastMonth) {
      alert("پرانے مہینے کی پیمنٹ تبدیل نہیں کی جا سکتی۔");
      return;
    }
    setEditingPaymentId(payment.id);
    setPaymentAmount(payment.amount.toString());
    setPaymentDescription(payment.description || '');
    setIsAddingPayment(true);
  };

  const handleDeletePayment = async (id: string) => {
    if (isPastMonth) {
      alert("پرانے مہینے کا ریکارڈ حذف نہیں کیا جا سکتا۔");
      return;
    }
    if (!window.confirm('کیا آپ یہ پیمنٹ ڈیلیٹ کرنا چاہتے ہیں؟')) return;

    const updatedPayments = (buyer.payments || []).filter(p => p.id !== id);
    onUpdateBuyer({ ...buyer, payments: updatedPayments });

    try {
      await api.deletePayment(id);
    } catch (e) {
      alert("حذف نہیں ہو سکا۔");
    }
  };

  const monthRecords = useMemo(() => {
    return buyer.records.filter(r => r.date.startsWith(currentMonthPrefix));
  }, [buyer.records, currentMonthPrefix]);

  const monthPayments = useMemo(() => {
    return (buyer.payments || []).filter(p => p.date.startsWith(currentMonthPrefix));
  }, [buyer.payments, currentMonthPrefix]);

  const monthMilk = monthRecords.reduce((sum, r) => sum + r.totalQuantity, 0);
  const monthBill = monthRecords.reduce((sum, r) => sum + r.totalPrice, 0);
  const monthPaid = monthPayments.reduce((sum, p) => sum + p.amount, 0);
  const monthBalance = monthBill - monthPaid;

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF();
      const engMonth = getEnglishMonthLabel(selectedMonthDate);
      doc.setFontSize(22);
      doc.setTextColor(20, 20, 20);
      doc.text("Randhawa Dairy & Cattle Farm", 105, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.text("Proprietor: Farhan Randhawa", 105, 27, { align: 'center' });
      doc.setDrawColor(240, 240, 240);
      doc.line(20, 32, 190, 32);

      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);
      doc.text(`Milk Ledger: ${buyer.name.toUpperCase()} (${isSale ? 'Customer' : 'Supplier'})`, 20, 45);
      doc.text(`Month: ${engMonth}`, 20, 51);
      doc.text(`Rate: ${buyer.pricePerLiter} PKR/L`, 20, 57);

      const recordedRows = daysInMonth
        .map(dateStr => {
          const record = buyer.records.find(r => r.date === dateStr);
          if (!record || record.totalQuantity <= 0) return null;
          return [dateStr, record.morningQuantity, record.eveningQuantity, record.totalQuantity, `${record.totalPrice.toLocaleString()}`];
        })
        .filter((row): row is any[] => row !== null);

      autoTable(doc, {
        startY: 65,
        head: [['Date', 'Morning (L)', 'Evening (L)', 'Total (L)', 'Bill (PKR)']],
        body: recordedRows,
        theme: 'grid',
        headStyles: { fillColor: isSale ? [5, 150, 105] : [225, 29, 72], fontSize: 10 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Summary for ${engMonth}:`, 20, finalY);
      doc.text(`Total Milk: ${monthMilk} Liters`, 20, finalY + 8);
      doc.text(`Total Bill: ${monthBill.toLocaleString()} PKR`, 20, finalY + 16);
      doc.text(`Total Paid: ${monthPaid.toLocaleString()} PKR`, 110, finalY + 8);
      doc.text(`REMAINING BALANCE: ${monthBalance.toLocaleString()} PKR`, 110, finalY + 16);

      doc.save(`${buyer.name}_Milk_Ledger_${engMonth}.pdf`);
    } catch (e) {
      alert("PDF نہیں بن سکی۔");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDownloadPaymentPDF = async () => {
    setIsGeneratingPaymentPDF(true);
    try {
      const doc = new jsPDF();
      const engMonth = getEnglishMonthLabel(selectedMonthDate);
      doc.setFontSize(22);
      doc.setTextColor(20, 20, 20);
      doc.text("Randhawa Dairy & Cattle Farm", 105, 20, { align: 'center' });
      doc.setFontSize(11);
      doc.text("Proprietor: Farhan Randhawa", 105, 27, { align: 'center' });
      doc.setDrawColor(240, 240, 240);
      doc.line(20, 32, 190, 32);

      doc.setFontSize(14);
      doc.setTextColor(0, 0, 0);
      doc.text(`PAYMENT RECORD: ${buyer.name.toUpperCase()}`, 105, 45, { align: 'center' });
      doc.setFontSize(11);
      doc.setTextColor(100, 100, 100);
      doc.text(`Month: ${engMonth}`, 20, 55);

      const paymentRows = monthPayments.map(p => [
        p.date,
        `${p.amount.toLocaleString()} PKR`,
        p.description || '-'
      ]);

      autoTable(doc, {
        startY: 65,
        head: [['Date', 'Amount Paid', 'Description / Notes']],
        body: paymentRows,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85], fontSize: 11 }
      });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`Total Monthly Payments: ${monthPaid.toLocaleString()} PKR`, 20, finalY);

      doc.save(`${buyer.name}_Payments_Report_${engMonth}.pdf`);
    } catch (e) {
      alert("پیمنٹ رپورٹ نہیں بن سکی۔");
    } finally {
      setIsGeneratingPaymentPDF(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 fade-in flex flex-col">
      <header className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-5">
          <button onClick={onBack} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 transition-all active:scale-90 border border-slate-200 shadow-sm">
            <ArrowLeft size={22} className="text-slate-700" />
          </button>
          <div className="text-right">
            <h2 className="text-xl font-black text-slate-900 leading-tight">{buyer.name}</h2>
            <p className="text-[11px] font-black text-emerald-600 uppercase tracking-widest mt-1">
              {getMonthLabel(selectedMonthDate)} ریکارڈ
            </p>
          </div>
        </div>
        <div className={`w-12 h-12 ${bgSoftClass} rounded-2xl flex items-center justify-center shadow-inner border border-white/50`}>
          {isSale ? <DollarSign className={colorClass} size={26} /> : <Wallet className={colorClass} size={26} />}
        </div>
      </header>
      {/* Tabs */}
      <div className="flex bg-slate-100/50 px-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`flex-1 py-4 font-black text-sm transition-all border-b-4 ${activeTab === 'LEDGER' ? 'border-emerald-600 text-slate-900' : 'border-transparent text-slate-400'}`}
        >
          دودھ کا ریکارڈ
        </button>
        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`flex-1 py-4 font-black text-sm transition-all border-b-4 ${activeTab === 'PAYMENTS' ? 'border-emerald-600 text-slate-900' : 'border-transparent text-slate-400'}`}
        >
          پیمنٹ ریکارڈ
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-44">
        {activeTab === 'LEDGER' ? (
          <>
            <div className="bg-white p-6 mx-5 mt-6 rounded-2xl border border-slate-100 shadow-sm mb-6">
              <div className="flex items-center justify-between">
                {isEditingRate && !isPastMonth ? (
                  <div className="flex items-center gap-4 w-full">
                    <input type="number" value={tempRate} onChange={(e) => setTempRate(e.target.value)} className="bg-slate-50 p-3 rounded-xl w-28 text-center font-black text-lg outline-none border-2 border-slate-200 focus:border-emerald-500" autoFocus />
                    <button onClick={() => { onUpdateBuyer({ ...buyer, pricePerLiter: parseFloat(tempRate) }); setIsEditingRate(false); }} className={`${btnClass} text-white p-3.5 rounded-xl shadow-lg active:scale-95`}><Save size={24} /></button>
                    <button onClick={() => setIsEditingRate(false)} className="bg-slate-100 text-slate-500 p-3.5 rounded-xl"><X size={24} /></button>
                  </div>
                ) : (
                  <>
                    <div className="text-right">
                      <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">قیمت فی لیٹر</p>
                      <p className={`text-2xl font-black ${colorClass}`}>{buyer.pricePerLiter} <span className="text-sm font-normal text-slate-400">روپے</span></p>
                    </div>
                    {!isPastMonth && (
                      <button onClick={() => setIsEditingRate(true)} className={`flex items-center gap-2 text-xs font-black bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl hover:bg-slate-200 transition-all shadow-sm`}><Edit2 size={16} /> ریٹ تبدیل</button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="px-5 pb-8">
              <table className="w-full text-right border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-slate-400">
                    <th className="p-2 font-black text-xs uppercase text-right">تاریخ</th>
                    <th className="p-2 text-center font-black text-xs uppercase">صبح</th>
                    <th className="p-2 text-center font-black text-xs uppercase">شام</th>
                    <th className={`p-2 text-center font-black text-xs uppercase`}>کل</th>
                  </tr>
                </thead>
                <tbody>
                  {daysInMonth.map(dateStr => {
                    const record = buyer.records.find(r => r.date === dateStr);
                    return (
                      <tr key={dateStr} className="group bg-white hover:bg-slate-50 transition-all shadow-sm">
                        <td className="p-4 rounded-r-2xl border-y border-r border-slate-50">
                          <div className="text-sm font-black text-slate-800">{formatUrduDate(dateStr)}</div>
                          {record && record.totalPrice > 0 && <div className={`text-[10px] font-black ${colorClass}`}>{record.totalPrice.toLocaleString()} PKR</div>}
                        </td>
                        <td className="p-2 border-y border-slate-50">
                          <input
                            type="number"
                            disabled={isPastMonth}
                            value={record?.morningQuantity || ''}
                            placeholder="0"
                            onChange={(e) => handleRecordUpdate(dateStr, 'morning', e.target.value)}
                            className={`w-16 p-3 text-center bg-slate-50 rounded-xl font-black text-lg text-slate-900 focus:bg-white focus:ring-4 ${ringClass}/10 outline-none border-2 border-transparent focus:border-emerald-500/20 transition-all disabled:opacity-50`}
                          />
                        </td>
                        <td className="p-2 border-y border-slate-50">
                          <input
                            type="number"
                            disabled={isPastMonth}
                            value={record?.eveningQuantity || ''}
                            placeholder="0"
                            onChange={(e) => handleRecordUpdate(dateStr, 'evening', e.target.value)}
                            className={`w-16 p-3 text-center bg-slate-50 rounded-xl font-black text-lg text-slate-900 focus:bg-white focus:ring-4 ${ringClass}/10 outline-none border-2 border-transparent focus:border-emerald-500/20 transition-all disabled:opacity-50`}
                          />
                        </td>
                        <td className={`p-4 text-center font-black text-2xl ${colorClass} rounded-l-2xl border-y border-l border-slate-50`}>
                          {record?.totalQuantity || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-6">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-black text-slate-900">پیمنٹ کا ریکارڈ</h3>
              {!isPastMonth && (
                <button
                  onClick={() => setIsAddingPayment(true)}
                  className={`${btnClass} text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl hover:brightness-110 active:scale-95 transition-all`}
                >
                  <Plus size={18} /> نئی انٹری
                </button>
              )}
            </div>

            <div className="space-y-4">
              {monthPayments.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
                  <History size={60} className="mx-auto text-slate-100 mb-6" />
                  <p className="text-slate-400 font-black text-xs uppercase tracking-widest">کوئی ریکارڈ موجود نہیں</p>
                </div>
              ) : (
                [...monthPayments].reverse().map(p => (
                  <div key={p.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-50 flex justify-between items-center group hover:shadow-xl transition-all">
                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl ${bgSoftClass} ${colorClass} flex items-center justify-center shadow-inner`}>
                        <DollarSign size={28} />
                      </div>
                      <div className="text-right">
                        <p className="font-black text-2xl text-slate-900 tracking-tight">{p.amount.toLocaleString()} <span className="text-xs font-normal text-slate-400">روپے</span></p>
                        <p className="text--[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider">{p.date}</p>
                        {p.description && (
                          <p className="mt-2 text-slate-600 bg-slate-50 px-4 py-2 rounded-xl text-xs font-bold inline-block border border-slate-100">
                            {p.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {!isPastMonth && (
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditPayment(p)} className="p-2.5 text-slate-300 hover:text-slate-900 transition-all"><Edit2 size={20} /></button>
                        <button onClick={() => handleDeletePayment(p.id)} className="p-2.5 text-rose-300 hover:text-rose-600 transition-all"><Trash2 size={20} /></button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 p-6 flex items-center justify-between shadow-[0_-10px_35px_rgba(0,0,0,0.06)] z-40">
        <div className="flex gap-4">
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="flex flex-col items-center group disabled:opacity-50"
            title="مکمل لیجر ڈاؤن لوڈ کریں"
          >
            <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-xl shadow-slate-100 group-active:scale-90 transition-transform">
              {isGeneratingPDF ? <Loader2 className="animate-spin" size={24} /> : <FileText size={24} />}
            </div>
            <span className="text-[9px] font-black mt-2 uppercase tracking-widest text-slate-400">Ledger</span>
          </button>

          <button
            onClick={handleDownloadPaymentPDF}
            disabled={isGeneratingPaymentPDF}
            className="flex flex-col items-center group disabled:opacity-50"
            title="صرف پیمنٹ رپورٹ ڈاؤن لوڈ کریں"
          >
            <div className="p-4 rounded-2xl bg-emerald-600 text-white shadow-xl shadow-emerald-50 group-active:scale-90 transition-transform">
              {isGeneratingPaymentPDF ? <Loader2 className="animate-spin" size={24} /> : <ReceiptText size={24} />}
            </div>
            <span className="text-[9px] font-black mt-2 uppercase tracking-widest text-emerald-500">Payments</span>
          </button>
        </div>

        <div className="text-right flex items-center gap-8">
          <div className="text-center">
            <span className="text-xl font-black text-slate-900 tracking-tight">{monthPaid.toLocaleString()}</span>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">کل ادا شدہ</p>
          </div>
          <div className="w-px h-12 bg-slate-100"></div>
          <div className="text-center">
            <span className={`text-3xl font-black tracking-tighter ${monthBalance > 0 ? (isSale ? 'text-emerald-600' : 'text-rose-600') : (monthBalance < 0 ? 'text-blue-600' : 'text-slate-300')}`}>
              {Math.abs(monthBalance).toLocaleString()}
            </span>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {monthBalance > 0 ? 'باقی رقم' : (monthBalance < 0 ? 'ایڈوانس' : 'حساب برابر')}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Entry Modal */}
      {isAddingPayment && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-lg z-50 flex items-center justify-center p-8 fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl relative border-t-8 border-slate-900">
            <h3 className="text-xl font-black text-slate-900 mb-8 text-center tracking-tight">
              {editingPaymentId ? 'پیمنٹ کی تبدیلی' : 'رقم کی انٹری'}
            </h3>

            <div className="space-y-6">
              <div>
                <p className="text-right text-[11px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2">رقم (روپے)</p>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full p-6 bg-slate-50 text-slate-900 rounded-2xl text-right text-4xl font-black outline-none border-2 border-slate-100 focus:bg-white focus:border-emerald-500 transition-all shadow-inner"
                  placeholder="0"
                  autoFocus
                />
              </div>

              <div>
                <p className="text-right text-[11px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2">تفصیل (نوٹ)</p>
                <textarea
                  value={paymentDescription}
                  onChange={(e) => setPaymentDescription(e.target.value)}
                  className="w-full p-4 bg-slate-50 text-slate-900 rounded-xl text-right text-sm font-bold outline-none border-2 border-slate-100 focus:bg-white focus:border-emerald-500 h-24 resize-none transition-all"
                  placeholder="کوئی نوٹ لکھیں..."
                />
              </div>
            </div>

            <div className="flex gap-4 mt-10">
              <button onClick={handleSavePayment} className={`flex-1 ${btnClass} text-white py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all`}>
                محفوظ کریں
              </button>
              <button onClick={resetPaymentForm} className="bg-slate-100 text-slate-600 px-6 py-5 rounded-2xl font-black text-base active:scale-95 transition-all">
                کینسل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerProfile;
