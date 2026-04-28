/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MemoryMedia {
  url: string;
  type: 'image' | 'audio';
  name?: string;
}

export interface Memory {
  id: string;
  type: 'photo' | 'voice' | 'recipe';
  title: string;
  description: string;
  date: string;
  year: number;
  author: string;
  media: MemoryMedia[];
  star: boolean;
  userId: string;
}

export type Theme = 'elegant-light' | 'elegant-dark' | 'vintage';

export type Language = 'id' | 'en' | 'ar' | 'ja' | 'fr' | 'zh-TW' | 'es' | 'de' | 'it' | 'pt' | 'ko' | 'nl' | 'ru';

export const SUPPORTED_LANGUAGES: { code: Language; name: string }[] = [
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'en', name: 'English' },
  { code: 'ar', name: 'العربية' },
  { code: 'ja', name: '日本語' },
  { code: 'fr', name: 'Français' },
  { code: 'zh-TW', name: '繁體中文' },
  { code: 'es', name: 'Español' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'ko', name: '한국어' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'ru', name: 'Русский' },
];
