/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Lang = 'en' | 'ar';
export type Theme = 'light' | 'dark';
export type PhaseNumber = 1 | 2;

export interface TransactionRow {
  _origIdx: number;
  [key: string]: any;
}

export interface ExactMatch {
  bank: any;
  sys: any;
  amt: number;
}

export interface FuzzyMatchGroup {
  bankAmt: number;
  sysAmt: number;
  diff: number;
  bankRow: any;
  sysRow: any;
  _decKey: string;
}

export interface OtmMatchGroup {
  dir: string;
  sysRow: any;
  bankRows: any[];
  sysAmt: number;
  bankSum: number;
  diff: number;
  allCombos: number;
  reversed?: boolean;
  _decKey: string;
}

export interface ExactNetMatchGroup {
  dir: string;
  netSide: 'bank' | 'sys' | 'both';
  netRow_sys: any | null;
  netRow_bank: any | null;
  drRows: any[];
  crRows: any[];
  bankDrAmt?: number;
  bankCrAmt?: number;
  bankNet?: number;
  sysDrAmt?: number;
  sysCrAmt?: number;
  sysNet?: number;
  sysAmt?: number;
  bankAmt?: number;
  diff: number;
  _decKey: string;
}

export interface NetCrossMatchGroup {
  dir: string;
  netSide: 'bank' | 'sys' | 'both';
  netRow_sys: any | null;
  netRow_bank: any | null;
  bankDrRows?: any[];
  bankCrRows?: any[];
  drRows?: any[];
  crRows?: any[];
  bankDrAmt: number;
  bankCrAmt: number;
  bankNet: number;
  sysDrAmt?: number;
  sysCrAmt?: number;
  sysNet?: number;
  sysAmt?: number;
  bankAmt?: number;
  diff: number;
  _decKey: string;
}

export interface P2Match {
  type: '1-to-many' | 'fuzzy' | 'otm-fuzzy' | 'exact-net' | 'net';
  dir?: string;
  bankAmt: number;
  sysAmt: number;
  diff: number;
  bankRow: any;
  sysRow: any;
  _decKey: string;
}
