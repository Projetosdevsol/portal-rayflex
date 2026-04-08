/// <reference types="vite/client" />
import CryptoJS from 'crypto-js';

const SECRET_KEY = import.meta.env.VITE_ENCRYPTION_KEY || 'default-secret-key-change-me-in-production';

export const encryptData = (data: string): string => {
  if (!data) return '';
  return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
};

export const decryptData = (ciphertext: string): string => {
  if (!ciphertext) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    // If decrypted is empty but ciphertext wasn't, it might be plain text or wrong key
    return decrypted || ciphertext;
  } catch (error) {
    // If it's not valid AES or UTF-8, it's likely plain text
    return ciphertext;
  }
};
