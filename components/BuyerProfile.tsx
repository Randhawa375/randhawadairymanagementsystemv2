
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

    const effectiveRate = buyer.pricePerLiter;

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
        pricePerLiter: effectiveRate // Update snapshot to current rate
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
        totalPrice: Math.round((m + e) * buyer.pricePerLiter),
        pricePerLiter: buyer.pricePerLiter,
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
    if (isPastMonth) return;
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

  const previousBalance = useMemo(() => {
    const opening = buyer.openingBalance || 0;
    const currentPrefix = `${selectedMonthDate.getFullYear()}-${String(selectedMonthDate.getMonth() + 1).padStart(2, '0')}`;

    // Calculate past records/payments (Strictly before this month)
    const pastRecords = buyer.records.filter(r => r.date < `${currentPrefix}-01`);
    const pastBill = pastRecords.reduce((sum, r) => sum + r.totalPrice, 0);

    const pastPayments = (buyer.payments || []).filter(p => p.date < `${currentPrefix}-01`);
    const pastPaid = pastPayments.reduce((sum, p) => sum + p.amount, 0);

    return opening + pastBill - pastPaid;
  }, [buyer, selectedMonthDate]);

  const monthMilk = monthRecords.reduce((sum, r) => sum + r.totalQuantity, 0);
  const monthBill = monthRecords.reduce((sum, r) => sum + r.totalPrice, 0);
  const monthPaid = monthPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalBalance = previousBalance + monthBill - monthPaid;

  const handleDownloadPDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Create a temporary container for the report
      const printContainer = document.createElement('div');
      printContainer.className = "fixed inset-0 bg-white z-[9999] p-8 font-sans";
      printContainer.style.width = "210mm"; // A4 Width
      printContainer.style.minHeight = "297mm";
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-10000px'; // Move horizontally off-screen
      printContainer.style.top = '0'; // Keep top aligned to avoid height glitches
      document.body.appendChild(printContainer);

      // Render the content (Construct HTML strings or use ReactDOM.render if complex, but simple HTML is fast)
      // Since it's React, we can't easily ReactDOM.render in a functional component without side effects.
      // We will build the innerHTML manually for speed and simplicity.

      const engMonth = getEnglishMonthLabel(selectedMonthDate);

      let tableRows = '';

      // Add Previous Balance Row
      if (previousBalance !== 0) {
        tableRows += `
            <tr class="bg-gray-50 border-b border-gray-100">
              <td class="p-2 text-right border-r border-gray-200 font-bold text-gray-500">سابقہ بیلنس</td>
              <td class="p-2 text-center text-gray-400">-</td>
              <td class="p-2 text-center text-gray-400">-</td>
              <td class="p-2 text-center text-gray-400">-</td>
              <td class="p-2 text-left font-mono font-bold text-gray-700">${previousBalance.toLocaleString()}</td>
            </tr>
        `;
      }

      tableRows += daysInMonth.map(dateStr => {
        const record = buyer.records.find(r => r.date === dateStr);
        if (!record || record.totalQuantity <= 0) return '';
        return `
            <tr class="border-b border-gray-100">
              <td class="p-2 text-right border-r border-gray-200">${formatUrduDate(dateStr)}</td>
              <td class="p-2 text-center text-gray-600">${record.morningQuantity || '-'}</td>
              <td class="p-2 text-center text-gray-600">${record.eveningQuantity || '-'}</td>
              <td class="p-2 text-center font-bold text-gray-900 bg-gray-50">${record.totalQuantity}</td>
              <td class="p-2 text-left font-mono text-gray-700">${record.totalPrice.toLocaleString()}</td>
            </tr>
          `;
      }).join('');

      // ... [existing milk table construction] ...

      // Construct Payments Table Rows
      let paymentRows = '';
      if (monthPayments.length > 0) {
        paymentRows = monthPayments.map(p => `
          <tr class="border-b border-gray-100">
            <td class="p-2 text-right border-r border-gray-200">${formatUrduDate(p.date)}</td>
            <td class="p-2 text-center text-gray-600">${p.description || '-'}</td>
            <td class="p-2 text-left font-mono font-bold text-green-600">${p.amount.toLocaleString()}</td>
          </tr>
        `).join('');
      } else {
        paymentRows = '<tr><td colspan="3" class="p-4 text-center text-gray-400 text-xs">اس ماہ کوئی وصولی نہیں ہوئی</td></tr>';
      }

      printContainer.innerHTML = `
        <div style="direction: rtl; font-family: sans-serif;">
          <!-- Header -->
          <div class="text-center mb-6 border-b-2 border-gray-100 pb-4">
            <h1 class="text-3xl font-black text-gray-900 mb-2">رندھاوا ڈیری اینڈ کیٹل فارم</h1>
            <p class="text-gray-500 font-bold text-lg">پروپرائیٹر: چوہدری یوسف رندھاوا</p>
          </div>

          <!-- Meta -->
          <div class="flex justify-between items-end mb-8 bg-gray-50 p-6 rounded-2xl">
            <div class="text-left">
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">RECORD TYPE</p>
              <p class="font-bold text-gray-800">MILK LEDGER</p>
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mt-4 mb-1">MONTH</p>
              <p class="font-bold text-gray-800">${engMonth}</p>
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">نام</p>
              <h2 class="text-2xl font-black text-${isSale ? 'emerald' : 'rose'}-600">${buyer.name}</h2>
              <p class="text-xs text-gray-500 mt-1 font-bold">ریٹ: ${buyer.pricePerLiter} روپے فی لیٹر</p>
            </div>
          </div>

          <!-- Milk Table -->
          <h3 class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2 mt-6">دودھ کا لیدہ (Milk Ledger)</h3>
          <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-6">
            <thead class="bg-${isSale ? 'emerald' : 'rose'}-600 text-white">
              <tr>
                <th class="p-2 font-bold text-sm border-r border-white/20">تاریخ</th>
                <th class="p-2 font-bold text-sm text-center">صبح</th>
                <th class="p-2 font-bold text-sm text-center">شام</th>
                <th class="p-2 font-bold text-sm text-center bg-black/10">کل</th>
                <th class="p-2 font-bold text-sm text-left">بل (روپے)</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>

          <!-- Payments Table -->
          <div style="margin-top: 40px; page-break-inside: avoid;">
            <h3 class="text-sm font-bold text-gray-500 uppercase tracking-widest mb-2">وصولی / ادائیگی (Payments)</h3>
            <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-6">
              <thead class="bg-gray-800 text-white">
                <tr>
                  <th class="p-2 font-bold text-sm border-r border-white/20">تاریخ</th>
                  <th class="p-2 font-bold text-sm text-center">تفصیل</th>
                  <th class="p-2 font-bold text-sm text-left">رقم</th>
                </tr>
              </thead>
              <tbody>${paymentRows}</tbody>
            </table>
          </div>

          <!-- Summary -->
          <div class="flex justify-end mt-10">
            <div class="w-64 bg-gray-50 p-6 rounded-2xl border border-gray-200">
               <div class="flex justify-between mb-2 pb-2 border-b border-gray-200">
                <span class="text-gray-500 font-bold">سابقہ بیلنس</span>
                <span class="font-bold text-gray-700">${previousBalance.toLocaleString()}</span>
              </div>
              <div class="flex justify-between mb-2">
                <span class="text-gray-500 font-bold">کل دودھ</span>
                <span class="font-black">${monthMilk} لیٹر</span>
              </div>
              <div class="flex justify-between mb-2">
                <span class="text-gray-500 font-bold">کل بل</span>
                <span class="font-black">${monthBill.toLocaleString()}</span>
              </div>
              <div class="flex justify-between mb-2">
                <span class="text-gray-500 font-bold">وصولی</span>
                <span class="font-bold text-green-600">${monthPaid.toLocaleString()}</span>
              </div>
              <div class="flex justify-between text-lg pt-2">
                <span class="font-black text-gray-800">بقایا جات</span>
                <span class="font-black text-${totalBalance > 0 ? (isSale ? 'emerald' : 'rose') : 'blue'}-600">${totalBalance.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // Wait a moment for rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      // Cleanup function to avoid memory leaks
      const cleanup = () => {
        if (document.body.contains(printContainer)) {
          document.body.removeChild(printContainer);
        }
      };

      // Wait a moment for rendering
      await new Promise(resolve => setTimeout(resolve, 500)); // Increase wait time

      // Capture Ledger
      const canvas = await html2canvas(printContainer, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: 210 * 3.7795275591, // A4 width in px (approx)
        height: printContainer.scrollHeight // EXPLICIT HEIGHT to prevent extra whitespace
      });

      cleanup(); // Cleanup Ledger Container

      // Generate PDF (Multi-Page Support)
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      const ratio = pageWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      let heightLeft = scaledHeight;
      let position = 0;
      let pageCount = 0;

      // First Page
      pdf.addImage(imgData, 'JPEG', 0, position, pageWidth, scaledHeight);
      heightLeft -= pageHeight;
      pageCount++;

      // Subsequent Pages
      while (heightLeft > 5) { // Threshold of 5mm to avoid tiny slivers creating a new page
        position = heightLeft - scaledHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -(pageHeight * pageCount), pageWidth, scaledHeight);
        heightLeft -= pageHeight;
        pageCount++;
      }

      // --------------------------------------------------------------------------
      // APPEND IMAGES
      // --------------------------------------------------------------------------
      const recordsWithImages = buyer.records
        .filter(r => r.imageUrl && r.date.startsWith(currentMonthPrefix))
        .sort((a, b) => a.date.localeCompare(b.date)); // Sort by date

      if (recordsWithImages.length > 0) {
        pdf.addPage();
        pdf.setFontSize(20);
        pdf.setTextColor(40, 40, 40);
        pdf.text("Attached Receipts / Images", pageWidth / 2, 20, { align: 'center' });

        // We will try to stack 2 images per page or 1 large one.
        // Simplified approach: 1 or 2 images per page depending on aspect ratio?
        // Let's just put max 2 per page to be safe.

        let yOffset = 30;
        let imagesOnPage = 0;

        for (const record of recordsWithImages) {
          if (!record.imageUrl) continue;

          if (imagesOnPage >= 2) {
            pdf.addPage();
            yOffset = 20;
            imagesOnPage = 0;
          }

          try {
            // Fetch image as base64 (needed for jsPDF addImage to work reliably across protocols)
            // However, since we used CORS for html2canvas, we might be lucky. 
            // But for addImage with URL, it's safer to fetch blob or base64.
            // Simplest way: create an Image element, wait load, draw to canvas, get base64.
            // But since we are inside an async function, we can do it.

            const imgBlob = await fetch(record.imageUrl).then(res => res.blob());
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(imgBlob);
            });

            // Get dimensions
            const imgProps = pdf.getImageProperties(base64);
            const availableWidth = pageWidth - 40; // 20mm margin
            const availableHeight = (pageHeight - 60) / 2; // Split page height for 2 images

            // Scale to fit
            const widthRatio = availableWidth / imgProps.width;
            const heightRatio = availableHeight / imgProps.height;
            const scale = Math.min(widthRatio, heightRatio, 1); // Don't upscale

            const finalWidth = imgProps.width * scale;
            const finalHeight = imgProps.height * scale;

            // Center horizontally
            const xPos = (pageWidth - finalWidth) / 2;

            pdf.setFontSize(10);
            pdf.setTextColor(100);
            pdf.text(`Date: ${record.date}`, xPos, yOffset - 2);

            pdf.addImage(base64, 'JPEG', xPos, yOffset, finalWidth, finalHeight);

            yOffset += availableHeight + 15;
            imagesOnPage++;

          } catch (err) {
            console.error("Failed to add PDF image for", record.date, err);
            // Verify if we should show a placeholder or skip
            pdf.setFontSize(10);
            pdf.setTextColor(200, 50, 50);
            pdf.text(`[Image Load Failed: ${record.date}]`, 20, yOffset);
            yOffset += 20;
          }
        }
      }

      pdf.save(`${buyer.name}_Ledger_${engMonth}.pdf`);

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
      const printContainer = document.createElement('div');
      printContainer.className = "fixed inset-0 bg-white z-[9999] p-8 font-sans";
      printContainer.style.width = "210mm";
      printContainer.style.minHeight = "297mm";
      printContainer.style.position = 'absolute';
      printContainer.style.left = '-10000px'; // Move horizontally off-screen
      printContainer.style.top = '0'; // Keep top aligned to avoid height glitches
      document.body.appendChild(printContainer);

      const engMonth = getEnglishMonthLabel(selectedMonthDate);

      const rows = monthPayments.map(p => `
        <tr class="border-b border-gray-100">
          <td class="p-3 text-right border-r border-gray-200">${formatUrduDate(p.date)}</td>
          <td class="p-3 text-left font-mono font-bold text-gray-900">${p.amount.toLocaleString()}</td>
          <td class="p-3 text-right text-gray-600 text-sm">${p.description || '-'}</td>
        </tr>
      `).join('');

      printContainer.innerHTML = `
        <div style="direction: rtl; font-family: sans-serif;">
           <!-- Header -->
          <div class="text-center mb-8 border-b-2 border-gray-100 pb-6">
            <h1 class="text-3xl font-black text-gray-900 mb-2">رندھاوا ڈیری اینڈ کیٹل فارم</h1>
            <p class="text-gray-500 font-bold text-lg">پروپرائیٹر: چوہدری یوسف رندھاوا</p>
          </div>

          <!-- Meta -->
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

          <!-- Table -->
          <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-8">
            <thead class="bg-slate-800 text-white">
              <tr>
                <th class="p-4 font-bold text-sm border-r border-white/20">تاریخ</th>
                <th class="p-4 font-bold text-sm text-center">رقم (روپے)</th>
                <th class="p-4 font-bold text-sm text-right">تفصیل / نوٹ</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="3" class="p-8 text-center text-gray-400">کوئی پیمنٹ ریکارڈ نہیں</td></tr>'}
            </tbody>
          </table>

          <div class="mt-8 text-center bg-gray-900 text-white p-4 rounded-xl">
            <p class="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">کل ادا شدہ رقم</p>
            <p class="text-2xl font-black">${monthPaid.toLocaleString()} PKR</p>
          </div>
        </div>
      `;

      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(printContainer, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });

      document.body.removeChild(printContainer);

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${buyer.name}_Payments_Report_${engMonth}.pdf`);

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

    // GLOBAL UPDATE STRATEGY:
    // Update ALL records (Past & Present) to the new rate.
    const updatedRecords = buyer.records.map(r => {
      const newPrice = Math.round(r.totalQuantity * newRate);
      return {
        ...r,
        pricePerLiter: newRate,
        totalPrice: newPrice
      };
    });

    // Update Local State with Locked Records + New Global Price
    onUpdateBuyer({
      ...buyer,
      pricePerLiter: newRate,
      records: updatedRecords
    });

    setIsEditingRate(false);

    try {
      await api.updateContact({ ...buyer, pricePerLiter: newRate });

      // Update ALL records in DB
      const recordsToSave = updatedRecords.filter(r => r.totalQuantity > 0);
      const promises = recordsToSave.map(rec => api.addRecord(buyer.id, rec));
      await Promise.all(promises);
    } catch (e) {
      console.error("Failed to update rate", e);
      alert("ریٹ اپ ڈیٹ نہیں ہو سکا۔");
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
          {!isPastMonth && (
            <button
              onClick={handleCameraClick}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 active:scale-95 transition-all ${isSale ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}
            >
              <Camera size={24} />
            </button>
          )}
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
                {isEditingRate && !isPastMonth ? (
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
                    {!isPastMonth && (
                      <button onClick={() => setIsEditingRate(true)} className={`flex items-center gap-2 text-xs font-black bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl hover:bg-slate-200 transition-all shadow-sm`}><Edit2 size={16} /> ریٹ تبدیل</button>
                    )}
                  </>
                )}
              </div>

              {/* Previous Balance Banner */}
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
                              <span className="text-slate-400 font-normal ml-1">
                                (@ {record.pricePerLiter || (record.totalQuantity ? Math.round(record.totalPrice / record.totalQuantity) : buyer.pricePerLiter)})
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="p-2 border-y border-slate-50">
                          <input
                            type="number"
                            disabled={isPastMonth}
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
                            disabled={isPastMonth}
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
              {!isPastMonth && (
                <button
                  onClick={() => triggerUpload(viewingImages.date)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 transition-all"
                >
                  <Plus size={18} /> اور تصویر
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {viewingImages.urls.map((url, idx) => (
                <div key={idx} className="relative group rounded-2xl overflow-hidden border-2 border-white/10">
                  <img src={url} alt={`Receipt ${idx + 1}`} className="w-full h-auto object-cover" />
                  {!isPastMonth && (
                    <button
                      onClick={() => handleDeleteImage(viewingImages.date, url)}
                      className="absolute top-3 right-3 bg-rose-600 text-white p-2 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-rose-700"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                  <div className="absolute bottom-2 left-3 bg-black/50 text-white text-[10px] px-2 py-1 rounded-md backdrop-blur-sm">
                    Image {idx + 1}
                  </div>
                </div>
              ))}

              {/* Add Button Tile */}
              {!isPastMonth && (
                <button
                  onClick={() => triggerUpload(viewingImages.date)}
                  className="aspect-square rounded-2xl border-2 border-dashed border-white/20 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all flex flex-col items-center justify-center gap-2 group"
                >
                  <div className="p-4 bg-white/5 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-colors text-white/50">
                    <Plus size={32} />
                  </div>
                  <span className="text-white/50 text-xs font-black uppercase tracking-widest group-hover:text-emerald-400">Add New</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BuyerProfile;
