
export interface MilkRecord {
  id: string;
  date: string; // ISO string YYYY-MM-DD
  morningQuantity: number;
  eveningQuantity: number;
  totalQuantity: number; // Sum of morning + evening
  totalPrice: number;
  pricePerLiter?: number; // Snapshot of price at time of record
  imageUrl?: string; // Optional URL for uploaded receipt/photo
  timestamp: number;
}

export interface Payment {
  id: string;
  amount: number;
  date: string;
  description?: string; // New field for payment notes
  timestamp: number;
}

export interface FarmRecord {
  id: string;
  date: string;
  morningQuantity: number;
  eveningQuantity: number;
  totalQuantity: number;
  openingStock?: number | null; // Manual daily opening balance
  timestamp: number;
}

export interface Contact {
  id: string;
  name: string;
  pricePerLiter: number;
  records: MilkRecord[];
  payments?: Payment[]; // Optional for backward compatibility
  openingBalance?: number; // Initial pending payment/arrears
  createdAt: number;
}

export type ModuleType = 'SALE' | 'PURCHASE' | 'FARM';
export type ViewState = 'AUTH' | 'MAIN_MENU' | 'DASHBOARD' | 'PROFILE';

export interface User {
  username: string;
  password: string;
  name: string;
}
