/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sun, Moon, Languages } from 'lucide-react';
import { Lang, Theme } from '../types';

interface HeaderProps {
  lang: Lang;
  setLang: (lang: Lang) => void;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  t: (key: string) => string;
}

export default function Header({ lang, setLang, theme, setTheme, t }: HeaderProps) {
  return (
    <header className="header flex justify-between items-center px-4 md:px-8 bg-[var(--bg2)] border-b border-[var(--border)] h-[60px] sticky top-0 z-100 shadow-[var(--shadow)]">
      <div className="flex items-center gap-2.5 logo">
        <div className="logo-icon bg-gradient-to-br from-[var(--blue)] to-[var(--teal)] text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold">
          ⚖️
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-[15px] text-[var(--text)]" id="lblAppTitle">
            {t('appTitle')}
          </span>
          <span className="signature-line text-[10px] text-[var(--text3)] font-mono opacity-85">
            Created by <strong className="text-[var(--blue-text)] font-semibold font-mono">Mostafa Salaheldin</strong> &nbsp;·&nbsp; With assistance of AI
          </span>
        </div>
      </div>
      
      <div className="header-right flex items-center gap-2.5">
        {/* Language selector toggle */}
        <div className="toggle-group bg-[var(--bg3)] border border-[var(--border)] rounded-lg p-0.5 flex gap-1 items-center">
          <button
            className={`toggle-btn px-2.5 py-1 text-xs font-semibold cursor-pointer rounded-md ${
              lang === 'en' ? 'active bg-[var(--bg2)] text-[var(--text)] font-bold border border-[var(--border)] shadow-sm' : 'text-[var(--text2)]'
            }`}
            onClick={() => setLang('en')}
            id="btnLangEn"
          >
            EN
          </button>
          <button
            className={`toggle-btn px-2.5 py-1 text-xs font-semibold cursor-pointer rounded-md ${
              lang === 'ar' ? 'active bg-[var(--bg2)] text-[var(--text)] font-bold border border-[var(--border)] shadow-sm' : 'text-[var(--text2)]'
            }`}
            onClick={() => setLang('ar')}
            id="btnLangAr"
          >
            AR
          </button>
        </div>

        {/* Theme selectors */}
        <div className="toggle-group bg-[var(--bg3)] border border-[var(--border)] rounded-lg p-0.5 flex gap-1 items-center">
          <button
            className={`toggle-btn p-1 text-xs cursor-pointer rounded-md flex items-center justify-center ${
              theme === 'light' ? 'bg-[var(--bg2)] border border-[var(--border)] shadow-sm' : 'text-[var(--text2)]'
            }`}
            onClick={() => setTheme('light')}
            id="btnLight"
            title="Light Theme"
          >
            <Sun size={14} className="text-amber-500" />
          </button>
          <button
            className={`toggle-btn p-1 text-xs cursor-pointer rounded-md flex items-center justify-center ${
              theme === 'dark' ? 'bg-[var(--bg2)] border border-[var(--border)] shadow-sm' : 'text-[var(--text2)]'
            }`}
            onClick={() => setTheme('dark')}
            id="btnDark"
            title="Dark Theme"
          >
            <Moon size={14} className="text-violet-400" />
          </button>
        </div>

        <span className="header-badge text-xs px-2.5 py-0.5 rounded-full bg-[var(--bg4)] border border-[var(--border)] text-[var(--text2)] font-mono">
          v8.0 (Worker Mode)
        </span>
      </div>
    </header>
  );
}
