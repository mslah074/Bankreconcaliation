/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { X, Check, XSquare } from 'lucide-react';
import { Lang } from '../types';

interface TransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGroup: any;
  modalType: 'fuzzy' | 'otm' | 'otm-fuzzy' | 'exact-net' | 'net' | 'ai' | 'unified' | null;
  bankCols: string[];
  sysCols: string[];
  decisions: Record<string, 'accept' | 'reject'>;
  onDecision: (decision: 'accept' | 'reject') => void;
  lang: Lang;
  t: (key: string) => string;
}

export default function TransactionModal({
  isOpen,
  onClose,
  selectedGroup,
  modalType,
  bankCols,
  sysCols,
  decisions,
  onDecision,
  lang,
  t
}: TransactionModalProps) {
  if (!isOpen || !selectedGroup || !modalType) return null;

  const currentDecKey = selectedGroup._decKey;
  const dec = decisions[currentDecKey];

  // Helper inside component to render a single row details
  const renderDetailGrid = (row: any, cols: string[]) => {
    if (!row) return <div className="text-xs text-[var(--text3)]">—</div>;
    const INTERNAL = new Set(['_i', '_amt', '_isSys', '_المبلغ', '_المصدر', '_origIdx', '_status']);
    const keys = cols && cols.length 
      ? cols.filter(c => c in row) 
      : Object.keys(row).filter(k => !INTERNAL.has(k));

    return (
      <div className="detail-grid gap-2 text-xs">
        {keys.map(k => {
          const v = row[k];
          if (v === undefined || v === null || v === '') return null;
          const isNum = typeof v === 'number' || (!isNaN(parseFloat(String(v).replace(/,/g, ''))) && String(v).trim() !== '');
          return (
            <div key={k} className="detail-item bg-[var(--bg3)] border border-[var(--border)] rounded p-2 md:p-2.5">
              <div className="detail-key text-[10px] text-[var(--text3)] uppercase tracking-wider mb-0.5">{k}</div>
              <div className={`detail-val text-xs md:text-sm text-[var(--text)] font-semibold ${isNum ? 'mono font-mono text-[var(--blue-text)]' : ''}`}>
                {String(v)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // Helper to render multiple rows in a detail card
  const renderGroupList = (rows: any[], cols: string[]) => {
    const INTERNAL = new Set(['_i', '_amt', '_isSys', '_المبلغ', '_المصدر', '_origIdx', '_status']);
    return (
      <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
        {rows.map((r, idx) => {
          const keys = r && (cols && cols.length 
            ? cols.filter(c => c in r) 
            : Object.keys(r).filter(k => !INTERNAL.has(k))) || [];

          return (
            <div key={idx} className="bg-[var(--bg3)] border border-[var(--border)] rounded-lg p-2.5 md:p-3 shadow-none">
              <div className="text-[10px] font-bold text-[var(--teal)] mb-1 tracking-wider">ROW #{idx + 1}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {keys.map(k => {
                  const v = r[k];
                  if (v === undefined || v === null || v === '') return null;
                  const isNum = typeof v === 'number' || (!isNaN(parseFloat(String(v).replace(/,/g, ''))) && String(v).trim() !== '');
                  return (
                    <span key={k} className="inline-flex flex-col gap-0.5">
                      <span className="text-[10px] text-[var(--text3)] uppercase font-medium tracking-wider">{k}</span>
                      <span className={`text-[11px] md:text-[12px] font-semibold text-[var(--text)] ${isNum ? 'font-mono text-[var(--blue-text)]' : ''}`}>
                        {v}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div key={currentDecKey} className="modal-overlay fixed inset-0 bg-black/65 backdrop-blur-sm z-1000 flex items-center justify-center p-4" onClick={onClose}>
      <div className="modal-box bg-[var(--bg2)] border border-[var(--border2)] rounded-[14px] shadow-[var(--shadow-md)] w-full max-w-[680px] max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="modal-header flex items-center justify-between p-4 md:p-5 border-b border-[var(--border)] sticky top-0 bg-[var(--bg2)] z-10">
          <div className="modal-title font-bold text-[var(--text)] text-sm md:text-base flex items-center gap-2">
            <span>
              {modalType === 'fuzzy' ? '🔮' : modalType === 'exact-net' ? '🎯' : modalType === 'ai' ? '🤖' : modalType === 'unified' ? '⚡' : '⚖️'}
            </span>
            <span>
              {modalType === 'fuzzy' 
                ? t('modalTitleFuzzy')
                : modalType === 'exact-net'
                ? t('exactNetTitle')
                : modalType === 'net'
                ? t('modalTitleNet')
                : modalType === 'ai'
                ? t('aiTitle')
                : modalType === 'unified'
                ? (lang === 'ar' ? 'المطابقة المدمجة الذكية المرحلة 2' : 'Phase 2 Smart Unified Reconciliation')
                : t('modalTitleOtm')
              }
            </span>
          </div>
          <button className="modal-close flex items-center justify-center w-8 h-8 rounded border border-[var(--border)] bg-[var(--bg3)] text-[var(--text2)] hover:bg-[var(--red-dim)] hover:text-[var(--red)] cursor-pointer" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body p-4 md:p-6 overflow-y-auto flex-1 text-xs">
          <div className="flex items-center gap-2.5 mb-5 flex-wrap">
            <span className={`match-type-badge text-xs px-3 py-1 font-bold rounded ${
              modalType === 'fuzzy' ? 'match-type-fuzzy text-[var(--violet-text)] fill-[var(--violet-dim)] border border-[var(--violet)]' :
              modalType === 'exact-net' ? 'match-type-p1 text-[var(--green-text)] bg-[var(--green-dim)] border border-[var(--green)]' :
              modalType === 'ai' ? 'text-[var(--violet-text)] bg-[var(--violet-dim)] border border-[var(--violet)]' :
              modalType === 'unified' ? 'text-[var(--blue-text)] bg-[var(--blue-dim)] border border-[var(--blue)]' :
              'match-type-otm text-[var(--teal)] bg-[var(--teal-dim)] border border-[var(--teal)]'
            }`}>
              {modalType === 'ai' 
                ? `${t('statusAi')} (${selectedGroup.confidence}% ${t('aiConfidence')})` 
                : modalType === 'unified'
                ? `${lang === 'ar' ? 'مطابقة ذكية مدمجة' : 'Smart Unified'} (${selectedGroup.score || selectedGroup.confidence}% ${t('aiConfidence')})`
                : (selectedGroup.dir || (modalType === 'fuzzy' ? 'Fuzzy Match' : modalType === 'exact-net' ? 'Exact Net-Match' : 'Group Match'))
              }
            </span>
            
            {selectedGroup.diff > 0.005 && (
              <span className="diff-badge inline-flex items-center text-xs px-2.5 py-1 font-bold rounded-full bg-[var(--amber-dim)] border border-[var(--amber)] text-[var(--amber-text)] font-mono">
                {t('modalDiff')}: ±{selectedGroup.diff}
              </span>
            )}
          </div>

          {/* OTM / OTM-fuzzy visual branch logic */}
          {(modalType === 'otm' || modalType === 'otm-fuzzy') ? (
            <>
              {/* Gross vs Single row split representation */}
              <div className="modal-section mb-5">
                <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  🏦 {selectedGroup.reversed ? t('sysRowTag') + ' (Multiple)' : t('bankRowTag') + ' (Multiple)'}
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
                {selectedGroup.bankRows && selectedGroup.bankRows.length > 1 ? (
                  renderGroupList(selectedGroup.bankRows, selectedGroup.reversed ? sysCols : bankCols)
                ) : (
                  renderDetailGrid(selectedGroup.bankRows?.[0] || {}, selectedGroup.reversed ? sysCols : bankCols)
                )}
              </div>

              <div className="modal-section mb-5">
                <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  🗄️ {selectedGroup.reversed ? t('bankRowTag') + ' (Single)' : t('sysRowTag') + ' (Single)'}
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
                {renderDetailGrid(selectedGroup.sysRow, selectedGroup.reversed ? bankCols : sysCols)}
              </div>
            </>
          ) : (modalType === 'net' || modalType === 'exact-net') ? (
            <>
              {selectedGroup.netSide === 'bank' ? (
                <>
                  <div className="modal-section mb-5">
                    <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🏦 {t('bankRowTag')} (Gross — Dr+Cr)
                      <div className="flex-1 h-px bg-[var(--border)]"></div>
                    </div>
                    {selectedGroup.grossRows_bank ? (
                      renderDetailGrid(selectedGroup.grossRows_bank[0], bankCols)
                    ) : (
                      renderGroupList([...(selectedGroup.drRows || []), ...(selectedGroup.crRows || [])], bankCols)
                    )}
                  </div>
                  <div className="modal-section mb-5">
                    <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🗄️ {t('sysRowTag')} (Net)
                      <div className="flex-1 h-px bg-[var(--border)]"></div>
                    </div>
                    {renderDetailGrid(selectedGroup.netRow_sys || selectedGroup.netRow, sysCols)}
                  </div>
                </>
              ) : selectedGroup.netSide === 'both' ? (
                <>
                  <div className="modal-section mb-5">
                    <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🏦 {t('bankRowTag')} (Gross — Dr+Cr)
                      <div className="flex-1 h-px bg-[var(--border)]"></div>
                    </div>
                    {renderGroupList([...(selectedGroup.bankDrRows || []), ...(selectedGroup.bankCrRows || [])], bankCols)}
                  </div>
                  <div className="modal-section mb-5">
                    <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🗄️ {t('sysRowTag')} (Gross — Dr+Cr)
                      <div className="flex-1 h-px bg-[var(--border)]"></div>
                    </div>
                    {renderGroupList([...(selectedGroup.drRows || []), ...(selectedGroup.crRows || [])], sysCols)}
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-section mb-5">
                    <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🏦 {t('bankRowTag')} (Net)
                      <div className="flex-1 h-px bg-[var(--border)]"></div>
                    </div>
                    {renderDetailGrid(selectedGroup.netRow_bank || selectedGroup.netRow, bankCols)}
                  </div>
                  <div className="modal-section mb-5">
                    <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      🗄️ {t('sysRowTag')} (Gross — Dr+Cr)
                      <div className="flex-1 h-px bg-[var(--border)]"></div>
                    </div>
                    {selectedGroup.grossRows_sys ? (
                      renderDetailGrid(selectedGroup.grossRows_sys[0], sysCols)
                    ) : (
                      renderGroupList([...(selectedGroup.drRows || []), ...(selectedGroup.crRows || [])], sysCols)
                    )}
                  </div>
                </>
              )}
            </>
          ) : (modalType === 'ai' || modalType === 'unified') ? (
            <>
              {/* AI/Unified Reasoning */}
              <div className={`${modalType === 'unified' ? 'bg-[var(--blue-dim)]/40 border border-[var(--blue)]/40' : 'bg-[var(--violet-dim)]/40 border border-[var(--violet)]/40'} rounded-lg p-3.5 mb-5 flex flex-col gap-1.5 animate-in fade-in`}>
                <div className={`font-semibold ${modalType === 'unified' ? 'text-[var(--blue-text)]' : 'text-[var(--violet-text)]'} text-xs flex items-center gap-1.5`}>
                  <span>💡 {modalType === 'unified' ? (lang === 'ar' ? 'تفاصيل المطابقة المدمجة' : 'Unified Match Details') : t('aiReason')}:</span>
                </div>
                <p className="text-xs text-[var(--text)] italic leading-relaxed">
                  {lang === 'ar' ? selectedGroup.reasonAr : selectedGroup.reasonEn}
                </p>
              </div>

              <div className="modal-section mb-5">
                <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  🏦 {t('modalBankLabel')}
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
                {selectedGroup.bankRows && selectedGroup.bankRows.length > 0 ? (
                  renderGroupList(selectedGroup.bankRows, bankCols)
                ) : (
                  renderDetailGrid(selectedGroup.bankRow || {}, bankCols)
                )}
              </div>

              <div className="modal-section mb-5">
                <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  🗄️ {t('modalSysLabel')}
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
                {selectedGroup.sysRows && selectedGroup.sysRows.length > 0 ? (
                  renderGroupList(selectedGroup.sysRows, sysCols)
                ) : (
                  renderDetailGrid(selectedGroup.sysRow || {}, sysCols)
                )}
              </div>
            </>
          ) : (
            // standard fuzzy layout
            <>
              <div className="modal-section mb-5">
                <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  🏦 {t('modalBankLabel')}
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
                {renderDetailGrid(selectedGroup.bankRow, bankCols)}
              </div>

              <div className="modal-section mb-5">
                <div className="modal-section-title text-[11px] font-bold text-[var(--text3)] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  🗄️ {t('modalSysLabel')}
                  <div className="flex-1 h-px bg-[var(--border)]"></div>
                </div>
                {renderDetailGrid(selectedGroup.sysRow, sysCols)}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="modal-footer flex gap-3 p-4 md:p-5 border-t border-[var(--border)] bg-[var(--bg3)] justify-between items-center rounded-b-xl">
          <div className="text-xs text-[var(--text3)] font-mono">
            {dec ? (dec === 'accept' ? 'Current: Accepted' : 'Current: Rejected') : 'Current: Pending'}
          </div>
          <div className="flex gap-2">
            <button
              className={`btn px-5 py-2 text-sm rounded flex items-center gap-1.5 font-bold cursor-pointer hover:opacity-90 ${
                dec === 'accept'
                  ? 'bg-[var(--green)] text-white border-[var(--green)] shadow-lg'
                  : 'bg-[var(--bg2)] text-[var(--text)] border-[var(--border)]'
              }`}
              onClick={() => onDecision('accept')}
            >
              <Check size={16} />
              <span>{t('modalAccept')}</span>
            </button>
            <button
              className={`btn px-5 py-2 text-sm rounded flex items-center gap-1.5 font-bold cursor-pointer hover:opacity-95 ${
                dec === 'reject'
                  ? 'bg-[var(--red)] text-white border-[var(--red)]'
                  : 'bg-[var(--red-dim)] text-[var(--red-text)] border-[var(--red)]'
              }`}
              onClick={() => onDecision('reject')}
            >
              <XSquare size={16} />
              <span>{t('modalReject')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
