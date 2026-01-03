import { Contact } from './types';

const STORAGE_KEY_SALE = 'randhawa_sale_v2';
const STORAGE_KEY_PURCHASE = 'randhawa_purchase_v2';

export const loadContacts = (type: 'SALE' | 'PURCHASE'): Contact[] => {
  try {
    const key = type === 'SALE' ? STORAGE_KEY_SALE : STORAGE_KEY_PURCHASE;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error(`Error loading ${type} data`, e);
    return [];
  }
};

export const saveContacts = (type: 'SALE' | 'PURCHASE', contacts: Contact[]) => {
  try {
    const key = type === 'SALE' ? STORAGE_KEY_SALE : STORAGE_KEY_PURCHASE;
    localStorage.setItem(key, JSON.stringify(contacts));
  } catch (e) {
    console.error(`Error saving ${type} data`, e);
  }
};

export const formatUrduDate = (dateStr: string): string => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'];
  const dayName = days[date.getDay()];
  return `${d} - ${dayName}`;
};

export const getMonthLabel = (date: Date): string => {
  const months = [
    'جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون',
    'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};

export const getEnglishMonthLabel = (date: Date): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
};
