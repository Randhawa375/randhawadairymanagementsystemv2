
import React, { useState, useEffect, useMemo } from 'react';
import { Contact, ViewState, ModuleType, User } from './types';
import { getMonthLabel, getEnglishMonthLabel } from './utils';
import BuyerProfile from './components/BuyerProfile';
import FarmDashboard from './components/FarmDashboard';
import { Plus, Users, Milk, DollarSign, X, Settings, Trash2, Wallet, ShoppingCart, TrendingUp, TrendingDown, ChevronLeft, ArrowRight, ChevronRight, Download, Loader2, Sparkles, LogOut, Lock, User as UserIcon, Tractor, Calendar, Check, History, RefreshCw, SearchX } from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import { supabase } from './lib/supabase';
import { api } from './lib/api';

const App: React.FC = () => {
  const [viewState, setViewState] = useState<ViewState>('AUTH');
  const [activeModule, setActiveModule] = useState<ModuleType | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [isGeneratingGlobalPDF, setIsGeneratingGlobalPDF] = useState(false);

  // Auth State
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [username, setUsername] = useState(''); // Treated as email prefix or full email
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState('');

  // GLOBAL DATE STATE
  const [globalDate, setGlobalDate] = useState(new Date());

  const monthPrefix = useMemo(() => {
    return `${globalDate.getFullYear()}-${String(globalDate.getMonth() + 1).padStart(2, '0')}`;
  }, [globalDate]);

  const isPastMonth = useMemo(() => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const selectedYear = globalDate.getFullYear();
    const selectedMonth = globalDate.getMonth();

    if (selectedYear < currentYear) return true;
    if (selectedYear === currentYear && selectedMonth < currentMonth) return true;
    return false;
  }, [globalDate]);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactOpeningBalance, setNewContactOpeningBalance] = useState('');

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editName, setEditName] = useState('');
  const [editOpeningBalance, setEditOpeningBalance] = useState('');

  const DEFAULT_RATE = 200;

  // Check Session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setViewState('MAIN_MENU');
        checkForMigration();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setViewState('MAIN_MENU');
        checkForMigration();
      } else {
        setViewState('AUTH');
        setContacts([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkForMigration = () => {
    const saleData = localStorage.getItem('randhawa_sale_v2');
    const purchaseData = localStorage.getItem('randhawa_purchase_v2');

    if (saleData || purchaseData) {
      handleMigration(saleData, purchaseData);
    }
  };

  const handleMigration = async (saleDataStr: string | null, purchaseDataStr: string | null) => {
    // Only migrate if we haven't asked this session? 
    // Or prompt every time until it's gone.
    if (!window.confirm("پرانا ڈیٹا موجود ہے۔ کیا آپ اسے کلاؤڈ پر منتقل کرنا چاہتے ہیں؟\n\n(Old data found. Migrate to cloud?)")) {
      if (window.confirm("اگر آپ کینسل کریں گے تو پرانا ڈیٹا ڈیلیٹ ہو جائے گا۔ کیا آپ یقینی طور پر ڈیلیٹ کرنا چاہتے ہیں؟")) {
        localStorage.removeItem('randhawa_sale_v2');
        localStorage.removeItem('randhawa_purchase_v2');
      }
      return;
    }

    setIsMigrating(true);
    try {
      if (saleDataStr) {
        setMigrationStatus("فروخت کا ریکارڈ منتقل ہو رہا ہے...");
        const sales: Contact[] = JSON.parse(saleDataStr);
        for (const contact of sales) {
          const newContact = await api.createContact(contact, 'SALE');
          // Add all records
          for (const rec of contact.records) {
            await api.addRecord(newContact.id, rec);
          }
          // Add all payments
          for (const pay of (contact.payments || [])) {
            await api.addPayment(newContact.id, pay);
          }
        }
        localStorage.removeItem('randhawa_sale_v2');
      }

      if (purchaseDataStr) {
        setMigrationStatus("خریداری کا ریکارڈ منتقل ہو رہا ہے...");
        const purchases: Contact[] = JSON.parse(purchaseDataStr);
        for (const contact of purchases) {
          const newContact = await api.createContact(contact, 'PURCHASE');
          // Add all records
          for (const rec of contact.records) {
            await api.addRecord(newContact.id, rec);
          }
          // Add all payments
          for (const pay of (contact.payments || [])) {
            await api.addPayment(newContact.id, pay);
          }
        }
        localStorage.removeItem('randhawa_purchase_v2');
      }
      alert("تمام ڈیٹا کامیابی سے محفوظ ہو گیا!");
    } catch (e) {
      console.error(e);
      alert("ڈیٹا منتقلی میں مسئلہ پیش آیا۔ انٹرنیٹ چیک کریں۔");
    } finally {
      setIsMigrating(false);
      setMigrationStatus("");
    }
  };

  // Load Data
  useEffect(() => {
    if (activeModule) {
      const loadData = async () => {
        try {
          const data = await api.getContacts(activeModule);
          setContacts(data);
        } catch (e) {
          console.error("Failed to load contacts", e);
        }
      };
      loadData();
    }
  }, [activeModule, isMigrating]);

  // Dashboard Data Loading
  const [dashboardData, setDashboardData] = useState<{ sales: Contact[], purchases: Contact[] }>({ sales: [], purchases: [] });
  const [dashboardLoading, setDashboardLoading] = useState(false);

  useEffect(() => {
    if (viewState === 'MAIN_MENU') {
      const loadDashboard = async () => {
        setDashboardLoading(true);
        try {
          const [s, p] = await Promise.all([
            api.getContacts('SALE'),
            api.getContacts('PURCHASE')
          ]);
          setDashboardData({ sales: s, purchases: p });
        } catch (e) {
          console.error("Failed to load dashboard data", e);
        } finally {
          setDashboardLoading(false);
        }
      };
      loadDashboard();
    }
  }, [viewState, globalDate, isMigrating]);

  // Calculate Dashboard Stats and Lists
  const { totalSaleMonth, totalPurchaseMonth, totalProfit, totalReceivable, totalPayable, receivableList, payableList } = useMemo(() => {
    const getMonthTotal = (contactsList: Contact[]) => {
      return contactsList.reduce((sum, c) => {
        return sum + c.records
          .filter(r => r.date.startsWith(monthPrefix))
          .reduce((s, r) => s + r.totalPrice, 0);
      }, 0);
    };

    const sTotal = getMonthTotal(dashboardData.sales);
    const pTotal = getMonthTotal(dashboardData.purchases);

    // Calculate Receivables List (Sales)
    // Calculate Receivables List (Sales)
    const currentMonthEndPrefix = `${monthPrefix}-31`; // Simple upper bound for string comparison

    const calculateCumulativeBalance = (c: Contact) => {
      const opening = c.openingBalance || 0;

      const totalBill = c.records
        .filter(r => r.date <= currentMonthEndPrefix)
        .reduce((sum, r) => sum + r.totalPrice, 0);

      const totalPaid = (c.payments || [])
        .filter(p => p.date <= currentMonthEndPrefix)
        .reduce((sum, p) => sum + p.amount, 0);

      return opening + totalBill - totalPaid;
    };

    const rList = dashboardData.sales.map(c => {
      const balance = calculateCumulativeBalance(c);
      return { ...c, balance };
    }).filter(c => c.balance > 0);

    const rTotal = rList.reduce((sum, c) => sum + c.balance, 0);

    // Calculate Payables List (Purchases)
    const payList = dashboardData.purchases.map(c => {
      const balance = calculateCumulativeBalance(c);
      return { ...c, balance };
    }).filter(c => c.balance > 0);

    const payTotal = payList.reduce((sum, c) => sum + c.balance, 0);

    // User wants "Main Dashboard" to sum both balances?
    // The previous implementation of totalSaleMonth / totalPurchaseMonth was JUST for this month.
    // If user wants "Total Outstanding" we have that in rTotal / payTotal.
    // Let's ensure the Profit card reflects NET position if desired, or stick to Monthly Profit?
    // The user said "show in the dashboard that it is the previous balance And it should add the both balances"
    // This implies the totals at the top might be misleading if they only show monthly.
    // Let's add independent stats for "Total Receivable" and "Total Payable" to the main cards? 
    // Or keep the cards as "Monthly" and rely on the list totals (which we just fixed).
    // The user said "Add both balances". I will assume rTotal and payTotal (which are cumulative) should be prominent.

    return {
      totalSaleMonth: sTotal,
      totalPurchaseMonth: pTotal,
      totalProfit: sTotal - pTotal, // Keep this as Monthly Profit finding
      totalReceivable: rTotal, // Cumulative
      totalPayable: payTotal, // Cumulative
      receivableList: rList,
      payableList: payList
    };
  }, [dashboardData, monthPrefix]);

  // --- DAILY INSIGHT LOGIC ---
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  // Add openingStock (manual) to dailyStats. Can be null if hybrid/auto.
  const [dailyStats, setDailyStats] = useState({ farm: 0, purchase: 0, sale: 0, prevStock: 0, openingStock: undefined as number | null | undefined });
  const [isEditingStock, setIsEditingStock] = useState(false);
  const [manualStockInput, setManualStockInput] = useState('');
  const [dailyDetailMode, setDailyDetailMode] = useState<'SALE' | 'PURCHASE' | null>(null);

  useEffect(() => {
    if (viewState === 'MAIN_MENU') {
      const fetchDaily = async () => {
        try {
          // 1. Farm Records
          const farmRecs = await api.getFarmRecords();

          // Check for today's record to get manually set opening stock
          const todayRecord = farmRecs.find(r => r.date === dailyDate);

          // 2. Anchor-Based Calculation Logic
          // We need to find the latest "Anchor" - a day where openingStock was manually set.
          // If found, we start calculation from there. If not, we start from the beginning.

          /* 
             Logic:
             1. Filter farmRecs for dates strictly BEFORE dailyDate.
             2. Sort descending by date.
             3. Find first record with openingStock != null.
          */

          const sortedHistory = farmRecs
            .filter(r => r.date < dailyDate)
            .sort((a, b) => b.date.localeCompare(a.date));

          const anchorRecord = sortedHistory.find(r => r.openingStock !== null && r.openingStock !== undefined);

          let baseStock = 0;
          let calculatedFromDate = ''; // Exclusive start date for calculation loop (actually inclusive of next day)

          if (anchorRecord) {
            baseStock = anchorRecord.openingStock!;
            calculatedFromDate = anchorRecord.date;
          } else {
            // No anchor found, start from beginning (baseStock = 0)
            calculatedFromDate = ''; // effectively everything > ''
          }

          // Now calculate NET change from the Anchor Date (Exclusive) up to DailyDate (Exclusive)
          // Range: (AnchorDate < date < DailyDate)
          // But wait, if we have an anchor at date X with Opening Stock S, 
          // the result at end of day X is: S + Farm(X) + Purchase(X) - Sale(X).
          // So we must INCLUDE the Anchor Date's transactions in the net change, 
          // OR simply start summing transactions where date >= AnchorDate AND date < DailyDate.

          /*
             Refined Logic:
             Start Sum = BaseStock (This is the Opening Stock of Anchor Day)
             Add Transactions for every day D where: AnchorDate <= D < DailyDate
          */

          const filterRange = (d: string) => {
            if (calculatedFromDate) {
              return d >= calculatedFromDate && d < dailyDate;
            }
            return d < dailyDate;
          };

          const rangeFarm = farmRecs
            .filter(r => filterRange(r.date))
            .reduce((sum, r) => sum + r.totalQuantity, 0);

          const rangePurchase = dashboardData.purchases.reduce((sum, c) => {
            return sum + c.records
              .filter(r => filterRange(r.date))
              .reduce((s, r) => s + r.totalQuantity, 0);
          }, 0);

          const rangeSale = dashboardData.sales.reduce((sum, c) => {
            return sum + c.records
              .filter(r => filterRange(r.date))
              .reduce((s, r) => s + r.totalQuantity, 0);
          }, 0);

          const calculatedPrevStock = baseStock + rangeFarm + rangePurchase - rangeSale;

          // 3. Today's Stats
          const todayFarm = todayRecord?.totalQuantity || 0;

          const todayPurchase = dashboardData.purchases.reduce((sum, c) => {
            const rec = c.records.find(r => r.date === dailyDate);
            return sum + (rec?.totalQuantity || 0);
          }, 0);

          const todaySale = dashboardData.sales.reduce((sum, c) => {
            const rec = c.records.find(r => r.date === dailyDate);
            return sum + (rec?.totalQuantity || 0);
          }, 0);

          setDailyStats({
            farm: todayFarm,
            purchase: todayPurchase,
            sale: todaySale,
            prevStock: calculatedPrevStock,
            openingStock: todayRecord?.openingStock // can be null or number
          });

          // Initialize manual input
          // If manual exists, show it. If null/undefined, show calculated.
          setManualStockInput(((todayRecord?.openingStock !== null && todayRecord?.openingStock !== undefined) ? todayRecord.openingStock : calculatedPrevStock).toString());

        } catch (e) {
          console.error("Daily stats failed", e);
        }
      };
      fetchDaily();
    }
  }, [viewState, dailyDate, dashboardData]);

  const handleUpdateStock = async (revert: boolean = false) => {
    try {
      const newVal = revert ? null : parseFloat(manualStockInput);
      if (!revert && isNaN(newVal as number)) return;

      const all = await api.getFarmRecords();
      const existing = all.find(r => r.date === dailyDate);

      await api.addFarmRecord({
        id: existing?.id || '',
        date: dailyDate,
        morningQuantity: existing?.morningQuantity || 0,
        eveningQuantity: existing?.eveningQuantity || 0,
        totalQuantity: existing?.totalQuantity || 0,
        openingStock: newVal, // can be null to revert
        timestamp: 0
      });

      setDailyStats(prev => ({ ...prev, openingStock: newVal }));
      setIsEditingStock(false);
      if (revert) {
        // Reset manual input to calculated if reverting
        // We need to fetch/calc again or just trust previous state? 
        // prevStock in state holds the calculated value.
        setManualStockInput(dailyStats.prevStock.toString());
        alert("Reverted to Automatic Calculation!");
      } else {
        alert("Opening stock updated!");
      }

    } catch (e) {
      console.error("Failed to update stock", e);
      alert("اپ ڈیٹ محفوظ نہیں ہو سکا۔");
    }
  };

  // Derived Totals for UI
  const totalAvailable = (dailyStats.openingStock !== undefined && dailyStats.openingStock !== null)
    ? dailyStats.openingStock + dailyStats.farm + dailyStats.purchase
    : dailyStats.farm + dailyStats.purchase;

  const netRemaining = totalAvailable - dailyStats.sale;



  const getEmail = (user: string) => {
    // If user enters a simple username, append a domain
    // Sanitize: remove spaces, special chars, to lowercase
    if (user.includes('@')) return user;
    const sanitized = user.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return `${sanitized}@randhawa.local`;
  };

  const handleSignup = async () => {
    if (!username.trim() || !password.trim() || !fullName.trim()) {
      alert('براہ کرم تمام خانے پُر کریں۔');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: getEmail(username),
        password,
        options: {
          data: {
            username,
            name: fullName
          }
        }
      });
      if (error) throw error;
      alert('اکاؤنٹ بن گیا ہے! براہ کرم لاگ ان کریں۔');
      setAuthMode('LOGIN');
    } catch (e: any) {
      alert(e.message || 'سائن اپ ناکام رہا۔');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      alert('براہ کرم یوزر نام اور پاس ورڈ درج کریں۔');
      return;
    }
    setAuthLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: getEmail(username),
        password,
      });
      if (error) throw error;
      // Session listener will handle navigation
    } catch (e: any) {
      alert('لاگ ان ناکام: ' + (e.message || 'غلط تفصیلات'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setViewState('AUTH');
    setActiveModule(null);
  };



  const calculateMonthlyBalance = (contact: Contact) => {
    // This function is for the contact list card view. 
    // It creates the small badge showing "Balance: X".
    // Should this be Monthly or Cumulative?
    // Users generally want to know Total Outstanding when looking at the list.
    const opening = contact.openingBalance || 0;
    const currentMonthEndPrefix = `${monthPrefix}-31`;

    const totalBill = contact.records
      .filter(r => r.date <= currentMonthEndPrefix)
      .reduce((sum, r) => sum + r.totalPrice, 0);

    const totalPaid = (contact.payments || [])
      .filter(p => p.date <= currentMonthEndPrefix)
      .reduce((sum, p) => sum + p.amount, 0);

    return opening + totalBill - totalPaid;
  };

  const handleSelectModule = (type: ModuleType) => {
    setActiveModule(type);
    setViewState('DASHBOARD');
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !activeModule) return;

    try {
      // Optimistic Update can be added here, but for safety waiting for API
      const newContact = await api.createContact({
        id: '', // DB will generate or ignore
        name: newContactName,
        pricePerLiter: DEFAULT_RATE,
        openingBalance: parseFloat(newContactOpeningBalance) || 0,
        records: [],
        payments: [],
        createdAt: Date.now(),
      }, activeModule);

      setContacts([...contacts, newContact]);
      setIsAddModalOpen(false);
      setNewContactName('');
      setNewContactOpeningBalance('');
    } catch (e) {
      alert("نیا ریکارڈ محفوظ نہیں ہو سکا۔");
    }
  };

  const handleUpdateContact = async (updatedContact: Contact) => {
    // Only used for Name/Rate updates from App or local state sync from Profile
    const original = contacts.find(c => c.id === updatedContact.id);
    if (original) {
      // Only update DB if top-level fields changed
      if (original.name !== updatedContact.name || original.pricePerLiter !== updatedContact.pricePerLiter || original.openingBalance !== updatedContact.openingBalance) {
        try {
          await api.updateContact(updatedContact);
        } catch (e) {
          console.error("Failed to update contact info");
        }
      }
    }
    // Update local state
    setContacts(contacts.map(c => c.id === updatedContact.id ? updatedContact : c));
  };

  const openEditModal = (contact: Contact, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPastMonth) {
      alert("گزشتہ مہینے کے ریکارڈ میں تبدیلی ممکن نہیں ہے۔");
      return;
    }
    setEditingContact(contact);
    setEditName(contact.name);
    setEditOpeningBalance((contact.openingBalance || 0).toString());
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingContact || !editName.trim()) return;
    const updated = { ...editingContact, name: editName, openingBalance: parseFloat(editOpeningBalance) || 0 };
    await handleUpdateContact(updated);
    setIsEditModalOpen(false);
    setEditingContact(null);
  };

  const handleDeleteContact = async () => {
    if (!editingContact || !activeModule) return;
    if (window.confirm(`کیا آپ واقعی "${editingContact.name}" کا ریکارڈ ختم کرنا چاہتے ہیں؟`)) {
      try {
        await api.deleteContact(editingContact.id);
        setContacts(contacts.filter(c => c.id !== editingContact.id));
        setIsEditModalOpen(false);
        setEditingContact(null);
      } catch (e) {
        alert("حذف نہیں ہو سکا۔");
      }
    }
  };

  const { totalMilk, totalAmount } = useMemo(() => {
    let m = 0; let a = 0;
    contacts.forEach(c => {
      c.records.forEach(rec => {
        if (rec.date.startsWith(monthPrefix)) {
          m += rec.totalQuantity || 0; a += rec.totalPrice || 0;
        }
      });
    });
    return { totalMilk: m, totalAmount: a };
  }, [contacts, monthPrefix]);

  const isSale = activeModule === 'SALE';
  const theme = {
    accentColor: isSale ? 'text-emerald-600' : 'text-rose-600',
    btnColor: isSale ? 'bg-emerald-600' : 'bg-rose-600',
    hoverBorder: isSale ? 'hover:border-emerald-200' : 'hover:border-rose-200',
    label: isSale ? 'دودھ کی فروخت' : 'دودھ کی خریداری',
    personLabel: isSale ? 'گاہک' : 'سپلائر'
  };

  const changeMonth = (offset: number) => {
    setGlobalDate(new Date(globalDate.getFullYear(), globalDate.getMonth() + offset, 1));
  };

  const handleDownloadReport = async () => {
    setIsGeneratingGlobalPDF(true);
    try {
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      const printContainer = document.createElement('div');
      printContainer.className = "fixed inset-0 bg-white z-[9999] p-8 font-sans";
      printContainer.style.width = "210mm";
      // We set a fixed height for the container during capture, but the concept is we capture "pages"
      printContainer.style.minHeight = "297mm";
      printContainer.style.position = 'absolute';
      printContainer.style.top = '-9999px';
      document.body.appendChild(printContainer);

      const engMonth = getEnglishMonthLabel(globalDate);
      const currentMonthStart = `${monthPrefix}-01`;

      // --- Helper: Generate Rows ---
      const generateRows = (contactsList: Contact[]) => {
        let sumMilk = 0, sumBill = 0, sumPaid = 0, sumBalance = 0, sumPrevBal = 0;

        let rows = contactsList.map((c, index) => {
          // 1. Previous Balance
          const opening = c.openingBalance || 0;
          const pastBill = c.records
            .filter(r => r.date < currentMonthStart)
            .reduce((sum, r) => sum + r.totalPrice, 0);
          const pastPaid = (c.payments || [])
            .filter(p => p.date < currentMonthStart)
            .reduce((sum, p) => sum + p.amount, 0);

          const prevBal = opening + pastBill - pastPaid;

          // 2. Current Month
          const curMilk = c.records
            .filter(r => r.date.startsWith(monthPrefix))
            .reduce((sum, r) => sum + r.totalQuantity, 0);
          const curBill = c.records
            .filter(r => r.date.startsWith(monthPrefix))
            .reduce((sum, r) => sum + r.totalPrice, 0);
          const curPaid = (c.payments || [])
            .filter(p => p.date.startsWith(monthPrefix))
            .reduce((sum, p) => sum + p.amount, 0);

          // 3. Net Balance
          const paramsBalance = prevBal + curBill - curPaid;

          // Aggregates
          sumMilk += curMilk;
          sumBill += curBill;
          sumPaid += curPaid;
          sumBalance += paramsBalance;
          sumPrevBal += prevBal;

          return `
            <tr class="border-b border-gray-100 text-xs">
              <td class="p-2 text-center text-gray-500">${index + 1}</td>
              <td class="p-2 text-right font-bold text-gray-800">${c.name}</td>
              <td class="p-2 text-center text-gray-400">${c.pricePerLiter}</td>
              <td class="p-2 text-center text-gray-600" dir="ltr">${prevBal !== 0 ? prevBal.toLocaleString() : '-'}</td>
              <td class="p-2 text-center font-bold text-gray-900 bg-gray-50">${curMilk > 0 ? curMilk : '-'}</td>
              <td class="p-2 text-center text-gray-600" dir="ltr">${curBill > 0 ? curBill.toLocaleString() : '-'}</td>
              <td class="p-2 text-center text-emerald-600" dir="ltr">${curPaid > 0 ? curPaid.toLocaleString() : '-'}</td>
              <td class="p-2 text-left font-black ${paramsBalance > 0 ? (activeModule === 'SALE' ? 'text-emerald-700' : 'text-rose-700') : (paramsBalance < 0 ? 'text-blue-600' : 'text-slate-300')}" dir="ltr">
                ${paramsBalance !== 0 ? paramsBalance.toLocaleString() : '0'}
              </td>
            </tr>
          `;
        }).join('');

        return { rows, totals: { sumMilk, sumBill, sumPaid, sumBalance, sumPrevBal } };
      };

      // --- Helper: Render a Single Page Batch ---
      const renderBatch = async (
        type: 'SALE' | 'PURCHASE',
        dataBatch: Contact[],
        pageIndex: number,
        totalPages: number,
        grandTotals?: { sumMilk: number, sumBill: number, sumPaid: number, sumBalance: number, sumPrevBal: number }
      ) => {
        const title = type === 'SALE' ? 'دودھ کی فروخت (Sales)' : 'دودھ کی خریداری (Purchase)';
        const colorClass = type === 'SALE' ? 'emerald' : 'rose';

        const { rows, totals } = generateRows(dataBatch);

        let footerRow = '';
        if (pageIndex === totalPages - 1 && grandTotals) {
          footerRow = `
               <tr class="bg-gray-100 font-black text-sm border-t-2 border-gray-300">
                  <td colspan="3" class="p-3 text-right">کل میزان (Grand Total)</td>
                  <td class="p-3 text-center text-gray-600" dir="ltr">${grandTotals.sumPrevBal.toLocaleString()}</td>
                  <td class="p-3 text-center">${grandTotals.sumMilk}</td>
                  <td class="p-3 text-center" dir="ltr">${grandTotals.sumBill.toLocaleString()}</td> 
                  <td class="p-3 text-center text-emerald-700" dir="ltr">${grandTotals.sumPaid.toLocaleString()}</td>
                  <td class="p-3 text-left ${grandTotals.sumBalance > 0 ? (activeModule === 'SALE' ? 'text-emerald-700' : 'text-rose-700') : 'text-blue-600'}" dir="ltr">${grandTotals.sumBalance.toLocaleString()}</td>
               </tr>
            `;
        }

        printContainer.innerHTML = `
          <div style="direction: rtl; font-family: sans-serif; height: 100%; display: flex; flex-direction: column;">
            <!-- Header -->
            <div class="text-center mb-6 border-b-2 border-gray-100 pb-4">
              <h1 class="text-2xl font-black text-gray-900 mb-1">رندھاوا ڈیری اینڈ کیٹل فارم</h1>
              <p class="text-gray-500 font-bold text-sm">پروپرائیٹر: فرحان رندھاوا</p>
            </div>

            <div class="flex justify-between items-center mb-6 bg-gray-50 p-4 rounded-xl">
              <div>
                 <p class="text-xs text-gray-500 font-bold">رپورٹ کی اقسام</p>
                 <h2 class="text-lg font-black text-slate-800 uppercase tracking-widest">MONTHLY LEDGER</h2>
                 <p class="text-xs text-gray-400 mt-1">${type} - Page ${pageIndex + 1} of ${totalPages}</p>
              </div>
              <div class="text-left">
                 <p class="text-xs text-emerald-600 font-bold uppercase tracking-widest">MONTH</p>
                 <p class="text-xl font-black text-emerald-700">${engMonth}</p>
              </div>
            </div>

            <div class="mb-4 break-inside-avoid flex-grow">
              <div class="flex items-center gap-3 mb-2 border-b pb-2 ${colorClass === 'emerald' ? 'border-emerald-100' : 'border-rose-100'}">
                <h3 class="text-lg font-black ${colorClass === 'emerald' ? 'text-emerald-700' : 'text-rose-700'}">${title}</h3>
              </div>
               <table class="w-full text-right border border-gray-200 rounded-lg overflow-hidden mb-4">
                <thead class="${colorClass === 'emerald' ? 'bg-emerald-600' : 'bg-rose-600'} text-white">
                  <tr>
                     <th class="p-2 font-bold text-xs w-10 text-center">#</th>
                     <th class="p-2 font-bold text-xs text-right">نام</th>
                     <th class="p-2 font-bold text-xs text-center">ریٹ</th>
                     <th class="p-2 font-bold text-xs text-center">سابقہ</th>
                     <th class="p-2 font-bold text-xs text-center">کل دودھ</th>
                     <th class="p-2 font-bold text-xs text-center">کل بل</th>
                     <th class="p-2 font-bold text-xs text-center">وصولی/ادائیگی</th>
                     <th class="p-2 font-bold text-xs text-left">بقایا</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                  ${footerRow}
                </tbody>
              </table>
            </div>
            
            <div class="mt-auto pt-4 border-t border-gray-200 text-center text-[10px] text-gray-400">
              Automated Report - Generated on ${new Date().toLocaleDateString()}
            </div>
          </div>
        `;

        // Wait a tick for rendering
        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(printContainer, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.85);
        const imgWidth = pageWidth;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
      };

      // --- Processing Logic ---
      const ITEMS_PER_PAGE = 20;

      // 1. Process SALES
      if (!activeModule || activeModule === 'SALE') {
        const salesData = dashboardData.sales;
        if (salesData.length > 0) {
          // Calculate Grand Totals once
          const { totals: grandTotals } = generateRows(salesData);

          const totalPages = Math.ceil(salesData.length / ITEMS_PER_PAGE);
          for (let i = 0; i < totalPages; i++) {
            const batch = salesData.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);

            // On the very first rendering
            if (i > 0) pdf.addPage();

            await renderBatch('SALE', batch, i, totalPages, grandTotals);
          }
        } else if (activeModule === 'SALE') {
          // Empty state handling if needed
        }
      }

      // 2. Process PURCHASES
      if (!activeModule || activeModule === 'PURCHASE') {
        const purData = dashboardData.purchases;
        if (purData.length > 0) {
          // If we already added sales pages, we need a new page for purchase start 
          if ((!activeModule && dashboardData.sales.length > 0)) {
            pdf.addPage();
          }

          const { totals: grandTotals } = generateRows(purData);
          const totalPages = Math.ceil(purData.length / ITEMS_PER_PAGE);

          for (let i = 0; i < totalPages; i++) {
            const batch = purData.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
            if (i > 0) pdf.addPage();
            await renderBatch('PURCHASE', batch, i, totalPages, grandTotals);
          }
        }
      }

      document.body.removeChild(printContainer);
      pdf.save(`Ledger_Report_${engMonth}.pdf`);

    } catch (e) {
      console.error(e);
      alert("رپورٹ ڈاؤن لوڈ نہیں ہو سکی۔");
    } finally {
      setIsGeneratingGlobalPDF(false);
    }
  };

  if (isMigrating) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-16 h-16 text-emerald-600 animate-spin mb-6" />
        <h2 className="text-2xl font-black text-slate-800">ڈیٹا منتقل ہو رہا ہے...</h2>
        <p className="text-slate-500 mt-2 font-bold">{migrationStatus}</p>
        <p className="text-xs text-slate-400 mt-8">براہ کرم ایپ بند نہ کریں</p>
      </div>
    );
  }

  if (viewState === 'AUTH') {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-6 fade-in relative overflow-hidden">
        {/* Abstract Background Ornaments */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-100 rounded-full blur-[100px] opacity-50"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[100px] opacity-50"></div>

        <div className="w-full max-w-md bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-10 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.1)] border border-white relative z-10">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-emerald-600 rounded-[2rem] mx-auto flex items-center justify-center text-white shadow-2xl mb-6 transform rotate-3 hover:rotate-0 transition-transform duration-500">
              <Milk size={40} />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">رندھاوا ڈیری فارم</h1>
            <p className="text-slate-500 font-bold mt-4 text-base">
              {authMode === 'LOGIN' ? 'لاگ ان کریں' : 'نیا اکاؤنٹ بنائیں'}
            </p>
          </div>

          <div className="space-y-6">
            {authMode === 'SIGNUP' && (
              <div className="space-y-2">
                <label className="block text-right text-xs font-black text-slate-400 uppercase tracking-widest mr-2">پورا نام</label>
                <div className="relative group">
                  <input
                    type="text"
                    placeholder="اپنا نام لکھیں"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-right font-bold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none transition-all pr-14 text-base"
                  />
                  <UserIcon className="absolute top-1/2 right-5 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={20} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-right text-xs font-black text-slate-400 uppercase tracking-widest mr-2">صارف نام (Username)</label>
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Username لکھیں"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-right font-bold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none transition-all pr-14 text-base"
                />
                <UserIcon className="absolute top-1/2 right-5 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={20} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-right text-xs font-black text-slate-400 uppercase tracking-widest mr-2">پاس ورڈ (کم از کم 6 ہندسے)</label>
              <div className="relative group">
                <input
                  type="password"
                  placeholder="پاس ورڈ درج کریں"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl text-right font-bold text-slate-900 focus:bg-white focus:border-emerald-500 outline-none transition-all pr-14 text-base"
                />
                <Lock className="absolute top-1/2 right-5 -translate-y-1/2 text-slate-300 group-focus-within:text-emerald-500 transition-colors" size={20} />
              </div>
            </div>

            <button
              onClick={authMode === 'LOGIN' ? handleLogin : handleSignup}
              disabled={authLoading}
              className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg shadow-2xl hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-3 group mt-4 disabled:opacity-50"
            >
              {authLoading ? <Loader2 className="animate-spin" /> : (authMode === 'LOGIN' ? 'لاگ ان' : 'سائن اپ')}
              {!authLoading && <ArrowRight className="rotate-180 group-hover:translate-x-1 transition-transform" size={20} />}
            </button>

            <button
              onClick={() => { setAuthMode(authMode === 'LOGIN' ? 'SIGNUP' : 'LOGIN'); setPassword(''); }}
              className="w-full text-emerald-600 font-black text-sm hover:underline py-2"
            >
              {authMode === 'LOGIN' ? 'نیا اکاؤنٹ بنانا چاہتے ہیں؟' : 'پہلے سے اکاؤنٹ ہے؟ لاگ ان ہوں'}
            </button>
          </div>
        </div>
        <p className="mt-12 text-slate-400 text-xs font-black uppercase tracking-[0.3em] relative z-10">Randhawa Dairy & Cattle Farm</p>
      </div>
    );
  }

  if (viewState === 'MAIN_MENU') {
    return (
      <div className="min-h-screen bg-slate-50/50 flex flex-col items-center pb-20 fade-in overflow-x-hidden">
        {/* Top Navbar */}
        <div className="w-full bg-white px-8 py-4 flex justify-between items-center border-b border-slate-100 shadow-sm sticky top-0 z-50 backdrop-blur-md">
          <div className="bg-slate-50 px-4 py-2 rounded-full border border-slate-200 flex items-center gap-3 shadow-sm hover:border-emerald-300 transition-all cursor-pointer">
            <button onClick={() => changeMonth(-1)} className="p-1 text-emerald-600 hover:bg-white rounded-full transition-colors"><ChevronRight size={20} /></button>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-base font-black text-slate-800">{getMonthLabel(globalDate)}</span>
            </div>
            <button onClick={() => changeMonth(1)} className="p-1 text-emerald-600 rotate-180 hover:bg-white rounded-full transition-colors"><ChevronRight size={20} /></button>
          </div>

          <div className="flex items-center gap-6">
            <button onClick={handleLogout} className="p-3 bg-slate-50 text-rose-500 rounded-xl hover:bg-rose-50 hover:shadow-inner transition-all border border-slate-100">
              <LogOut size={20} />
            </button>
            <div className="text-right">
              <h1 className="text-lg font-black text-slate-900 tracking-tighter leading-none">رندھاوا ڈیری فارم</h1>
              <p className="text-[13] p-2 bg-slate-100 font-bold text-slate-500 mt-3 rounded-full">پروپرائیٹر: فرحان رندھاوا</p>
            </div>
          </div>
        </div>

        <div className="w-full max-w-6xl px-6 mt-8 space-y-8">

          {/* Centered Hero Section */}
          <div className="bg-white rounded-[3rem] p-12 border border-slate-100 shadow-[0_15px_45px_rgba(0,0,0,0.03)] relative overflow-hidden group text-center flex flex-col items-center justify-center mb-8">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[250px] bg-emerald-50/20 rounded-full blur-[100px] -translate-y-1/2"></div>

            <div className="relative z-10 space-y-8">
              <div className="flex items-center mb-5 justify-center gap-3">
                <span className="bg-emerald-100 text-emerald-700 text-xs py-1.5 px-6 rounded-full font-black uppercase tracking-widest">
                  خوش آمدید!
                </span>
                <Sparkles className="text-emerald-400" size={24} />
              </div>

              <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-tight">
                رندھاوا ڈیری اینڈ کیٹل فارم
              </h2>

              <p className="text-slate-500 mt-5 font-bold text-lg max-w-lg mx-auto leading-relaxed">
                آپ کے ڈیری فارم کا مکمل ڈیجیٹل ریکارڈ برائے{" "}
                <span className="text-slate-900 underline decoration-emerald-200 underline-offset-4 decoration-4">
                  {getMonthLabel(globalDate)}
                </span>
              </p>

              <div className="flex justify-center pt-4">
                <button
                  onClick={handleDownloadReport}
                  disabled={isGeneratingGlobalPDF}
                  className="bg-slate-900 text-white px-10 py-5 rounded-[2rem] font-black text-base flex items-center gap-4 hover:bg-slate-800 transition-all shadow-2xl active:scale-95 disabled:opacity-50"
                >
                  {isGeneratingGlobalPDF ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <Download size={24} />
                  )}
                  ماہانہ مجموعی رپورٹ ڈاؤن لوڈ کریں
                </button>
              </div>
            </div>
          </div>


          {/* Executive Dashboard Section */}
          <div className="space-y-6">

            {/* 1. Daily Balance Check (The "Smart" Dashboard) */}
            <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-100 shadow-xl shadow-slate-200/50 relative overflow-hidden">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight">آج کا جائزہ</h2>
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">روزانہ اسٹاک کی تفصیل</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 w-full md:w-auto">
                  <Calendar size={18} className="text-slate-400 ml-2" />
                  <input
                    type="date"
                    value={dailyDate}
                    onChange={(e) => setDailyDate(e.target.value)}
                    className="bg-transparent font-bold text-slate-700 outline-none w-full md:w-auto text-sm"
                  />
                </div>
              </div>

              {/* Grid with 5 Cards now (History added) - Updated 01/16/2026 01:28 AM */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 md:gap-6">
                {/* Previous Stock */}
                {/* Previous Stock (Editable) */}
                <div
                  onClick={() => setIsEditingStock(true)}
                  className="p-6 bg-slate-50 cursor-pointer hover:bg-slate-100 rounded-[2.5rem] border border-slate-200 flex flex-col items-center justify-center col-span-2 md:col-span-1 shadow-sm transition-colors group relative"
                >
                  {/* Visual Indicator for Edit */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-slate-200 p-1 rounded-md">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </div>
                  </div>

                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">
                    {dailyStats.openingStock !== undefined ? "ابتدائی (مینوئل)" : "ابتدائی (آٹو)"}
                  </p>

                  {isEditingStock ? (
                    <div className="flex items-center justify-center w-full" onClick={(e) => e.stopPropagation()}>
                      <input
                        autoFocus
                        type="number"
                        value={manualStockInput}
                        onChange={(e) => setManualStockInput(e.target.value)}
                        onBlur={() => {
                          // Optional: Auto-save on blur or just cancel? 
                          // Let's just cancel edit mode if empty or keep it open? 
                          // UX: better to have explicit save.
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateStock();
                          if (e.key === 'Escape') setIsEditingStock(false);
                        }}
                        className="w-20 text-center bg-white border border-emerald-300 rounded-lg text-lg font-black text-slate-800 outline-none p-1 shadow-inner"
                      />
                      <button
                        onClick={() => handleUpdateStock(false)}
                        className="ml-2 bg-emerald-500 text-white p-1.5 rounded-lg shadow-md hover:bg-emerald-600 active:scale-95 transition-all"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        title="Revert to Auto"
                        onClick={() => handleUpdateStock(true)}
                        className="ml-1 bg-slate-400 text-white p-1.5 rounded-lg shadow-md hover:bg-slate-500 active:scale-95 transition-all"
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className={`text-2xl md:text-3xl font-black ${dailyStats.prevStock < 0 ? 'text-blue-500' : 'text-slate-600'}`}>
                        {dailyStats.openingStock !== undefined ? dailyStats.openingStock : dailyStats.prevStock}
                      </p>
                      <p className="text-[10px] text-slate-300 font-bold">
                        تبدیل کریں
                      </p>
                    </>
                  )}
                </div>

                {/* Farm */}
                <div className="p-6 bg-gradient-to-br from-blue-50 to-white rounded-[2.5rem] border border-blue-100 shadow-sm flex flex-col items-center justify-center">
                  <div className="bg-blue-100 p-2 rounded-full mb-2">
                    <Tractor size={18} className="text-blue-600" />
                  </div>
                  <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-1">فارم</p>
                  <p className="text-2xl md:text-3xl font-black text-blue-700">{dailyStats.farm}</p>
                  <p className="text-[10px] text-blue-300 font-bold">لیٹر</p>
                </div>

                {/* Purchase */}
                <div
                  onClick={() => setDailyDetailMode('PURCHASE')}
                  className="p-6 bg-gradient-to-br from-rose-50 to-white rounded-[2.5rem] border border-rose-100 shadow-sm flex flex-col items-center justify-center cursor-pointer hover:shadow-md transition-all active:scale-95"
                >
                  <div className="bg-rose-100 p-2 rounded-full mb-2">
                    <History size={18} className="text-rose-600" />
                  </div>
                  <p className="text-[10px] text-rose-400 font-black uppercase tracking-widest mb-1">خریداری</p>
                  <p className="text-2xl md:text-3xl font-black text-rose-700">{dailyStats.purchase}</p>
                  <p className="text-[10px] text-rose-300 font-bold">لیٹر</p>
                </div>

                {/* Total Available (Today) */}
                <div className="p-6 bg-gradient-to-br from-slate-50 to-white rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-slate-200"></div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">کل دستیاب</p>
                  <p className="text-2xl md:text-3xl font-black text-slate-700">{totalAvailable}</p>
                  <p className="text-[10px] text-slate-300 font-bold">(فارم + خریداری)</p>
                </div>

                {/* Sales */}
                <div
                  onClick={() => setDailyDetailMode('SALE')}
                  className="p-6 bg-gradient-to-br from-emerald-50 to-white rounded-[2.5rem] border border-emerald-100 shadow-sm flex flex-col items-center justify-center relative cursor-pointer hover:shadow-md transition-all active:scale-95"
                >
                  <div className="bg-emerald-100 p-2 rounded-full mb-2">
                    <ShoppingCart size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] text-emerald-400 font-black uppercase tracking-widest mb-1">فروخت</p>
                  <p className="text-2xl md:text-3xl font-black text-emerald-700">{dailyStats.sale}</p>
                  <p className="text-[10px] text-emerald-300 font-bold">لیٹر</p>
                </div>
              </div>

              {/* Balance Bar - New Design */}
              <div className={`my-10 p-8 rounded-[2.5rem] border-2 ${netRemaining >= 0 ? 'bg-emerald-50/50 border-emerald-100' : 'bg-red-50/50 border-red-100'} flex items-center justify-between relative overflow-hidden transition-all duration-300`}>
                <div className={`absolute left-0 top-0 bottom-0 w-2 ${netRemaining >= 0 ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                <div className="flex items-center gap-4 pl-4">
                  <div className={`p-3 rounded-full shadow-sm ${netRemaining >= 0 ? 'bg-white text-emerald-600' : 'bg-white text-red-600'}`}>
                    {netRemaining >= 0 ? <Check size={24} strokeWidth={3} /> : <X size={24} strokeWidth={3} />}
                  </div>
                  <div>
                    <p className={`text-lg font-black ${netRemaining >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                      {netRemaining >= 0 ? "اسٹاک برابر ہے" : "اسٹاک کم ہے!"}
                    </p>
                    <p className="text-[11px] opacity-70 font-bold uppercase tracking-widest text-slate-500">اسٹیٹس</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-3xl font-black ${netRemaining >= 0 ? 'text-emerald-600' : 'text-red-600'} tracking-tight`}>
                    {netRemaining}
                  </p>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">بقایا / اگلا دن</p>
                </div>
              </div>

              {/* 2. Monthly Financials (Existing Cards) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* ... Keep existing Logic but slightly compacted ... */}
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 text-center">
                  <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-2">ماہانہ منافع</p>
                  <h3 className={`text-3xl font-black ${totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {totalProfit.toLocaleString()}<span className="text-xs text-slate-300 ml-1">PKR</span>
                  </h3>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 text-center">
                  <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-2">ماہانہ خریداری</p>
                  <h3 className="text-3xl font-black text-rose-600">
                    {totalPurchaseMonth.toLocaleString()}<span className="text-xs text-slate-300 ml-1">PKR</span>
                  </h3>
                </div>
                <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 text-center">
                  <p className="text-slate-400 font-black text-[10px] uppercase tracking-widest mb-2">ماہانہ فروخت</p>
                  <h3 className="text-3xl font-black text-emerald-600">
                    {totalSaleMonth.toLocaleString()}<span className="text-xs text-slate-300 ml-1">PKR</span>
                  </h3>
                </div>
              </div>

              {/* 3. Main Modules Navigation */}
              <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* FARM MODULE BUTTON */}
                <button
                  onClick={() => handleSelectModule('FARM')}
                  className="group relative bg-blue-600 p-8 rounded-[2.5rem] shadow-xl shadow-blue-100 hover:-translate-y-1 transition-all active:scale-95 text-right border-4 border-white overflow-hidden"
                >
                  <div className="relative z-10 flex flex-col justify-between h-full min-h-[140px]">
                    <div className="bg-white p-4 rounded-2xl text-blue-600 w-16 h-16 flex items-center justify-center shadow-lg mb-4">
                      <Tractor size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tighter">اپنا فارم (Farm)</h2>
                      <p className="text-blue-100 text-[10px] font-black uppercase mt-1 tracking-widest opacity-80">پیداوار کا ریکارڈ</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectModule('PURCHASE')}
                  className="group relative bg-rose-600 p-8 rounded-[2.5rem] shadow-xl shadow-rose-100 hover:-translate-y-1 transition-all active:scale-95 text-right border-4 border-white overflow-hidden"
                >
                  <div className="relative z-10 flex flex-col justify-between h-full min-h-[140px]">
                    <div className="bg-white p-4 rounded-2xl text-rose-600 w-16 h-16 flex items-center justify-center shadow-lg mb-4">
                      <Wallet size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tighter">خریداری (Purchase)</h2>
                      <p className="text-rose-100 text-[10px] font-black uppercase mt-1 tracking-widest opacity-80">سپلائرز کا ریکارڈ</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleSelectModule('SALE')}
                  className="group relative bg-emerald-600 p-8 rounded-[2.5rem] shadow-xl shadow-emerald-100 hover:-translate-y-1 transition-all active:scale-95 text-right border-4 border-white overflow-hidden"
                >
                  <div className="relative z-10 flex flex-col justify-between h-full min-h-[140px]">
                    <div className="bg-white p-4 rounded-2xl text-emerald-600 w-16 h-16 flex items-center justify-center shadow-lg mb-4">
                      <ShoppingCart size={32} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-white tracking-tighter">فروخت (Sale)</h2>
                      <p className="text-emerald-100 text-[10px] font-black uppercase mt-1 tracking-widest opacity-80">گاہکوں کا ریکارڈ</p>
                    </div>
                  </div>
                </button>
              </div>

            </div>

            {/* Payable / Receivable Lists Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-10">
              {/* Payables (Wajib-ul-Ada) - Money we owe to Suppliers */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-[32rem] flex flex-col">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><ArrowRight className="rotate-45" size={20} /></div>
                  <div className="text-right">
                    <h3 className="text-xl font-black text-slate-800">واجب الادا رقم</h3>
                    <p className="text-xs text-rose-500 font-black uppercase tracking-widest bg-rose-50 px-3 py-1 rounded-full inline-block mt-1">سپلائر</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {payableList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                      <p className="font-black text-xs uppercase tracking-widest">کوئی ریکارڈ نہیں</p>
                    </div>
                  ) : (
                    payableList.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-rose-200 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="text-rose-600 font-black text-lg">
                            {item.balance.toLocaleString()} <span className="text-[10px] text-slate-400">روپے</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-700 text-lg group-hover:text-rose-700 transition-colors">{item.name}</span>
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 font-black text-sm shadow-sm border border-slate-100 uppercase">
                            {item.name.charAt(0)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 text-center shrink-0">
                  <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">کل واجب الادا رقم</p>
                  <h2 className="text-3xl font-black text-rose-600 tracking-tighter">{totalPayable.toLocaleString()}</h2>
                </div>
              </div>

              {/* Receivables (Wasool Talab) - Money Customers owe us */}
              <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100 h-[32rem] flex flex-col">
                <div className="flex items-center justify-between mb-6 shrink-0">
                  <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><ArrowRight className="-rotate-45" size={20} /></div>
                  <div className="text-right">
                    <h3 className="text-xl font-black text-slate-800">وصول طلب رقم</h3>
                    <p className="text-xs text-emerald-500 font-black uppercase tracking-widest bg-emerald-50 px-3 py-1 rounded-full inline-block mt-1">گاہک</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {receivableList.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                      <p className="font-black text-xs uppercase tracking-widest">کوئی ریکارڈ نہیں</p>
                    </div>
                  ) : (
                    receivableList.map(item => (
                      <div key={item.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-emerald-200 transition-all group">
                        <div className="flex items-center gap-4">
                          <div className="text-emerald-600 font-black text-lg">
                            {item.balance.toLocaleString()} <span className="text-[10px] text-slate-400">روپے</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-black text-slate-700 text-lg group-hover:text-emerald-700 transition-colors">{item.name}</span>
                          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-slate-400 font-black text-sm shadow-sm border border-slate-100 uppercase">
                            {item.name.charAt(0)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-slate-100 text-center shrink-0">
                  <p className="text-xs text-slate-400 font-black uppercase tracking-widest mb-1">کل وصول طلب رقم</p>
                  <h2 className="text-3xl font-black text-emerald-600 tracking-tighter">{totalReceivable.toLocaleString()}</h2>
                </div>
              </div>
            </div>

          </div>

          {/* DAILY DETAIL MODAL */}
          {dailyDetailMode && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in zoom-in duration-200" onClick={() => setDailyDetailMode(null)}>
              <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100" onClick={e => e.stopPropagation()}>
                {/* Modal Header */}
                <div className={`p-8 border-b border-slate-100 flex items-center justify-between ${dailyDetailMode === 'SALE' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                  <button onClick={() => setDailyDetailMode(null)} className="p-3 bg-white/50 hover:bg-white rounded-2xl transition-all shadow-sm active:scale-95"><X size={20} className="text-slate-500" /></button>
                  <div className="text-right">
                    <h3 className={`text-2xl font-black ${dailyDetailMode === 'SALE' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {dailyDetailMode === 'SALE' ? 'فروخت کی تفصیل' : 'خریداری کی تفصیل'}
                    </h3>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${dailyDetailMode === 'SALE' ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{dailyDate}</p>
                    </div>
                  </div>
                </div>

                {/* Modal List */}
                <div className="max-h-[60vh] overflow-y-auto p-2 custom-scrollbar bg-slate-50/50">
                  {(() => {
                    const sourceData = dailyDetailMode === 'SALE' ? dashboardData.sales : dashboardData.purchases;

                    const list = sourceData.map(contact => {
                      const record = contact.records.find(r => r.date === dailyDate);
                      if (record && record.totalQuantity > 0) {
                        return { name: contact.name, record };
                      }
                      return null;
                    }).filter(item => item !== null) as { name: string, record: any }[];

                    if (list.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                          <div className="bg-slate-100 p-4 rounded-full mb-4">
                            <SearchX size={32} className="text-slate-300" />
                          </div>
                          <p className="font-bold text-lg text-slate-500">کوئی ریکارڈ موجود نہیں</p>
                          <p className="text-xs text-slate-400 mt-1">منتخب تاریخ کیلئے کوئی ڈیٹا نہیں ملا</p>
                        </div>
                      );
                    }

                    return (
                      <table className="w-full text-right text-sm border-separate border-spacing-y-2 px-2">
                        <thead>
                          <tr className="text-slate-400 text-xs uppercase tracking-widest">
                            <th className="p-3 font-bold">صبح</th>
                            <th className="p-3 font-bold text-center">شام</th>
                            <th className="p-3 font-bold text-center">کل</th>
                            <th className="p-3 font-bold text-right">نام</th>
                          </tr>
                        </thead>
                        <tbody>
                          {list.map((item, idx) => (
                            <tr key={idx} className="group hover:-translate-y-0.5 transition-transform duration-200">
                              <td className="p-4 bg-white rounded-l-2xl text-slate-500 font-medium border-y border-l border-slate-100 group-hover:border-slate-200 shadow-sm group-hover:shadow-md transition-all">
                                {item.record.morningQuantity || <span className="text-slate-300">-</span>}
                              </td>
                              <td className="p-4 bg-white text-center text-slate-500 font-medium border-y border-slate-100 group-hover:border-slate-200 shadow-sm group-hover:shadow-md transition-all">
                                {item.record.eveningQuantity || <span className="text-slate-300">-</span>}
                              </td>
                              <td className={`p-4 text-center font-black text-lg border-y border-slate-100 group-hover:border-slate-200 shadow-sm group-hover:shadow-md transition-all ${dailyDetailMode === 'SALE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {item.record.totalQuantity}
                              </td>
                              <td className="p-4 bg-white rounded-r-2xl font-bold text-slate-700 border-y border-r border-slate-100 group-hover:border-slate-200 shadow-sm group-hover:shadow-md transition-all flex items-center justify-end gap-3">
                                <span>{item.name}</span>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm ${dailyDetailMode === 'SALE' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-rose-400 to-rose-600'}`}>
                                  {item.name.charAt(0)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>

                {/* Modal Footer */}
                <div className="p-6 bg-white border-t border-slate-100 text-center flex justify-between items-center">
                  <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Total Items</span>
                  <span className={`text-xl font-black ${dailyDetailMode === 'SALE' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {dailyDetailMode === 'SALE' ?
                      dashboardData.sales.filter(c => c.records.some(r => r.date === dailyDate && r.totalQuantity > 0)).length :
                      dashboardData.purchases.filter(c => c.records.some(r => r.date === dailyDate && r.totalQuantity > 0)).length
                    }
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (viewState === 'DASHBOARD' && activeModule === 'FARM') {
    return (
      <FarmDashboard onBack={() => {
        setViewState('MAIN_MENU');
        setActiveModule(null);
      }} />
    );
  }

  if (viewState === 'PROFILE' && selectedContactId) {
    const contact = contacts.find(c => c.id === selectedContactId);
    if (contact) {
      return (
        <BuyerProfile
          buyer={contact}
          moduleType={activeModule!}
          selectedMonthDate={globalDate}
          onBack={() => {
            setViewState('DASHBOARD');
            setSelectedContactId(null);
          }}
          onUpdateBuyer={handleUpdateContact}
        />
      );
    }
  }

  return (
    <div className={`min-h-screen bg-slate-50/50 pb-20 fade-in`}>
      <header className="bg-white border-b border-slate-200 p-8 shadow-sm mb-10 relative">
        <button
          onClick={() => setViewState('MAIN_MENU')}
          className="absolute top-10 left-8 p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all z-20 active:scale-90"
        >
          <ChevronLeft size={24} className="text-slate-700" />
        </button>

        <button
          onClick={handleDownloadReport}
          disabled={isGeneratingGlobalPDF}
          className="absolute top-10 right-8 p-4 bg-slate-100 rounded-2xl hover:bg-slate-200 transition-all z-20 active:scale-90 flex items-center gap-2 text-slate-700 font-black text-xs"
        >
          {isGeneratingGlobalPDF ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
          PDF
        </button>

        <div className="text-center relative z-10">
          <h1 className="text-2xl font-black text-slate-900 mb-1">{theme.label}</h1>
          <div className="flex items-center justify-center gap-4">
            <span className="h-px w-14 bg-slate-100"></span>
            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.25em]">{getMonthLabel(globalDate)}</p>
            <span className="h-px w-14 bg-slate-100"></span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 max-w-md mx-auto mt-10 relative z-10">
          <div className="bg-slate-50 p-6 rounded-[2rem] text-center border border-slate-100 shadow-sm">
            <Milk className="mx-auto mb-2 text-slate-300" size={24} />
            <p className="text-slate-400 text-[10px] mb-1 font-black uppercase tracking-widest">مقدار (لیٹر)</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight">{totalMilk}</p>
          </div>
          <div className="bg-slate-50 p-6 rounded-[2rem] text-center border border-slate-100 shadow-sm">
            {isSale ? <DollarSign className={`mx-auto mb-2 text-emerald-400`} size={24} /> : <Wallet className={`mx-auto mb-2 text-rose-400`} size={24} />}
            <p className="text-slate-400 text-[10px] mb-1 font-black uppercase tracking-widest">{isSale ? 'آمدنی' : 'ادائیگی'}</p>
            <p className={`text-2xl font-black ${theme.accentColor} tracking-tight`}>{totalAmount.toLocaleString()}</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6">
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-4">
            <Users size={28} className="text-slate-400" />
            فہرست
          </h2>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadReport}
              disabled={isGeneratingGlobalPDF}
              className="bg-white text-slate-500 border border-slate-200 px-6 py-4 rounded-2xl hover:bg-slate-50 hover:text-slate-700 transition-all shadow-sm active:scale-95 disabled:opacity-50 flex items-center gap-2 font-black"
              title="Download PDF Report"
            >
              {isGeneratingGlobalPDF ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
              رپورٹ
            </button>

            {!isPastMonth && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className={`${theme.btnColor} text-white px-8 py-4 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl active:scale-95 transition-all hover:brightness-110`}
              >
                <Plus size={20} />
                نیا {theme.personLabel}
              </button>
            )}
          </div>

        </div>

        <div className="space-y-5">
          {contacts.length === 0 ? (
            <div className="text-center py-24 bg-white rounded-[3rem] border border-dashed border-slate-200">
              <Users className="mx-auto text-slate-100 mb-8" size={80} />
              <p className="text-slate-300 font-black uppercase tracking-[0.3em] text-xs">کوئی ریکارڈ نہیں ملا</p>
            </div>
          ) : (
            contacts.map(contact => {
              const balance = calculateMonthlyBalance(contact);
              return (
                <div
                  key={contact.id}
                  onClick={() => {
                    setSelectedContactId(contact.id);
                    setViewState('PROFILE');
                  }}
                  className={`bg-white p-6 rounded-[2rem] shadow-sm border border-transparent transition-all cursor-pointer hover:shadow-2xl ${theme.hoverBorder} active:scale-[0.99] flex items-center justify-between group`}
                >
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 ${isSale ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} rounded-2xl flex items-center justify-center font-black text-2xl shadow-sm group-hover:scale-110 transition-transform`}>
                      {contact.name.charAt(0)}
                    </div>
                    <div className="text-right">
                      <h3 className="text-xl font-black text-slate-800 leading-tight">{contact.name}</h3>
                      <div className="flex items-center gap-3 mt-2">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">ریٹ: {contact.pricePerLiter}</p>
                        {balance !== 0 && (
                          <span className={`text-[11px] font-black px-3 py-1 rounded-full ${balance > 0 ? (isSale ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700') : 'bg-slate-100 text-slate-700'}`}>
                            {balance > 0 ? 'باقی: ' : 'زیادہ: '}{Math.abs(balance).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isPastMonth && (
                    <button
                      onClick={(e) => openEditModal(contact, e)}
                      className={`p-4 text-slate-300 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition-colors active:scale-90`}
                    >
                      <Settings size={28} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Add Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-8 fade-in">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-12 shadow-2xl relative">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-slate-800">نیا {theme.personLabel}</h3>
              <button onClick={() => { setIsAddModalOpen(false); setNewContactName(''); setNewContactOpeningBalance(''); }} className="bg-slate-50 p-2 rounded-full text-slate-400 hover:text-slate-600 transition-all"><X size={24} /></button>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <p className="text-right text-xs font-black text-slate-400 mb-3 uppercase tracking-widest">{theme.personLabel} کا پورا نام</p>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full p-5 bg-slate-50 text-slate-900 rounded-2xl text-right text-xl font-black outline-none border border-slate-100 focus:bg-white focus:border-emerald-300 transition-all shadow-inner"
                  placeholder={`${theme.personLabel} کا نام`}
                  autoFocus
                />
              </div>

              <div>
                <p className="text-right text-xs font-black text-slate-400 mb-3 uppercase tracking-widest">سابقہ بیلنس (اگر کوئی ہے)</p>
                <input
                  type="number"
                  value={newContactOpeningBalance}
                  onChange={(e) => setNewContactOpeningBalance(e.target.value)}
                  className="w-full p-5 bg-slate-50 text-slate-900 rounded-2xl text-right text-xl font-black outline-none border border-slate-100 focus:bg-white focus:border-emerald-300 transition-all shadow-inner"
                  placeholder="0"
                />
                <p className="text-right text-[10px] text-slate-400 mt-2 font-bold px-1">
                  مثبت رقم = صارف نے پیسے دینے ہیں (وصول طلب) <br />
                  منفی رقم (-) = آپ نے پیسے دینے ہیں (واجب الادا)
                </p>
              </div>
            </div>
            <button
              onClick={handleAddContact}
              className={`w-full ${theme.btnColor} text-white py-6 rounded-2xl font-black text-xl shadow-2xl active:scale-95 transition-all`}
            >
              محفوظ کریں
            </button>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-8 fade-in">
          <div className="bg-white rounded-[3rem] w-full max-w-md p-12 shadow-2xl relative border-t-8 border-slate-900">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black text-slate-800 text-right w-full">نام کی تبدیلی</h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 absolute left-12 top-14 hover:text-slate-600 transition-all"><X size={28} /></button>
            </div>

            <div className="space-y-6">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full p-6 bg-slate-800 text-white rounded-2xl text-right text-3xl font-black outline-none shadow-2xl"
              />

              <div>
                <p className="text-right text-xs font-black text-slate-400 mb-2 uppercase tracking-widest">{theme.personLabel} کا سابقہ بیلنس</p>
                <input
                  type="number"
                  value={editOpeningBalance}
                  onChange={(e) => setEditOpeningBalance(e.target.value)}
                  className="w-full p-6 bg-slate-800 text-white rounded-2xl text-right text-3xl font-black outline-none shadow-2xl transition-all focus:ring-4 ring-slate-700"
                  placeholder="0"
                />
              </div>

              <button
                onClick={handleSaveEdit}
                className={`w-full ${theme.btnColor} text-white py-6 rounded-2xl font-black text-xl shadow-2xl active:scale-95 transition-all`}
              >
                محفوظ کریں
              </button>

              <button
                onClick={handleDeleteContact}
                className="w-full bg-rose-50 text-rose-600 py-6 rounded-2xl font-black text-base flex items-center justify-center gap-3 active:scale-95 transition-all border border-rose-100"
              >
                حذف کریں <Trash2 size={28} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
