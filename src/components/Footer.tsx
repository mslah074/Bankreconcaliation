/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface FooterProps {
  t: (key: string) => string;
}

export default function Footer({ t }: FooterProps) {
  return (
    <footer className="page-footer mt-16 p-8 border-t border-[var(--border)] flex flex-col items-center gap-1.5 text-center">
      <div className="footer-logo flex items-center gap-2">
        <div className="footer-icon w-7 h-7 bg-gradient-to-br from-[var(--blue)] to-[var(--teal)] rounded-lg flex items-center justify-center text-sm opacity-85">
          ⚖️
        </div>
        <span className="footer-title text-xs font-semibold text-[var(--text2)]">
          {t('appTitle')}
        </span>
      </div>
      <div className="footer-credit text-[11px] text-[var(--text3)] font-mono tracking-wider flex items-center gap-1.5">
        <span>Created by</span>
        <strong className="text-[var(--blue-text)] font-semibold font-mono">Mostafa Salaheldin</strong>
        <span className="footer-divider text-[var(--border)] text-sm">·</span>
        <span>With assistance of AI</span>
      </div>
    </footer>
  );
}
