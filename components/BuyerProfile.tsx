
import React, { useState, useMemo, useEffect } from 'react';
import { Contact, MilkRecord, ModuleType, Payment } from '../types';
import { formatUrduDate, getMonthLabel, getEnglishMonthLabel } from '../utils';
import { ChevronRight, Save, Edit2, X, Download, Milk, Loader2, DollarSign, Wallet, ArrowLeft, History, Plus, Trash2, FileText, ReceiptText, Lock, Camera, Image as ImageIcon, Images } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import html2canvas from 'html2canvas';
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

  // State for Daily Rate Editing
  const [editingDailyRateDate, setEditingDailyRateDate] = useState<string | null>(null);
  const [tempDailyRate, setTempDailyRate] = useState('');

  // Debounce Refs
  const saveTimeoutsRef = React.useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  // Payment UI state
  const [isAddingPayment, setIsAddingPayment] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [activeTab, setActiveTab] = useState<'LEDGER' | 'PAYMENTS'>('LEDGER');
  const [uploadingDate, setUploadingDate] = useState<string | null>(null);
  const [viewingImages, setViewingImages] = useState<{ date: string, urls: string[] } | null>(null);

  // Hidden File Input Ref
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isSale = moduleType === 'SALE';
  const colorClass = isSale ? 'text-emerald-600' : 'text-rose-600';
  const bgSoftClass = isSale ? 'bg-emerald-50' : 'bg-rose-50';
  const ringClass = isSale ? 'ring-emerald-500' : 'ring-rose-500';
  const btnClass = isSale ? 'bg-emerald-600' : 'bg-rose-600';

  const currentMonthPrefix = useMemo(() => {
    return `${selectedMonthDate.getFullYear()}-${String(selectedMonthDate.getMonth() + 1).padStart(2, '0')}`;
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
    let val = parseFloat(value) || 0;
    const updatedRecords = [...buyer.records];
    const index = updatedRecords.findIndex(r => r.date === dateStr);

    let newRecord: MilkRecord;

    // Standard Logic instead of Hook: Find a record in this month that has a rate, otherwise use global rate
    const monthRec = buyer.records.find(r => r.date.startsWith(currentMonthPrefix) && r.pricePerLiter);
    const effectiveRate = monthRec?.pricePerLiter || buyer.pricePerLiter;

    if (index >= 0) {
      const rec = updatedRecords[index];
      const m = field === 'morning' ? val : rec.morningQuantity;
      const e = field === 'evening' ? val : rec.eveningQuantity;

      newRecord = {
        ...rec,
        morningQuantity: m,
        eveningQuantity: e,
        totalQuantity: m + e,
        totalPrice: Math.round((m + e) * effectiveRate),
        pricePerLiter: effectiveRate
      };
      updatedRecords[index] = newRecord;
    } else {
      const m = field === 'morning' ? val : 0;
      const e = field === 'evening' ? val : 0;
      newRecord = {
        id: uuidv4(),
        date: dateStr,
        morningQuantity: m,
        eveningQuantity: e,
        totalQuantity: m + e,
        totalPrice: Math.round((m + e) * effectiveRate),
        pricePerLiter: effectiveRate,
        timestamp: Date.now(),
        images: []
      };
      updatedRecords.push(newRecord);
    }

    onUpdateBuyer({ ...buyer, records: updatedRecords });

    // API Call (Debounced)
    if (saveTimeoutsRef.current[dateStr]) {
      clearTimeout(saveTimeoutsRef.current[dateStr]);
    }

    saveTimeoutsRef.current[dateStr] = setTimeout(async () => {
      try {
        await api.addRecord(buyer.id, newRecord);
      } catch (e) {
        console.error("Failed to save record", e);
      } finally {
        delete saveTimeoutsRef.current[dateStr];
      }
    }, 1000);
  };

  const handleDeleteImage = async (dateStr: string, imageUrl: string) => {
    if (!window.confirm("کیا آپ واقعی یہ تصویر حذف کرنا چاہتے ہیں؟")) return;

    const updatedRecords = [...buyer.records];
    const index = updatedRecords.findIndex(r => r.date === dateStr);

    if (index >= 0) {
      const record = updatedRecords[index];
      // Filter out the deleted image
      const newImages = (record.images || []).filter(img => img !== imageUrl);

      // Update logic
      const updatedRecord = {
        ...record,
        images: newImages,
        imageUrl: newImages.length > 0 ? newImages[0] : null // Sync backward compat
      };
      updatedRecords[index] = updatedRecord;

      onUpdateBuyer({ ...buyer, records: updatedRecords });

      // Sync Viewing State if Open
      if (viewingImages && viewingImages.date === dateStr) {
        setViewingImages({ ...viewingImages, urls: newImages });
      }

      try {
        await api.addRecord(buyer.id, updatedRecord);
      } catch (e) {
        console.error("Failed to delete image", e);
        alert("تصویر حذف نہیں ہو سکی۔");
      }
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingDate) return;

    try {
      const url = await api.uploadImage(file);

      // Update Record
      const updatedRecords = [...buyer.records];
      const index = updatedRecords.findIndex(r => r.date === uploadingDate);

      if (index >= 0) {
        const currentImages = updatedRecords[index].images || (updatedRecords[index].imageUrl ? [updatedRecords[index].imageUrl!] : []);
        const newImages = [...currentImages, url];

        updatedRecords[index] = {
          ...updatedRecords[index],
          images: newImages,
          imageUrl: newImages[0] // Sync backward compat
        };

        onUpdateBuyer({ ...buyer, records: updatedRecords });

        // Update Viewing State if open
        if (viewingImages && viewingImages.date === uploadingDate) {
          setViewingImages({ ...viewingImages, urls: newImages });
        }

        // Save to DB
        await api.addRecord(buyer.id, updatedRecords[index]);
      } else {
        const newRecord: MilkRecord = {
          id: uuidv4(),
          date: uploadingDate,
          morningQuantity: 0,
          eveningQuantity: 0,
          totalQuantity: 0,
          totalPrice: 0,
          timestamp: Date.now(),
          images: [url],
          imageUrl: url, // Sync backward compat
          pricePerLiter: buyer.pricePerLiter
        };
        updatedRecords.push(newRecord);
        onUpdateBuyer({ ...buyer, records: updatedRecords });
        await api.addRecord(buyer.id, newRecord);
      }
    } catch (err) {
      console.error(err);
      alert("تصویر اپ لوڈ نہیں ہو سکی۔");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerUpload = (dateStr: string) => {
    setUploadingDate(dateStr);
    fileInputRef.current?.click();
  };

  const openGallery = (dateStr: string) => {
    const record = buyer.records.find(r => r.date === dateStr);
    const images = record?.images || (record?.imageUrl ? [record.imageUrl] : []);
    setViewingImages({ date: dateStr, urls: images });
  };

  const handleCameraClick = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const record = buyer.records.find(r => r.date === dateStr);
    const hasImages = (record?.images?.length || 0) > 0 || !!record?.imageUrl;

    if (hasImages) {
      openGallery(dateStr);
    } else {
      triggerUpload(dateStr);
    }
  };

  const handleSavePayment = async () => {
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
        date: paymentDate || new Date().toISOString().split('T')[0], // Use selected date
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
    setPaymentDate('');
    setEditingPaymentId(null);
    setIsAddingPayment(false);
  };

  const handleAddPayment = () => {
    // Default Date Logic
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const selectedYear = selectedMonthDate.getFullYear();
    const selectedMonth = selectedMonthDate.getMonth();

    if (selectedYear === currentYear && selectedMonth === currentMonth) {
      setPaymentDate(today.toISOString().split('T')[0]);
    } else {
      // Default to 1st of selected month if viewing past/future
      setPaymentDate(`${currentMonthPrefix}-01`);
    }
    setIsAddingPayment(true);
  };

  const handleEditPayment = (payment: Payment) => {
    setEditingPaymentId(payment.id);
    setPaymentAmount(payment.amount.toString());
    setPaymentDescription(payment.description || '');
    setPaymentDate(payment.date);
    setIsAddingPayment(true);
  };

  const handleDeletePayment = async (id: string) => {
    if (!window.confirm('کیا آپ یہ پیمنٹ ڈیلیٹ کرنا چاہتے ہیں؟')) return;

    const updatedPayments = (buyer.payments || []).filter(p => p.id !== id);
    onUpdateBuyer({ ...buyer, payments: updatedPayments });

    try {
      await api.deletePayment(id);
    } catch (e) {
      alert("حذف نہیں ہو سکا۔");
    }
  };

  const { monthRecords, monthPayments, previousBalance, monthMilk, monthBill, monthPaid } = useMemo(() => {
    const records = buyer.records || [];
    const payments = buyer.payments || [];
    const firstDayOfMonth = `${currentMonthPrefix}-01`;

    const mRecords: MilkRecord[] = [];
    const mPayments: Payment[] = [];
    let prevBal = buyer.openingBalance || 0;
    let mMilk = 0;
    let mBill = 0;
    let mPaid = 0;

    for (const r of records) {
      if (r.date.startsWith(currentMonthPrefix)) {
        mRecords.push(r);
        mMilk += r.totalQuantity;
        mBill += r.totalPrice;
      } else if (r.date < firstDayOfMonth) {
        prevBal += r.totalPrice;
      }
    }

    for (const p of payments) {
      if (p.date.startsWith(currentMonthPrefix)) {
        mPayments.push(p);
        mPaid += p.amount;
      } else if (p.date < firstDayOfMonth) {
        prevBal -= p.amount;
      }
    }

    return {
      monthRecords: mRecords,
      monthPayments: mPayments,
      previousBalance: prevBal,
      monthMilk: mMilk,
      monthBill: mBill,
      monthPaid: mPaid
    };
  }, [buyer.records, buyer.payments, currentMonthPrefix, buyer.openingBalance]);

  const totalBalance = previousBalance + monthBill - monthPaid;

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // 1. Setup PDF
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);

      // 2. Prepare Data
      const engMonth = getEnglishMonthLabel(selectedMonthDate);

      // Filter & Sort Records
      const recordsToPrint = buyer.records
        .filter(r => r.date.startsWith(currentMonthPrefix) && r.totalQuantity > 0)
        .sort((a, b) => a.date.localeCompare(b.date));

      // Filter & Sort Payments
      const paymentsToPrint = (buyer.payments || [])
        .filter(p => p.date.startsWith(currentMonthPrefix))
        .sort((a, b) => a.date.localeCompare(b.date));

      // 3. Helper: Render & Capture Single Page
      const renderPage = async (pageContentHTML: string, pageNumber: number, totalPages: number) => {
        // Create container
        const container = document.createElement('div');
        container.className = "fixed inset-0 bg-white z-[9999] p-8 font-sans flex flex-col justify-between";
        container.style.width = "210mm";
        container.style.height = "297mm"; // Fixed A4 Height
        container.style.position = 'absolute';
        container.style.left = '-10000px';
        container.style.direction = 'rtl';
        document.body.appendChild(container);

        // Header HTML
        const headerHTML = `
          <div class="text-center mb-4 border-b-2 border-gray-100 pb-2">
            <h1 class="text-2xl font-black text-gray-900 mb-1">رندھاوا ڈیری اینڈ کیٹل فارم</h1>
            <p class="text-gray-500 font-bold text-sm">پروپرائیٹر: چوہدری یوسف رندھاوا</p>
          </div>
          <div class="flex justify-between items-end mb-4 bg-gray-50 p-4 rounded-xl">
             <div class="text-right">
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">نام</p>
              <h2 class="text-xl font-black text-${isSale ? 'emerald' : 'rose'}-600">${buyer.name}</h2>
              <p class="text-xs text-gray-500 mt-1 font-bold">ریٹ: ${buyer.pricePerLiter} روپے</p>
            </div>
            <div class="text-left">
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">RECORD TYPE</p>
              <p class="font-bold text-gray-800 text-sm">MILK LEDGER</p>
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-2 mb-1">MONTH</p>
              <p class="font-bold text-gray-800 text-sm">${engMonth}</p>
            </div>
          </div>
        `;

        // Footer HTML
        const footerHTML = `
          <div class="mt-auto pt-4 border-t border-gray-200 text-center flex justify-between items-center text-[10px] text-gray-400">
             <span>Page ${pageNumber} of ${totalPages}</span>
             <span>Generated on ${new Date().toLocaleDateString()}</span>
          </div>
        `;

        // Inner Content Wrapper (Flex grow to fill space)
        container.innerHTML = `
          ${pageNumber === 1 ? headerHTML : '<div class="h-8"></div>'}
          <div class="flex-grow flex flex-col">
            ${pageContentHTML}
          </div>
          ${footerHTML}
        `;

        // Wait for render
        await new Promise(resolve => setTimeout(resolve, 50));

        // Capture
        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        // Cleanup
        document.body.removeChild(container);

        // Add to PDF
        const imgData = canvas.toDataURL('image/jpeg', 0.90);
        if (pageNumber > 1) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      };


      // 4. Batching Logic
      // We will estimate rows per page.
      // A4 Height ~297mm. Header/Footer/Margins take ~100mm. Available ~190mm.
      // Each row is approx 10-12mm. So ~15-18 rows per page safely.
      // Let's go with 16 rows per page to be safe.

      const ITEMS_PER_PAGE = 18;

      // Combine Data for Pagination (Just to count total pages effectively)
      // Actually, we have two tables. We should print Table 1, then Table 2.
      // If Table 1 ends mid-page, start Table 2 immediately.
      // This is complex to batch perfectly with fixed HTML templates.
      // simpler approach: Just treat everything as a list of "Items" to render.

      // Let's build a print queue.
      // Type: 'MilkRow' | 'PaymentRow' | 'Summary'

      let printQueue: any[] = [];

      // Add Previous Balance Row (Manual Opening Balance)
      if (previousBalance !== 0) {
        printQueue.push({ type: 'PREV_BAL', balance: previousBalance });
      }

      // Add Milk Rows
      recordsToPrint.forEach(r => printQueue.push({ type: 'MILK', data: r }));

      // Add Payment Rows (With Header if needed)
      if (paymentsToPrint.length > 0) {
        printQueue.push({ type: 'PAYMENT_HEADER' });
        paymentsToPrint.forEach(p => printQueue.push({ type: 'PAYMENT', data: p }));
      } else {
        printQueue.push({ type: 'PAYMENT_HEADER' });
        printQueue.push({ type: 'PAYMENT_EMPTY' });
      }

      // Add Summary (Takes up ~5 rows worth of space)
      printQueue.push({ type: 'SUMMARY' });

      // Calculate Batches
      const batches = [];
      let currentBatch = [];
      let currentCount = 0;

      for (const item of printQueue) {
        const itemWeight = item.type === 'SUMMARY' ? 5 : (item.type === 'PAYMENT_HEADER' ? 2 : 1);

        // Logic: If adding this item exceeds page limit, start new page.
        // EXCEPTION: If item is SUMMARY, always squeeze it onto the current page to avoid "lone summary" page.
        // This ensures the summary is always attached to the last list of items.

        if (item.type !== 'SUMMARY' && currentCount + itemWeight > ITEMS_PER_PAGE) {
          batches.push(currentBatch);
          currentBatch = [];
          currentCount = 0;
        }

        currentBatch.push(item);
        currentCount += itemWeight;
      }
      if (currentBatch.length > 0) batches.push(currentBatch);


      // 5. Render Batches
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Build HTML for Batch
        let batchHTML = '';

        // Tracking open tables to close them effectively is tricky if we mix types.
        // We'll use simple tables for each section or a master table structure.
        // To keep alignment, let's use a unified table structure if possible, OR separate tables.

        // We will render items. If we switch types, we might need to close/open tables.
        // Simplified: Using a flex/grid layout for rows might be easier than table tags for mixed content across pages?
        // No, tables are best for alignment.
        // Let's try to wrap the whole batch in a table, but 'PAYMENT_HEADER' breaks it.
        // Okay, we will build HTML strings dynamically.

        let inMilkTable = false;
        let inPaymentTable = false;

        const startMilkTable = () => `
          <h3 class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2 mt-2">دودھ کا لیدہ (Milk Ledger)</h3>
          <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-4 text-sm">
            <thead class="bg-${isSale ? 'emerald' : 'rose'}-600 text-white">
              <tr>
                <th class="p-2 font-bold w-24 border-r border-white/20">تاریخ</th>
                <th class="p-2 font-bold text-center">صبح</th>
                <th class="p-2 font-bold text-center">شام</th>
                <th class="p-2 font-bold text-center bg-black/10">کل</th>
                <th class="p-2 font-bold text-left">بل (روپے)</th>
              </tr>
            </thead>
            <tbody>
        `;

        const startPaymentTable = () => `
           <h3 class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2 mt-4">وصولی / ادائیگی (Payments)</h3>
            <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-4 text-sm">
              <thead class="bg-gray-800 text-white">
                <tr>
                  <th class="p-2 font-bold w-24 border-r border-white/20">تاریخ</th>
                  <th class="p-2 font-bold text-center">تفصیل</th>
                  <th class="p-2 font-bold text-left">رقم</th>
                </tr>
              </thead>
              <tbody>
        `;

        const closeTable = () => `</tbody></table>`;

        // Check first item to determine state
        if (batch[0].type === 'MILK' || batch[0].type === 'PREV_BAL') {
          batchHTML += startMilkTable();
          inMilkTable = true;
        } else if (batch[0].type === 'PAYMENT') { // Should ideally be preceded by HEADER
          batchHTML += startPaymentTable();
          inPaymentTable = true;
        }

        for (const item of batch) {
          if (item.type === 'PREV_BAL') {
            batchHTML += `
                    <tr class="bg-gray-50 border-b border-gray-100">
                      <td class="p-2 font-bold text-gray-500">سابقہ بیلنس</td>
                      <td class="p-2 text-center text-gray-400">-</td>
                      <td class="p-2 text-center text-gray-400">-</td>
                      <td class="p-2 text-center text-gray-400">-</td>
                      <td class="p-2 text-left font-mono font-bold text-gray-700">${item.balance.toLocaleString()}</td>
                    </tr>
                `;
          }
          if (item.type === 'MILK') {
            if (!inMilkTable) {
              if (inPaymentTable) { batchHTML += closeTable(); inPaymentTable = false; }
              batchHTML += startMilkTable(); inMilkTable = true;
            }
            const r = item.data;
            batchHTML += `
                    <tr class="border-b border-gray-100">
                      <td class="p-2 border-r border-gray-200 whitespace-nowrap">${formatUrduDate(r.date)}</td>
                      <td class="p-2 text-center text-gray-600">${r.morningQuantity || '-'}</td>
                      <td class="p-2 text-center text-gray-600">${r.eveningQuantity || '-'}</td>
                      <td class="p-2 text-center font-bold text-gray-900 bg-gray-50">${r.totalQuantity}</td>
                      <td class="p-2 text-left font-mono text-gray-700">${r.totalPrice.toLocaleString()}</td>
                    </tr>
                 `;
          }
          if (item.type === 'PAYMENT_HEADER') {
            if (inMilkTable) { batchHTML += closeTable(); inMilkTable = false; }
            if (!inPaymentTable) { batchHTML += startPaymentTable(); inPaymentTable = true; }
          }
          if (item.type === 'PAYMENT') {
            if (!inPaymentTable) {
              if (inMilkTable) { batchHTML += closeTable(); inMilkTable = false; }
              batchHTML += startPaymentTable(); inPaymentTable = true;
            }
            const p = item.data;
            batchHTML += `
                  <tr class="border-b border-gray-100">
                    <td class="p-2 border-r border-gray-200 whitespace-nowrap">${formatUrduDate(p.date)}</td>
                    <td class="p-2 text-center text-gray-600">${p.description || '-'}</td>
                    <td class="p-2 text-left font-mono font-bold text-green-600">${p.amount.toLocaleString()}</td>
                  </tr>
                 `;
          }
          if (item.type === 'PAYMENT_EMPTY') {
            batchHTML += `<tr><td colspan="3" class="p-4 text-center text-gray-400 text-xs">اس ماہ کوئی وصولی نہیں ہوئی</td></tr>`;
          }
          if (item.type === 'SUMMARY') {
            if (inMilkTable) { batchHTML += closeTable(); inMilkTable = false; }
            if (inPaymentTable) { batchHTML += closeTable(); inPaymentTable = false; }

            // Colorful Summary Box
            const bgClass = isSale ? 'bg-emerald-50' : 'bg-rose-50';
            const borderClass = isSale ? 'border-emerald-200' : 'border-rose-200';
            const textClass = isSale ? 'text-emerald-800' : 'text-rose-800';

            batchHTML += `
                   <div class="flex justify-end mt-6">
                    <div class="w-64 ${bgClass} p-4 rounded-xl border-2 ${borderClass} text-sm shadow-sm break-inside-avoid">
                       <div class="flex justify-between mb-2 pb-2 border-b ${isSale ? 'border-emerald-200/50' : 'border-rose-200/50'}">
                        <span class="${isSale ? 'text-emerald-600' : 'text-rose-600'} font-bold">سابقہ بیلنس</span>
                        <span class="font-bold ${textClass}">${previousBalance.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between mb-1">
                        <span class="${isSale ? 'text-emerald-600' : 'text-rose-600'} font-bold">کل دودھ</span>
                        <span class="font-black ${textClass}">${monthMilk} لیٹر</span>
                      </div>
                      <div class="flex justify-between mb-1">
                        <span class="${isSale ? 'text-emerald-600' : 'text-rose-600'} font-bold">کل بل</span>
                        <span class="font-black ${textClass}">${monthBill.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between mb-1">
                        <span class="${isSale ? 'text-emerald-600' : 'text-rose-600'} font-bold">وصولی</span>
                        <span class="font-bold text-green-600">${monthPaid.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between text-base pt-2 border-t ${isSale ? 'border-emerald-200' : 'border-rose-200'} mt-2">
                        <span class="font-black ${textClass}">بقایا جات</span>
                        <span class="font-black text-${totalBalance > 0 ? (isSale ? 'emerald' : 'rose') : 'blue'}-700 text-lg">${totalBalance.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                 `;
          }
        }

        if (inMilkTable) batchHTML += closeTable();
        if (inPaymentTable) batchHTML += closeTable();

        // Render Page
        await renderPage(batchHTML, i + 1, batches.length);
      }


      // 6. Handle Images (Separate Pages as before, or appended?)
      const recordsWithImages = buyer.records
        .filter(r => r.imageUrl && r.date.startsWith(currentMonthPrefix))
        .sort((a, b) => a.date.localeCompare(b.date));

      if (recordsWithImages.length > 0) {
        // Just use standard logic to add pages for images
        // We can reuse the same renderPage logic if we wrap images in HTML
        // OR just plain jsPDF addImage for full control.
        // Let's use plain jsPDF for images to keep them max quality.

        // Add a "Receipts Divider" page? Or just start adding them.
        pdf.addPage();
        pdf.setFontSize(20);
        pdf.setTextColor(40);
        pdf.text("Attached Receipts", 105, 20, { align: 'center' });

        let yOffset = 30;

        for (const record of recordsWithImages) {
          if (!record.imageUrl) continue;

          try {
            const imgBlob = await fetch(record.imageUrl).then(res => res.blob());
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(imgBlob);
            });

            const imgProps = pdf.getImageProperties(base64);
            const availableWidth = 170;
            const availableHeight = 120; // 2 per page approx

            const widthRatio = availableWidth / imgProps.width;
            const heightRatio = availableHeight / imgProps.height;
            const scale = Math.min(widthRatio, heightRatio, 1);

            const finalWidth = imgProps.width * scale;
            const finalHeight = imgProps.height * scale;

            if (yOffset + finalHeight > 280) {
              pdf.addPage();
              yOffset = 20;
            }

            pdf.setFontSize(10);
            pdf.text(`Date: ${record.date}`, 20, yOffset - 2);
            pdf.addImage(base64, 'JPEG', 20, yOffset, finalWidth, finalHeight);
            yOffset += finalHeight + 20;

          } catch (e) {
            console.error("Img fail", e);
          }
        }
      }

      // 7. Save
      const filename = `Milk_Ledger_${buyer.name.replace(/\s+/g, '_')}_${engMonth.replace(/\s+/g, '_')}.pdf`;
      pdf.save(filename);

    } catch (e) {
      console.error(e);
      alert("PDF نہیں بن سکی۔");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleDownloadPaymentPDF = async () => {
    setIsGeneratingPaymentPDF(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');

      const engMonth = getEnglishMonthLabel(selectedMonthDate);

      // Helper to Render Page
      const renderPage = async (pageContentHTML: string, pageNumber: number, totalPages: number) => {
        const container = document.createElement('div');
        container.className = "fixed inset-0 bg-white z-[9999] p-8 font-sans flex flex-col justify-between";
        container.style.width = "210mm";
        container.style.height = "297mm";
        container.style.position = 'absolute';
        container.style.left = '-10000px';
        container.style.direction = 'rtl';
        document.body.appendChild(container);

        const headerHTML = `
          <div class="text-center mb-6 border-b-2 border-gray-100 pb-4">
            <h1 class="text-3xl font-black text-gray-900 mb-2">رندھاوا ڈیری اینڈ کیٹل فارم</h1>
            <p class="text-gray-500 font-bold text-lg">پروپرائیٹر: چوہدری یوسف رندھاوا</p>
          </div>
          <div class="flex justify-between items-end mb-8 bg-gray-50 p-6 rounded-2xl">
            <div class="text-left">
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">RECORD TYPE</p>
              <p class="font-bold text-gray-800">PAYMENT HISTORY</p>
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-4 mb-1">MONTH</p>
              <p class="font-bold text-gray-800">${engMonth}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">نام</p>
              <h2 class="text-2xl font-black text-${isSale ? 'emerald' : 'rose'}-600">${buyer.name}</h2>
            </div>
          </div>
        `;

        const footerHTML = `
           <div class="mt-8 text-center bg-gray-900 text-white p-4 rounded-xl">
            <p class="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">کل ادا شدہ رقم (Total Paid)</p>
            <p class="text-2xl font-black">${monthPaid.toLocaleString()} PKR</p>
          </div>
          <div class="mt-auto pt-4 border-t border-gray-200 text-center flex justify-between items-center text-[10px] text-gray-400">
             <span>Page ${pageNumber} of ${totalPages}</span>
             <span>Generated on ${new Date().toLocaleDateString()}</span>
          </div>
        `;

        container.innerHTML = `
          ${pageNumber === 1 ? headerHTML : '<div class="h-8"></div>'}
          <div class="flex-grow flex flex-col">
             <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-8">
                <thead class="bg-gray-800 text-white">
                  <tr>
                    <th class="p-4 font-bold text-sm border-r border-white/20">تاریخ</th>
                    <th class="p-4 font-bold text-sm text-center">رقم (روپے)</th>
                    <th class="p-4 font-bold text-sm text-right">تفصیل / نوٹ</th>
                  </tr>
                </thead>
                <tbody>
                  ${pageContentHTML}
                </tbody>
             </table>
          </div>
          ${footerHTML}
        `;

        await new Promise(resolve => setTimeout(resolve, 50));

        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        document.body.removeChild(container);

        const imgData = canvas.toDataURL('image/jpeg', 0.90);
        if (pageNumber > 1) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      };

      // Batching
      const ITEMS_PER_PAGE = 15;
      const batches = [];
      for (let i = 0; i < monthPayments.length; i += ITEMS_PER_PAGE) {
        batches.push(monthPayments.slice(i, i + ITEMS_PER_PAGE));
      }

      if (batches.length === 0) {
        // Handle Empty Case
        await renderPage(
          '<tr><td colspan="3" class="p-8 text-center text-gray-400">کوئی پیمنٹ ریکارڈ نہیں</td></tr>',
          1,
          1
        );
      } else {
        for (let i = 0; i < batches.length; i++) {
          const batch = batches[i];
          const rowsHTML = batch.map(p => `
            <tr class="border-b border-gray-100">
              <td class="p-3 text-right border-r border-gray-200">${formatUrduDate(p.date)}</td>
              <td class="p-3 text-center font-mono font-bold text-gray-900">${p.amount.toLocaleString()}</td>
              <td class="p-3 text-right text-gray-600 text-sm">${p.description || '-'}</td>
            </tr>
          `).join('');

          await renderPage(rowsHTML, i + 1, batches.length);
        }
      }

      const filename = `Payment_Report_${buyer.name.replace(/\s+/g, '_')}_${engMonth.replace(/\s+/g, '_')}.pdf`;
      pdf.save(filename);

    } catch (e) {
      console.error(e);
      alert("پیمنٹ رپورٹ نہیں بن سکی۔");
    } finally {
      setIsGeneratingPaymentPDF(false);
    }
  };


  const handleSaveRate = async () => {
    const newRate = parseFloat(tempRate);
    if (isNaN(newRate) || newRate < 0) return;

    const today = new Date();
    const todayPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const isLatestMonth = currentMonthPrefix >= todayPrefix;

    console.log(`[RateUpdate] New Rate: ${newRate}, Month: ${currentMonthPrefix}, IsLatest: ${isLatestMonth}`);

    // Update records ONLY for the selected month
    const updatedRecords = buyer.records.map(r => {
      if (r.date.startsWith(currentMonthPrefix)) {
        const newPrice = Math.round(r.totalQuantity * newRate);
        return {
          ...r,
          pricePerLiter: newRate,
          totalPrice: newPrice
        };
      }
      return r;
    });

    // Update Local State
    const updatedBuyer = {
      ...buyer,
      records: updatedRecords
    };

    // If it's the current/future month, update the global rate too
    if (isLatestMonth) {
      updatedBuyer.pricePerLiter = newRate;
    }

    onUpdateBuyer(updatedBuyer);
    setIsEditingRate(false);

    try {
      if (isLatestMonth) {
        await api.updateContact({ ...buyer, pricePerLiter: newRate });
      }

      // Update relevant records in DB
      const recordsToSave = updatedRecords.filter(r => r.date.startsWith(currentMonthPrefix) && r.totalQuantity > 0);
      const promises = recordsToSave.map(rec => api.addRecord(buyer.id, rec));
      await Promise.all(promises);
    } catch (e) {
      console.error("Failed to update rate", e);
      alert("ریٹ اپ ڈیٹ نہیں ہو سکا۔");
    }
  };

  const handleSaveDailyRate = async () => {
    if (!editingDailyRateDate) return;
    const newRate = parseFloat(tempDailyRate);
    if (isNaN(newRate) || newRate < 0) return;

    // Update only the specific record
    const updatedRecords = buyer.records.map(r => {
      if (r.date === editingDailyRateDate) {
        const newPrice = Math.round(r.totalQuantity * newRate);
        return {
          ...r,
          pricePerLiter: newRate,
          totalPrice: newPrice
        };
      }
      return r;
    });

    onUpdateBuyer({
      ...buyer,
      records: updatedRecords
    });

    setEditingDailyRateDate(null);

    // Persist to DB
    const rec = updatedRecords.find(r => r.date === editingDailyRateDate);
    if (rec) {
      try {
        await api.addRecord(buyer.id, rec);
      } catch (e) {
        console.error("Failed to update daily rate", e);
        alert("ڈیلی ریٹ محفوظ نہیں ہو سکا۔");
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 fade-in flex flex-col">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageUpload}
        className="hidden"
        accept="image/*"
      />
      {/* ... Header ... */}
      <header className="bg-white border-b border-slate-100 px-6 py-5 flex items-center justify-between sticky top-0 z-40 backdrop-blur-md shadow-sm">
        {/* ... (Header content skipped for brevity, matching existing) ... */}
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
        <div className="flex items-center gap-2">
          <button
            onClick={handleCameraClick}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 active:scale-95 transition-all ${isSale ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}
          >
            <Camera size={24} />
          </button>
          <div className={`w-12 h-12 ${bgSoftClass} rounded-2xl flex items-center justify-center shadow-inner border border-white/50`}>
            {isSale ? <DollarSign className={colorClass} size={26} /> : <Wallet className={colorClass} size={26} />}
          </div>
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
                {isEditingRate ? (
                  <div className="flex items-center gap-4 w-full">
                    <input type="number" value={tempRate} onChange={(e) => setTempRate(e.target.value)} className="bg-slate-50 p-3 rounded-xl w-28 text-center font-black text-lg outline-none border-2 border-slate-200 focus:border-emerald-500" autoFocus />
                    <button onClick={handleSaveRate} className={`${btnClass} text-white p-3.5 rounded-xl shadow-lg active:scale-95 transition-all`}><Save size={24} /></button>
                    <button onClick={() => setIsEditingRate(false)} className="bg-slate-100 text-slate-500 p-3.5 rounded-xl hover:bg-slate-200 transition-all"><X size={24} /></button>
                  </div>
                ) : (
                  <>
                    <div className="text-right">
                      <p className="text-slate-400 text-xs font-black uppercase tracking-widest mb-1">قیمت فی لیٹر</p>
                      <p className={`text-2xl font-black ${colorClass}`}>{buyer.pricePerLiter} <span className="text-sm font-normal text-slate-400">روپے</span></p>
                    </div>
                    <button onClick={() => setIsEditingRate(true)} className={`flex items-center gap-2 text-xs font-black bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl hover:bg-slate-200 transition-all shadow-sm`}><Edit2 size={16} /> ریٹ تبدیل</button>
                  </>
                )}
              </div>

              {/* Previous Balance Banner */}
              {/* Previous Balance Banner - Manual Opening Balance */}
              {!isEditingRate && previousBalance !== 0 && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full ${previousBalance > 0 ? (isSale ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700') : 'bg-slate-100 text-slate-500'}`}>
                    {previousBalance > 0 ? 'سابقہ وصولی (Receivable)' : 'سابقہ واجب الادا (Payable)'}
                  </span>
                  <div className="text-right">
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-0.5">سابقہ بیلنس</p>
                    <p className={`text-xl font-black ${previousBalance > 0 ? (isSale ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>
                      {Math.abs(previousBalance).toLocaleString()} <span className="text-[10px] text-slate-400">PKR</span>
                    </p>
                  </div>
                </div>
              )}
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
                          {record && record.totalPrice > 0 && (
                            <div className={`text-[10px] font-black ${colorClass}`}>
                              {record.totalPrice.toLocaleString()} PKR
                              <button
                                onClick={() => {
                                  setEditingDailyRateDate(dateStr);
                                  setTempDailyRate((record.pricePerLiter || (record.totalQuantity ? Math.round(record.totalPrice / record.totalQuantity) : buyer.pricePerLiter)).toString());
                                }}
                                className="text-slate-400 font-normal ml-1 hover:text-blue-600 hover:bg-blue-50 px-1 rounded transition-colors"
                              >
                                (@ {record.pricePerLiter || (record.totalQuantity ? Math.round(record.totalPrice / record.totalQuantity) : buyer.pricePerLiter)})
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-2 border-y border-slate-50">
                          <input
                            type="number"
                            value={record?.morningQuantity || ''}
                            placeholder="0"
                            onChange={(e) => {
                              console.log("Updating record", dateStr, e.target.value);
                              handleRecordUpdate(dateStr, 'morning', e.target.value);
                            }}
                            className={`w-16 p-3 text-center bg-slate-50 rounded-xl font-black text-lg text-slate-900 focus:bg-white focus:ring-4 ${ringClass}/10 outline-none border-2 border-transparent focus:border-emerald-500/20 transition-all disabled:opacity-50`}
                          />
                        </td>
                        <td className="p-2 border-y border-slate-50">
                          <input
                            type="number"
                            value={record?.eveningQuantity || ''}
                            placeholder="0"
                            onChange={(e) => handleRecordUpdate(dateStr, 'evening', e.target.value)}
                            className={`w-16 p-3 text-center bg-slate-50 rounded-xl font-black text-lg text-slate-900 focus:bg-white focus:ring-4 ${ringClass}/10 outline-none border-2 border-transparent focus:border-emerald-500/20 transition-all disabled:opacity-50`}
                          />
                        </td>
                        <td className={`p-4 text-center font-black text-2xl ${colorClass} rounded-l-2xl border-y border-l border-slate-50 relative group/cell`}>
                          {record?.totalQuantity || '-'}

                          {/* View Link if exists */}
                          {((record?.images?.length || 0) > 0 || record?.imageUrl) && (
                            <button
                              onClick={() => openGallery(dateStr)}
                              className="absolute -left-3 -top-3 bg-blue-600 text-white rounded-full p-1.5 shadow-md z-10 transition-transform hover:scale-110 active:scale-95 flex items-center justify-center min-w-[28px] min-h-[28px]"
                            >
                              {((record?.images?.length || 0) + (record?.imageUrl && !record?.images?.length ? 1 : 0)) > 1 ? (
                                <span className="text-[10px] font-black">{(record?.images?.length || 0) + (record?.imageUrl && !record?.images?.length ? 1 : 0)}</span>
                              ) : (
                                <ImageIcon size={14} />
                              )}
                            </button>
                          )}
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
              <button
                onClick={handleAddPayment}
                className={`${btnClass} text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl hover:brightness-110 active:scale-95 transition-all`}
              >
                <Plus size={18} /> نئی انٹری
              </button>
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
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditPayment(p)} className="p-2.5 text-slate-300 hover:text-slate-900 transition-all"><Edit2 size={20} /></button>
                      <button onClick={() => handleDeletePayment(p.id)} className="p-2.5 text-rose-300 hover:text-rose-600 transition-all"><Trash2 size={20} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 px-2 py-3 md:p-6 flex items-center justify-between shadow-[0_-10px_35px_rgba(0,0,0,0.06)] z-40">
        <div className="flex gap-2 md:gap-4 shrink-0">
          <button
            onClick={handleDownloadPDF}
            disabled={isGeneratingPDF}
            className="flex flex-col items-center group disabled:opacity-50"
            title="مکمل لیجر ڈاؤن لوڈ کریں"
          >
            <div className="p-2 md:p-4 rounded-2xl bg-slate-900 text-white shadow-xl shadow-slate-100 group-active:scale-90 transition-transform">
              {isGeneratingPDF ? <Loader2 className="animate-spin" size={18} /> : <FileText size={18} />}
            </div>
            <span className="text-[8px] md:text-[9px] font-black mt-1 md:mt-2 uppercase tracking-widest text-slate-400">Ledger</span>
          </button>

          <button
            onClick={handleDownloadPaymentPDF}
            disabled={isGeneratingPaymentPDF}
            className="flex flex-col items-center group disabled:opacity-50"
            title="صرف پیمنٹ رپورٹ ڈاؤن لوڈ کریں"
          >
            <div className="p-2 md:p-4 rounded-2xl bg-emerald-600 text-white shadow-xl shadow-emerald-50 group-active:scale-90 transition-transform">
              {isGeneratingPaymentPDF ? <Loader2 className="animate-spin" size={18} /> : <ReceiptText size={18} />}
            </div>
            <span className="text-[8px] md:text-[9px] font-black mt-1 md:mt-2 uppercase tracking-widest text-emerald-500">Payments</span>
          </button>
        </div>

        <div className="text-right flex items-center gap-1.5 md:gap-8 overflow-hidden">
          <div className="text-center min-w-[50px]">
            <span className="text-sm md:text-xl font-black text-slate-900 tracking-tight">{monthPaid.toLocaleString()}</span>
            <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">ادا شدہ</p>
          </div>
          <div className="w-px h-6 md:h-12 bg-slate-100"></div>
          <div className="text-center min-w-[50px]">
            <span className={`text-sm md:text-xl font-black ${previousBalance > 0 ? (isSale ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-400'}`}>
              {Math.abs(previousBalance).toLocaleString()}
            </span>
            <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">سابقہ بیلنس</p>
          </div>
          <div className="w-px h-6 md:h-12 bg-slate-100"></div>
          <div className="text-center min-w-[60px]">
            <span className={`text-lg md:text-3xl font-black tracking-tighter ${totalBalance > 0 ? (isSale ? 'text-emerald-600' : 'text-rose-600') : (totalBalance < 0 ? 'text-blue-600' : 'text-slate-300')}`}>
              {Math.abs(totalBalance).toLocaleString()}
            </span>
            <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">
              {totalBalance > 0 ? 'باقی رقم' : (totalBalance < 0 ? 'ایڈوانس' : 'حساب برابر')}
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
                <p className="text-right text-[11px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2">تاریخ</p>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full p-4 bg-slate-50 text-slate-900 rounded-xl text-right font-black outline-none border-2 border-slate-100 focus:bg-white focus:border-emerald-500 transition-all shadow-inner"
                />
              </div>

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

      {/* Daily Rate Override Modal */}
      {editingDailyRateDate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-[60] flex items-center justify-center p-8 fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-10 shadow-2xl relative border-t-8 border-blue-600">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 tracking-tight">ریٹ تبدیل کریں</h3>
              <button onClick={() => setEditingDailyRateDate(null)} className="text-slate-400 p-2 hover:bg-slate-50 rounded-full"><X size={20} /></button>
            </div>
            <p className="text-right text-xs font-bold text-slate-500 mb-4">{formatUrduDate(editingDailyRateDate)}</p>

            <div className="space-y-4">
              <div>
                <p className="text-right text-[11px] font-black text-slate-400 mb-2 uppercase tracking-widest mr-2">نیا ریٹ (فی لیٹر)</p>
                <input
                  type="number"
                  value={tempDailyRate}
                  onChange={(e) => setTempDailyRate(e.target.value)}
                  className="w-full p-6 bg-slate-50 text-slate-900 rounded-2xl text-right text-4xl font-black outline-none border-2 border-slate-100 focus:bg-white focus:border-blue-500 transition-all shadow-inner"
                  placeholder="0"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveDailyRate()}
                />
              </div>
              <button
                onClick={handleSaveDailyRate}
                className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl active:scale-95 transition-all mt-4"
              >
                محفوظ کریں
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery View Modal */}
      {viewingImages && (
        <div
          className="fixed inset-0 bg-black/95 z-[100] flex flex-col p-4 fade-in items-center justify-center"
          onClick={() => setViewingImages(null)}
        >
          <button
            onClick={() => setViewingImages(null)}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors bg-white/10 p-3 rounded-full"
          >
            <X size={28} />
          </button>

          <div className="w-full max-w-4xl p-4 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6 text-white px-2">
              <h3 className="text-xl font-bold font-mono">{formatUrduDate(viewingImages.date)}</h3>
              <button
                onClick={() => triggerUpload(viewingImages.date)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 transition-all"
              >
                <Plus size={18} /> اور تصویر
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {viewingImages.urls.map((url, idx) => (
                <div key={idx} className="relative group rounded-2xl overflow-hidden border-2 border-white/10">
                  <img src={url} alt={`Receipt ${idx + 1}`} className="w-full h-auto object-cover" />
                  <button
                    onClick={() => handleDeleteImage(viewingImages.date, url)}
                    className="absolute top-3 right-3 bg-rose-600 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-700"
                  >
                    <Trash2 size={20} />
                  </button>
                  <div className="absolute bottom-2 left-3 bg-black/50 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">
                    Image {idx + 1}
                  </div>
                </div>
              ))}

              {/* Add Button Tile */}
              <button
                onClick={() => triggerUpload(viewingImages.date)}
                className="aspect-square rounded-2xl border-2 border-dashed border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <div className="p-4 bg-white/5 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-colors text-white/50">
                  <Plus size={32} />
                </div>
                <span className="text-white/50 text-xs font-black uppercase tracking-widest group-hover:text-emerald-400">Add New</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerProfile;
