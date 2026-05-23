/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useMemo, ChangeEvent } from 'react';
import * as XLSX from 'xlsx';
import { 
  Play, RefreshCw, Upload, Download, Eye, Award, CheckCircle, ChevronRight, Loader, Check, AlertTriangle, ArrowRightLeft, FileSpreadsheet, Info, Sparkles, X
} from 'lucide-react';

import Header from './components/Header';
import Footer from './components/Footer';
import TransactionModal from './components/TransactionModal';
import { T } from './translations';
import { 
  Lang, Theme, PhaseNumber, TransactionRow, ExactMatch, 
  FuzzyMatchGroup, OtmMatchGroup, ExactNetMatchGroup, NetCrossMatchGroup, P2Match 
} from './types';

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const [theme, setTheme] = useState<Theme>('light');
  
  // Navigation
  const [phase, setPhase] = useState<PhaseNumber>(1);
  const [isPhase2Locked, setIsPhase2Locked] = useState<boolean>(true);

  // Raw Statements State
  const [bankData, setBankData] = useState<any[]>([]);
  const [sysData, setSysData] = useState<any[]>([]);
  const [bankCols, setBankCols] = useState<string[]>([]);
  const [sysCols, setSysCols] = useState<string[]>([]);
  const [bankFileName, setBankFileName] = useState<string>('');
  const [sysFileName, setSysFileName] = useState<string>('');
  const [bankWB, setBankWB] = useState<any>(null);
  const [sysWB, setSysWB] = useState<any>(null);

  // Column Selectors
  const [bankMapping, setBankMapping] = useState({ debit: '', credit: '', date: '', desc: '' });
  const [sysMapping, setSysMapping] = useState({ debit: '', credit: '', date: '', desc: '' });

  // Phase 1 (Exact Match) Results
  const [isReconciliationRan, setIsReconciliationRan] = useState(false);
  const [matched, setMatched] = useState<ExactMatch[]>([]);
  const [bankOnly, setBankOnly] = useState<any[]>([]);
  const [sysOnly, setSysOnly] = useState<any[]>([]);

  // Phase 2 State (unmutated origins)
  const [p2BankOrig, setP2BankOrig] = useState<TransactionRow[]>([]);
  const [p2SysOrig, setP2SysOrig] = useState<TransactionRow[]>([]);
  
  // Decisions storage per match key
  const [decisions, setDecisions] = useState<Record<string, 'accept' | 'reject'>>({});
  
  // Phase 2 Accumulated Matches
  const [p2Matches, setP2Matches] = useState<P2Match[]>([]);
  const [unifiedMatchGroups, setUnifiedMatchGroups] = useState<any[]>([]);

  // Specific Matchers results
  const [otmMatchGroups, setOtmMatchGroups] = useState<OtmMatchGroup[]>([]);
  const [otmCombosCount, setOtmCombosCount] = useState<number>(0);

  const [fuzzyMatchGroups, setFuzzyMatchGroups] = useState<FuzzyMatchGroup[]>([]);
  const [fuzzyTol, setFuzzyTol] = useState<number>(5);

  const [otmFuzzyMatchGroups, setOtmFuzzyMatchGroups] = useState<OtmMatchGroup[]>([]);
  const [otmFuzzyCombosCount, setOtmFuzzyCombosCount] = useState<number>(0);
  const [otmFuzzyTol, setOtmFuzzyTol] = useState<number>(5);

  const [exactNetMatchGroups, setExactNetMatchGroups] = useState<ExactNetMatchGroup[]>([]);

  const [netMatchGroups, setNetMatchGroups] = useState<NetCrossMatchGroup[]>([]);
  const [netCombosCount, setNetCombosCount] = useState<number>(0);
  const [netTol, setNetTol] = useState<number>(1);

  // AI Matching States
  const [aiMatchGroups, setAiMatchGroups] = useState<any[]>([]);
  const [allAiMatchGroups, setAllAiMatchGroups] = useState<any[]>([]);
  const [isAiCalculating, setIsAiCalculating] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [clientApiKey, setClientApiKey] = useState(() => localStorage.getItem("user_gemini_api_key") || ((import.meta as any).env?.VITE_GEMINI_API_KEY || "AIzaSyA5_euN5C6oTN6ussX2PXnLiIzE8-_nrs4"));
  const [showKeyInput, setShowKeyInput] = useState(false);

  // Web Worker States
  const [isWorkerCalculating, setIsWorkerCalculating] = useState<boolean>(false);
  const [currentWorkerTask, setCurrentWorkerTask] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<any>(null);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(-1);
  const [modalType, setModalType] = useState<'fuzzy' | 'otm' | 'otm-fuzzy' | 'exact-net' | 'net' | 'ai' | null>(null);

  // Setup client translation helper
  const t = (key: string) => {
    return (T[lang] || T.en)[key as keyof typeof T.en] || key;
  };

  // Sync lang dir in HTML document
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  // Sync theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Create clean instance of Web Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('./reconciliation.worker.ts', import.meta.url),
      { type: 'module' }
    );

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Web Worker communication link
  const triggerWorkerMatch = (
    type: 'unified' | 'one-to-many' | 'fuzzy' | 'otm-fuzzy' | 'exact-net' | 'net-cross',
    tolValue?: number
  ) => {
    if (!workerRef.current) return;

    const bd = bankMapping.debit;
    const bc = bankMapping.credit;
    const sd = sysMapping.debit;
    const sc = sysMapping.credit;

    // Get fresh remaining list (orig minus currently ACCEPTED groups)
    const payload = {
      type,
      bankRem,
      sysRem,
      bd,
      bc,
      sd,
      sc,
      bankMapping,
      sysMapping,
      tol: tolValue
    };

    setIsWorkerCalculating(true);
    setCurrentWorkerTask(type);

    workerRef.current.postMessage(payload);

    workerRef.current.onmessage = (e: MessageEvent) => {
      setIsWorkerCalculating(false);
      setCurrentWorkerTask(null);

      const response = e.data;
      if (!response.success) {
        alert(lang === 'ar' ? `خطأ أثناء المطابقة: ${response.error}` : `Error during match computation: ${response.error}`);
        return;
      }

      const { groups, fMatches, combosCount, p2Matches: newP2Matches } = response;

      // Map specific outcomes
      if (type === 'unified') {
        setUnifiedMatchGroups(groups || []);
        setP2Matches(prev => {
          const filtered = prev.filter(x => x.type !== 'unified');
          return [...filtered, ...(newP2Matches || [])];
        });
      } else if (type === 'one-to-many') {
        const dkToClear = (groups || []).map((g: any) => g._decKey);
        setOtmMatchGroups(groups || []);
        setOtmCombosCount(combosCount || 0);

        // Pre-fill decisions as pending (no explicit accept till reviewed)
        const newDecs = { ...decisions };
        dkToClear.forEach((k: string) => {
          if (newDecs[k] === undefined) {
             // Let it be pending review
          }
        });
        setDecisions(newDecs);

        setP2Matches(prev => {
          const filtered = prev.filter(x => x.type !== '1-to-many');
          return [...filtered, ...newP2Matches];
        });
      } else if (type === 'fuzzy') {
        setFuzzyMatchGroups(fMatches || []);
        setP2Matches(prev => {
          const filtered = prev.filter(x => x.type !== 'fuzzy');
          return [...filtered, ...newP2Matches];
        });
      } else if (type === 'otm-fuzzy') {
        setOtmFuzzyMatchGroups(groups || []);
        setOtmFuzzyCombosCount(combosCount || 0);
        setP2Matches(prev => {
          const filtered = prev.filter(x => x.type !== 'otm-fuzzy');
          return [...filtered, ...newP2Matches];
        });
      } else if (type === 'exact-net') {
        setExactNetMatchGroups(groups || []);
        setP2Matches(prev => {
          const filtered = prev.filter(x => x.type !== 'exact-net');
          return [...filtered, ...newP2Matches];
        });
      } else if (type === 'net-cross') {
        setNetMatchGroups(groups || []);
        setNetCombosCount(combosCount || 0);
        setP2Matches(prev => {
          const filtered = prev.filter(x => x.type !== 'net');
          return [...filtered, ...newP2Matches];
        });
      }
    };
  };

  // Compute Remaining items reactively (orig minus currently ACCEPTED groups)
  const { bankRem, sysRem } = useMemo(() => {
    const usedBank = new Set<number>();
    const usedSys = new Set<number>();

    const markAccepted = (
      groupArr: any[],
      getBankIdxs: (g: any) => number[],
      getSysIdxs: (g: any) => number[]
    ) => {
      (groupArr || []).forEach(g => {
        if (decisions[g._decKey] === 'accept') {
          getBankIdxs(g).forEach(i => usedBank.add(i));
          getSysIdxs(g).forEach(i => usedSys.add(i));
        }
      });
    };

    markAccepted(
      fuzzyMatchGroups,
      g => [g.bankRow?._origIdx].filter(x => x != null),
      g => [g.sysRow?._origIdx].filter(x => x != null)
    );

    markAccepted(
      otmMatchGroups,
      g => g.reversed ? [g.sysRow?._origIdx].filter(x => x != null) : (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null),
      g => g.reversed ? (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null) : [g.sysRow?._origIdx].filter(x => x != null)
    );

    markAccepted(
      otmFuzzyMatchGroups,
      g => g.reversed ? [g.sysRow?._origIdx].filter(x => x != null) : (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null),
      g => g.reversed ? (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null) : [g.sysRow?._origIdx].filter(x => x != null)
    );

    markAccepted(
      exactNetMatchGroups,
      g => {
        if (g.netSide === 'both') return [...(g.bankDrRows || []), ...(g.bankCrRows || [])].map(r => r._origIdx).filter(x => x != null);
        if (g.netSide === 'bank') return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
        return [g.netRow_bank?._origIdx].filter(x => x != null);
      },
      g => {
        if (g.netSide === 'both') return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
        if (g.netSide === 'sys') return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
        return [g.netRow_sys?._origIdx].filter(x => x != null);
      }
    );

    markAccepted(
      netMatchGroups,
      g => {
        if (g.netSide === 'both') {
          return [...(g.bankDrRows || []), ...(g.bankCrRows || [])].map((r: any) => r._origIdx).filter((x: any) => x != null);
        }
        if (g.netSide === 'bank') {
          if (g.grossRows_bank) return g.grossRows_bank.map((r: any) => r._origIdx).filter((x: any) => x != null);
          return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
        }
        return [g.netRow_bank?._origIdx || g.netRow?._origIdx].filter(x => x != null);
      },
      g => {
        if (g.netSide === 'both') {
          return [...(g.drRows || []), ...(g.crRows || [])].map((r: any) => r._origIdx).filter((x: any) => x != null);
        }
        if (g.netSide === 'sys') {
          if (g.grossRows_sys) return g.grossRows_sys.map((r: any) => r._origIdx).filter((x: any) => x != null);
          return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
        }
        return [g.netRow_sys?._origIdx || g.netRow?._origIdx].filter(x => x != null);
      }
    );

    markAccepted(
      allAiMatchGroups,
      g => g.bankOrigIdxs || [],
      g => g.sysOrigIdxs || []
    );

    markAccepted(
      unifiedMatchGroups,
      g => (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null),
      g => (g.sysRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null)
    );

    return {
      bankRem: p2BankOrig.filter(r => !usedBank.has(r._origIdx)),
      sysRem: p2SysOrig.filter(r => !usedSys.has(r._origIdx))
    };
  }, [
    p2BankOrig,
    p2SysOrig,
    decisions,
    fuzzyMatchGroups,
    otmMatchGroups,
    otmFuzzyMatchGroups,
    exactNetMatchGroups,
    netMatchGroups,
    aiMatchGroups,
    allAiMatchGroups,
    unifiedMatchGroups
  ]);

  // Compute Accepted Match lists for export
  const acceptedBankRows = useMemo(() => {
    const rows: any[] = [];
    const getLabel = (type: string, diff?: number, dir?: string) => {
      if (type === 'fuzzy') return t('statusFuzzy') + diff + t('statusPhase2');
      if (type === 'otm-fuzzy') return t('statusOtmFuzzy') + diff + t('statusPhase2');
      if (type === 'exact-net') return t('statusExactNet') + t('statusPhase2');
      if (type === 'net') return t('statusNet') + diff + t('statusPhase2');
      return t('statusOtm') + ' (' + dir + ')' + t('statusPhase2');
    };

    const iterGroups = (groupArr: any[], cb: (g: any) => void) => {
      (groupArr || []).forEach(g => {
        if (decisions[g._decKey] === 'accept') cb(g);
      });
    };

    iterGroups(fuzzyMatchGroups, g => {
      if (g.bankRow) rows.push({ row: g.bankRow, label: getLabel('fuzzy', g.diff) });
    });

    iterGroups(otmMatchGroups, g => {
      if (g.reversed) {
        if (g.sysRow) rows.push({ row: g.sysRow, label: getLabel('otm', undefined, g.dir) });
      } else {
        (g.bankRows || []).forEach((b: any) => rows.push({ row: b, label: getLabel('otm', undefined, g.dir) }));
      }
    });

    iterGroups(otmFuzzyMatchGroups, g => {
      if (g.reversed) {
        if (g.sysRow) rows.push({ row: g.sysRow, label: getLabel('otm-fuzzy', g.diff) });
      } else {
        (g.bankRows || []).forEach((b: any) => rows.push({ row: b, label: getLabel('otm-fuzzy', g.diff) }));
      }
    });

    iterGroups(exactNetMatchGroups, g => {
      const lbl = t('statusExactNet') + t('statusPhase2');
      if (g.netSide === 'both') {
        (g.bankDrRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        (g.bankCrRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
      } else if (g.netSide === 'bank') {
        (g.drRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        (g.crRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
      } else {
        const netBankRow = g.netRow_bank;
        if (netBankRow) rows.push({ row: netBankRow, label: lbl });
      }
    });

    iterGroups(netMatchGroups, g => {
      const lbl = getLabel('net', g.diff);
      if (g.netSide === 'both') {
        (g.bankDrRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        (g.bankCrRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
      } else if (g.netSide === 'bank') {
        if (g.grossRows_bank) {
          g.grossRows_bank.forEach((r: any) => rows.push({ row: r, label: lbl }));
        } else {
          (g.drRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
          (g.crRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        }
      } else {
        const netBankRow = g.netRow_bank || g.netRow;
        if (netBankRow) rows.push({ row: netBankRow, label: lbl });
      }
    });

    iterGroups(allAiMatchGroups, g => {
      const lbl = t('statusAi') + t('statusPhase2');
      (g.bankOrigIdxs || []).forEach((idx: number) => {
        const r = p2BankOrig.find(x => x._origIdx === idx);
        if (r) rows.push({ row: r, label: lbl });
      });
    });

    iterGroups(unifiedMatchGroups, g => {
      const lbl = `${t('statusPhase2')} (Unified: ${g.type})`;
      (g.bankRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
    });

    return rows;
  }, [
    decisions,
    fuzzyMatchGroups,
    otmMatchGroups,
    otmFuzzyMatchGroups,
    exactNetMatchGroups,
    netMatchGroups,
    aiMatchGroups,
    allAiMatchGroups,
    unifiedMatchGroups,
    p2BankOrig
  ]);

  const acceptedSysRows = useMemo(() => {
    const rows: any[] = [];
    const getLabel = (type: string, diff?: number, dir?: string) => {
      if (type === 'fuzzy') return t('statusFuzzy') + diff + t('statusPhase2');
      if (type === 'otm-fuzzy') return t('statusOtmFuzzy') + diff + t('statusPhase2');
      if (type === 'exact-net') return t('statusExactNet') + t('statusPhase2');
      if (type === 'net') return t('statusNet') + diff + t('statusPhase2');
      return t('statusOtm') + ' (' + dir + ')' + t('statusPhase2');
    };

    const iterGroups = (groupArr: any[], cb: (g: any) => void) => {
      (groupArr || []).forEach(g => {
        if (decisions[g._decKey] === 'accept') cb(g);
      });
    };

    iterGroups(fuzzyMatchGroups, g => {
      if (g.sysRow) rows.push({ row: g.sysRow, label: getLabel('fuzzy', g.diff) });
    });

    iterGroups(otmMatchGroups, g => {
      if (g.reversed) {
        (g.bankRows || []).forEach((s: any) => rows.push({ row: s, label: getLabel('otm', undefined, g.dir) }));
      } else {
        if (g.sysRow) rows.push({ row: g.sysRow, label: getLabel('otm', undefined, g.dir) });
      }
    });

    iterGroups(otmFuzzyMatchGroups, g => {
      if (g.reversed) {
        (g.bankRows || []).forEach((s: any) => rows.push({ row: s, label: getLabel('otm-fuzzy', g.diff) }));
      } else {
        if (g.sysRow) rows.push({ row: g.sysRow, label: getLabel('otm-fuzzy', g.diff) });
      }
    });

    iterGroups(exactNetMatchGroups, g => {
      const lbl = t('statusExactNet') + t('statusPhase2');
      if (g.netSide === 'both') {
        (g.drRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        (g.crRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
      } else if (g.netSide === 'sys') {
        (g.drRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        (g.crRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
      } else {
        const netSysRow = g.netRow_sys;
        if (netSysRow) rows.push({ row: netSysRow, label: lbl });
      }
    });

    iterGroups(netMatchGroups, g => {
      const lbl = getLabel('net', g.diff);
      if (g.netSide === 'both') {
        (g.drRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        (g.crRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
      } else if (g.netSide === 'sys') {
        if (g.grossRows_sys) {
          g.grossRows_sys.forEach((r: any) => rows.push({ row: r, label: lbl }));
        } else {
          (g.drRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
          (g.crRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
        }
      } else {
        const netSysRow = g.netRow_sys || g.netRow;
        if (netSysRow) rows.push({ row: netSysRow, label: lbl });
      }
    });

    iterGroups(allAiMatchGroups, g => {
      const lbl = t('statusAi') + t('statusPhase2');
      (g.sysOrigIdxs || []).forEach((idx: number) => {
        const r = p2SysOrig.find(x => x._origIdx === idx);
        if (r) rows.push({ row: r, label: lbl });
      });
    });

    iterGroups(unifiedMatchGroups, g => {
      const lbl = `${t('statusPhase2')} (Unified: ${g.type})`;
      (g.sysRows || []).forEach((r: any) => rows.push({ row: r, label: lbl }));
    });

    return rows;
  }, [
    decisions,
    fuzzyMatchGroups,
    otmMatchGroups,
    otmFuzzyMatchGroups,
    exactNetMatchGroups,
    netMatchGroups,
    aiMatchGroups,
    allAiMatchGroups,
    unifiedMatchGroups,
    p2SysOrig
  ]);

  // File Upload Handlers (HTML drag events representation in React)
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>, side: 'bank' | 'sys') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const r = new FileReader();
    r.onload = (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        const cols = rows.length ? Object.keys(rows[0]) : [];

        if (side === 'bank') {
          setBankData(rows);
          setBankCols(cols);
          setBankFileName(file.name);
          setBankWB(wb);
          autoGuess('bank', cols);
        } else {
          setSysData(rows);
          setSysCols(cols);
          setSysFileName(file.name);
          setSysWB(wb);
          autoGuess('sys', cols);
        }
      } catch (err: any) {
        alert(`Error reading file: ${err.message}`);
      }
    };
    r.readAsBinaryString(file);
  };

  const autoGuess = (side: 'bank' | 'sys', cols: string[]) => {
    const map = {
      debit: ['debit', 'مدين', 'dr', 'amount', 'مبلغ', 'المدين'],
      credit: ['credit', 'دائن', 'cr', 'الدائن'],
      date: ['date', 'تاريخ', 'value_date', 'posting', 'تاريخ القيد'],
      desc: ['desc', 'description', 'بيان', 'narration', 'ref', 'particulars', 'details', 'remarks', 'البيان', 'شرح']
    };

    const result = { debit: '', credit: '', date: '', desc: '' };

    Object.entries(map).forEach(([k, terms]) => {
      const match = cols.find(c =>
        terms.some(tm => c.toLowerCase().replace(/[^a-z\u0600-\u06ff]/g, '').includes(tm))
      );
      if (match) {
        result[k as keyof typeof result] = match;
      }
    });

    if (side === 'bank') {
      setBankMapping(prev => ({ ...prev, ...result }));
    } else {
      setSysMapping(prev => ({ ...prev, ...result }));
    }
  };

  // Run Phase 1 matching algorithm
  const runReconciliation = () => {
    const bd = bankMapping.debit;
    const bc = bankMapping.credit;
    const sd = sysMapping.debit;
    const sc = sysMapping.credit;

    if ((!bd && !bc) || (!sd && !sc)) {
      alert(lang === 'ar' ? '⚠️ يرجى تحديد أعمدة المدين/الدائن لكلا الملفين' : '⚠️ Please select Debit/Credit columns for both files');
      return;
    }

    const valueOfAmt = (row: any, dCol: string, cCol: string) => {
      const getNumVal = (r: any, col: string) => {
        if (!col || !(col in r)) return 0;
        const v = parseFloat(String(r[col]).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, ''));
        return isNaN(v) ? 0 : v;
      };
      const d = getNumVal(row, dCol);
      const c = getNumVal(row, cCol);
      if (d && !c) return d;
      if (c && !d) return c;
      if (d && c) return Math.round(Math.abs(d - c) * 100) / 100 || Math.max(d, c);
      return 0;
    };

    const bAmts = bankData.map((r) => ({
      row: r,
      amt: Math.round(valueOfAmt(r, bd, bc) * 100) / 100,
      used: false
    }));

    const sAmts = sysData.map((r) => ({
      row: r,
      amt: Math.round(valueOfAmt(r, sd, sc) * 100) / 100,
      used: false
    }));

    const exactMatched: ExactMatch[] = [];

    const amtCountsB = new Map<number, number>();
    const amtCountsS = new Map<number, number>();

    bAmts.forEach(x => {
      const key = Math.round(x.amt * 100);
      amtCountsB.set(key, (amtCountsB.get(key) || 0) + 1);
    });
    sAmts.forEach(x => {
      const key = Math.round(x.amt * 100);
      amtCountsS.set(key, (amtCountsS.get(key) || 0) + 1);
    });

    const isAmtMismatched = (amt: number) => {
      const key = Math.round(amt * 100);
      const cb = amtCountsB.get(key) || 0;
      const cs = amtCountsS.get(key) || 0;
      return cb > 0 && cs > 0 && cb !== cs;
    };

    bAmts.forEach(b => {
      if (b.used) return;
      if (isAmtMismatched(b.amt)) return; // Bypassed and passed completely to Phase 2/AI for date-proximity matching!
      const si = sAmts.findIndex(s => !s.used && Math.abs(s.amt - b.amt) < 0.01 && s.amt > 0 && b.amt > 0);
      if (si >= 0) {
        exactMatched.push({ bank: b.row, sys: sAmts[si].row, amt: b.amt });
        b.used = true;
        sAmts[si].used = true;
      }
    });

    const bOnly = bAmts.filter(b => !b.used).map(b => ({ ...b.row, _المبلغ: b.amt, _المصدر: t('srcBank') }));
    const sOnly = sAmts.filter(s => !s.used).map(s => ({ ...s.row, _المبلغ: s.amt, _المصدر: t('srcSys') }));

    const p2Bank = [...bOnly].map((r, i) => ({ ...r, _origIdx: i }));
    const p2Sys = [...sOnly].map((r, i) => ({ ...r, _origIdx: i }));

    setMatched(exactMatched);
    setBankOnly(bOnly);
    setSysOnly(sOnly);

    setP2BankOrig(p2Bank);
    setP2SysOrig(p2Sys);

    // Reset advanced state
    setP2Matches([]);
    setDecisions({});
    setOtmMatchGroups([]);
    setFuzzyMatchGroups([]);
    setOtmFuzzyMatchGroups([]);
    setExactNetMatchGroups([]);
    setNetMatchGroups([]);
    setAiMatchGroups([]);
    setAllAiMatchGroups([]);

    setIsReconciliationRan(true);
    setIsPhase2Locked(false);
  };

  // Phase 1 Download exports
  const downloadResult = (type: string) => {
    const mc = t('matchStatusCol');
    const src = t('sourceCol');
    let rows: any[] = [];
    let name = '';

    if (type === 'bank_only') {
      rows = bankOnly.map(r => {
        const o: any = {};
        bankCols.forEach(c => { if (c in r) o[c] = r[c]; });
        o[mc] = t('statusBankOnly');
        return o;
      });
      name = 'bank_only.xlsx';
    } else if (type === 'sys_only') {
      rows = sysOnly.map(r => {
        const o: any = {};
        sysCols.forEach(c => { if (c in r) o[c] = r[c]; });
        o[mc] = t('statusSysOnly');
        return o;
      });
      name = 'sys_only.xlsx';
    } else if (type === 'all_diff') {
      const bR = bankOnly.map(r => {
        const o: any = {};
        bankCols.forEach(c => { if (c in r) o[c] = r[c]; });
        o[src] = t('srcBank');
        o[mc] = t('statusBankOnly');
        return o;
      });
      const sR = sysOnly.map(r => {
        const o: any = {};
        sysCols.forEach(c => { if (c in r) o[c] = r[c]; });
        o[src] = t('srcSys');
        o[mc] = t('statusSysOnly');
        return o;
      });
      rows = [...bR, ...sR];
      name = 'all_differences.xlsx';
    } else if (type === 'matched') {
      rows = matched.map(m => {
        const o: any = {};
        bankCols.forEach(c => { if (c in m.bank) o[(lang === 'ar' ? 'بنك_' : '') + c] = m.bank[c]; });
        sysCols.forEach(c => { if (c in m.sys) o[(lang === 'ar' ? 'نظام_' : '') + c] = m.sys[c]; });
        o[mc] = t('statusP1');
        return o;
      });
      name = 'matched_review.xlsx';
    }

    if (!rows.length) {
      alert(t('noData'));
      return;
    }

    exportUsingOriginalWB(
      (type === 'bank_only' || type === 'matched' || type === 'all_diff') ? bankWB : sysWB,
      rows,
      type === 'bank_only' || type === 'matched' ? bankCols : type === 'sys_only' ? sysCols : bankCols,
      mc,
      name,
      getStatusCellStyle
    );
  };

  // Standard excel style copying helpers
  const getStatusCellStyle = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('exact') || s.includes('phase 1') || s.includes('دقيق'))
      return { font: { bold: true, color: { rgb: '086630' } }, fill: { fgColor: { rgb: 'D0FAE5' } }, alignment: { horizontal: 'center' } };
    if (s.includes('fuzzy') || s.includes('تقريبي'))
      return { font: { bold: true, color: { rgb: '8A4A00' } }, fill: { fgColor: { rgb: 'FFF3CC' } }, alignment: { horizontal: 'center' } };
    if (s.includes('net-match') || s.includes('net match'))
      return { font: { bold: true, color: { rgb: '4F1FB0' } }, fill: { fgColor: { rgb: 'EDE5FF' } }, alignment: { horizontal: 'center' } };
    if (s.includes('one-to-many') || s.includes('otm'))
      return { font: { bold: true, color: { rgb: '0779A0' } }, fill: { fgColor: { rgb: 'C5F0FF' } }, alignment: { horizontal: 'center' } };
    if (s.includes('unmatched') || s.includes('غير مطابق'))
      return { font: { bold: true, color: { rgb: 'A0000D' } }, fill: { fgColor: { rgb: 'FFDDE0' } }, alignment: { horizontal: 'center' } };
    return { font: { bold: false }, alignment: { horizontal: 'center' } };
  };

  const getRowFill = (status: string) => {
    if (!status) return null;
    const s = status.toLowerCase();
    if (s.includes('exact') || s.includes('phase 1') || s.includes('دقيق')) return { patternType: 'solid', fgColor: { rgb: 'D0FAE5' } };
    if (s.includes('fuzzy') || s.includes('تقريبي')) return { patternType: 'solid', fgColor: { rgb: 'FFF3CC' } };
    if (s.includes('net-match') || s.includes('net match')) return { patternType: 'solid', fgColor: { rgb: 'EDE5FF' } };
    if (s.includes('one-to-many') || s.includes('1-to-many') || s.includes('otm')) return { patternType: 'solid', fgColor: { rgb: 'C5F0FF' } };
    if (s.includes('unmatched') || s.includes('غير مطابق')) return { patternType: 'solid', fgColor: { rgb: 'FFDDE0' } };
    if (s.includes('rejected') || s.includes('مرفوض')) return { patternType: 'solid', fgColor: { rgb: 'FFE0E3' } };
    return null;
  };

  const exportUsingOriginalWB = (
    origWB: any,
    annotatedRows: any[],
    colOrder: string[],
    statusCol: string,
    filename: string,
    colorRowsFn: (st: string) => any
  ) => {
    if (!origWB || !origWB.Sheets) {
      const ws = XLSX.utils.json_to_sheet(annotatedRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, filename);
      return;
    }

    try {
      const wbClone = JSON.parse(JSON.stringify(origWB));
      const wsName = wbClone.SheetNames[0];
      const ws = wbClone.Sheets[wsName];

      const origRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      const headerRowIdx = origRange.s.r;
      const statusColIdx = origRange.e.c + 1;

      // Header status
      const statusHdrAddr = XLSX.utils.encode_cell({ r: headerRowIdx, c: statusColIdx });
      ws[statusHdrAddr] = {
        t: 's',
        v: statusCol,
        s: {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { patternType: 'solid', fgColor: { rgb: '1463E0' } },
          alignment: { horizontal: 'center', vertical: 'center' }
        }
      };

      // Clear contents of spreadsheet data rows
      for (let r = headerRowIdx + 1; r <= origRange.e.r; r++) {
        for (let c = origRange.s.c; c <= origRange.e.c + 1; c++) {
          delete ws[XLSX.utils.encode_cell({ r, c })];
        }
      }

      // Write styled values
      annotatedRows.forEach((dataRow, offset) => {
        const r = headerRowIdx + 1 + offset;

        for (let c = origRange.s.c; c <= origRange.e.c; c++) {
          const hdrCell = ws[XLSX.utils.encode_cell({ r: headerRowIdx, c })];
          const colName = hdrCell ? String(hdrCell.v) : null;
          const val = colName ? dataRow[colName] : undefined;

          // Copy style templates
          const templateWS = origWB.Sheets[origWB.SheetNames[0]];
          const templateCell = templateWS[XLSX.utils.encode_cell({ r: headerRowIdx + 1, c })];

          const cell = {
            t: (val === undefined || val === null || val === '') ? 's' : (typeof val === 'number' ? 'n' : 's'),
            v: (val === undefined || val === null) ? '' : val,
            s: templateCell?.s ? JSON.parse(JSON.stringify(templateCell.s)) : {},
            z: templateCell?.z || undefined
          };

          // Row dynamic background styling integration
          const status = dataRow[statusCol] || '';
          const rowFill = getRowFill(status);
          if (rowFill) {
            if (!cell.s.fill || !cell.s.fill.fgColor || cell.s.fill.fgColor.rgb === 'FFFFFF' || cell.s.fill.fgColor.rgb === '00000000') {
              cell.s.fill = rowFill;
            }
          }

          ws[XLSX.utils.encode_cell({ r, c })] = cell;
        }

        const status = dataRow[statusCol] || '';
        const fillStyle = colorRowsFn ? colorRowsFn(status) : {};
        ws[XLSX.utils.encode_cell({ r, c: statusColIdx })] = {
          t: 's',
          v: status,
          s: fillStyle
        };
      });

      const newLastRow = headerRowIdx + annotatedRows.length;
      ws['!ref'] = XLSX.utils.encode_range({
        s: { r: headerRowIdx, c: origRange.s.c },
        e: { r: newLastRow, c: statusColIdx }
      });

      if (ws['!cols']) {
        if (!ws['!cols'][statusColIdx]) ws['!cols'][statusColIdx] = { wch: 32 };
      } else {
        ws['!cols'] = [];
        ws['!cols'][statusColIdx] = { wch: 32 };
      }

      XLSX.writeFile(wbClone, filename, { bookType: 'xlsx', cellStyles: true });
    } catch (e) {
      console.warn('Template export failed, falling back:', e);
      const ws = XLSX.utils.json_to_sheet(annotatedRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, filename);
    }
  };

  // Phase 2 Final Downloads
  const dlP2 = (type: string) => {
    const mc = t('matchStatusCol');

    if (type === 'bank_final') {
      const rows = bankRem.slice().sort((a, b) => a._origIdx - b._origIdx).map(r => {
        const o: any = {};
        bankCols.forEach(c => { o[c] = r[c]; });
         o[mc] = t('statusUnmatched');
        return o;
      });
      return exportUsingOriginalWB(bankWB, rows, bankCols, mc, 'bank_final_unmatched.xlsx', getStatusCellStyle);
    }

    if (type === 'sys_final') {
      const rows = sysRem.slice().sort((a, b) => a._origIdx - b._origIdx).map(r => {
        const o: any = {};
        sysCols.forEach(c => { o[c] = r[c]; });
         o[mc] = t('statusUnmatched');
        return o;
      });
      return exportUsingOriginalWB(sysWB, rows, sysCols, mc, 'sys_final_unmatched.xlsx', getStatusCellStyle);
    }

    if (type === 'p1_matched') {
      const bR = matched.map(m => {
        const o: any = {};
        bankCols.forEach(c => { if (c in m.bank) o[c] = m.bank[c]; });
        o[mc] = t('statusP1');
        return o;
      });
      exportUsingOriginalWB(bankWB, bR, bankCols, mc, 'phase1_matched_bank.xlsx', getStatusCellStyle);

      const sR = matched.map(m => {
        const o: any = {};
        sysCols.forEach(c => { if (c in m.sys) o[c] = m.sys[c]; });
        o[mc] = t('statusP1');
        return o;
      });
      exportUsingOriginalWB(sysWB, sR, sysCols, mc, 'phase1_matched_sys.xlsx', getStatusCellStyle);
      return;
    }

    if (type === 'p2_matches') {
      const bR = acceptedBankRows.map(({ row, label }) => {
        const o: any = {};
        bankCols.forEach(c => { o[c] = row[c]; });
        o[mc] = label;
        return o;
      });
      exportUsingOriginalWB(bankWB, bR, bankCols, mc, 'phase2_matches_bank.xlsx', getStatusCellStyle);

      const sR = acceptedSysRows.map(({ row, label }) => {
        const o: any = {};
        sysCols.forEach(c => { o[c] = row[c]; });
        o[mc] = label;
        return o;
      });
      exportUsingOriginalWB(sysWB, sR, sysCols, mc, 'phase2_matches_sys.xlsx', getStatusCellStyle);
      return;
    }

    if (type === 'full_bank') {
      const p1 = matched.map(m => {
        const o: any = {};
        bankCols.forEach(c => { if (c in m.bank) o[c] = m.bank[c]; });
        o[mc] = t('statusP1');
        return o;
      });

      const p2 = acceptedBankRows.map(({ row, label }) => {
        const o: any = {};
        bankCols.forEach(c => { o[c] = row[c]; });
        o[mc] = label;
        return o;
      });

      const unmatchedSorted = bankRem.slice().sort((a,b) => a._origIdx - b._origIdx).map(r => {
        const o: any = {};
        bankCols.forEach(c => { o[c] = r[c]; });
        o[mc] = t('statusUnmatched');
        return o;
      });

      return exportUsingOriginalWB(bankWB, [...p1, ...p2, ...unmatchedSorted], bankCols, mc, 'bank_full_classified.xlsx', getStatusCellStyle);
    }

    if (type === 'full_sys') {
      const p1 = matched.map(m => {
        const o: any = {};
        sysCols.forEach(c => { if (c in m.sys) o[c] = m.sys[c]; });
        o[mc] = t('statusP1');
        return o;
      });

      const p2 = acceptedSysRows.map(({ row, label }) => {
        const o: any = {};
        sysCols.forEach(c => { o[c] = row[c]; });
        o[mc] = label;
        return o;
      });

      const unmatchedSorted = sysRem.slice().sort((a,b) => a._origIdx - b._origIdx).map(r => {
        const o: any = {};
        sysCols.forEach(c => { o[c] = r[c]; });
        o[mc] = t('statusUnmatched');
        return o;
      });

      return exportUsingOriginalWB(sysWB, [...p1, ...p2, ...unmatchedSorted], sysCols, mc, 'sys_full_classified.xlsx', getStatusCellStyle);
    }
  };

  // Helper to get indices of bank rows associated with a matched group/suggestion
  const getGroupBankIdxs = (g: any): number[] => {
    if (!g) return [];
    if (g.bankOrigIdxs) return g.bankOrigIdxs;
    // fuzzy match
    if (g.bankRow && !g.bankRows) {
      return [g.bankRow._origIdx].filter((x: any) => x != null);
    }
    // otm / otm-fuzzy matches
    if (g.bankRows) {
      return g.reversed 
        ? [g.sysRow?._origIdx].filter((x: any) => x != null)
        : (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null);
    }
    // exact-net / net-cross matches
    if (g.netSide) {
      if (g.netSide === 'both') {
        return [...(g.bankDrRows || []), ...(g.bankCrRows || [])].map(r => r._origIdx).filter(x => x != null);
      }
      if (g.netSide === 'bank') {
        if (g.grossRows_bank) return g.grossRows_bank.map((r: any) => r._origIdx).filter((x: any) => x != null);
        return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
      }
      return [g.netRow_bank?._origIdx || g.netRow?._origIdx].filter((x: any) => x != null);
    }
    return [];
  };

  // Helper to get indices of system rows associated with a matched group/suggestion
  const getGroupSysIdxs = (g: any): number[] => {
    if (!g) return [];
    if (g.sysOrigIdxs) return g.sysOrigIdxs;
    // fuzzy match
    if (g.sysRow && !g.bankRows) {
      return [g.sysRow._origIdx].filter((x: any) => x != null);
    }
    // otm / otm-fuzzy matches
    if (g.bankRows) {
      return g.reversed
        ? (g.bankRows || []).map((r: any) => r._origIdx).filter((x: any) => x != null)
        : [g.sysRow?._origIdx].filter((x: any) => x != null);
    }
    // exact-net / net-cross matches
    if (g.netSide) {
      if (g.netSide === 'both') {
        return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
      }
      if (g.netSide === 'sys') {
        if (g.grossRows_sys) return g.grossRows_sys.map((r: any) => r._origIdx).filter((x: any) => x != null);
        return [...(g.drRows || []), ...(g.crRows || [])].map(r => r._origIdx).filter(x => x != null);
      }
      return [g.netRow_sys?._origIdx || g.netRow?._origIdx].filter((x: any) => x != null);
    }
    return [];
  };

  // Modal Review Decision trigger
  const handleModalDecision = (decision: 'accept' | 'reject') => {
    if (!selectedGroup) return;
    const dk = selectedGroup._decKey;
    
    setDecisions(prev => {
      const nextDecs = { ...prev, [dk]: decision };

      // If resolving to accept, automatically invalidate (set to 'reject') all other
      // suggestions that share any of the same bank or system row references!
      if (decision === 'accept') {
        const acceptedBankSet = new Set(getGroupBankIdxs(selectedGroup));
        const acceptedSysSet = new Set(getGroupSysIdxs(selectedGroup));

        const checkAndRejectConflicts = (gArr: any[]) => {
          (gArr || []).forEach(g => {
            if (g._decKey === dk) return;

            const bIdxs = getGroupBankIdxs(g);
            const sIdxs = getGroupSysIdxs(g);
            const hasConflict = bIdxs.some(i => acceptedBankSet.has(i)) || sIdxs.some(i => acceptedSysSet.has(i));

            if (hasConflict) {
              nextDecs[g._decKey] = 'reject';
            }
          });
        };

        checkAndRejectConflicts(otmMatchGroups);
        checkAndRejectConflicts(fuzzyMatchGroups);
        checkAndRejectConflicts(otmFuzzyMatchGroups);
        checkAndRejectConflicts(exactNetMatchGroups);
        checkAndRejectConflicts(netMatchGroups);
        checkAndRejectConflicts(aiMatchGroups);
        checkAndRejectConflicts(allAiMatchGroups);
        checkAndRejectConflicts(unifiedMatchGroups);
      }

      return nextDecs;
    });

    setIsModalOpen(false);
  };

  // Calculation trigger helpers
  const runUnifiedReconciliation = () => {
    const keys = unifiedMatchGroups.map(g => g._decKey);
    setDecisions(prev => {
      const copy = { ...prev };
      keys.forEach(k => delete copy[k]);
      return copy;
    });

    triggerWorkerMatch('unified', fuzzyTol);
  };

  const runOneToMany = () => {
    // Clear old OTM decisions
    const otmKeys = otmMatchGroups.map(g => g._decKey);
    setDecisions(prev => {
      const copy = { ...prev };
      otmKeys.forEach(k => delete copy[k]);
      return copy;
    });

    triggerWorkerMatch('one-to-many');
  };

  const runFuzzy = () => {
    const fuzzyKeys = fuzzyMatchGroups.map(g => g._decKey);
    setDecisions(prev => {
      const copy = { ...prev };
      fuzzyKeys.forEach(k => delete copy[k]);
      return copy;
    });

    triggerWorkerMatch('fuzzy', fuzzyTol);
  };

  const runOtmFuzzy = () => {
    const otmFuzzyKeys = otmFuzzyMatchGroups.map(g => g._decKey);
    setDecisions(prev => {
      const copy = { ...prev };
      otmFuzzyKeys.forEach(k => delete copy[k]);
      return copy;
    });

    triggerWorkerMatch('otm-fuzzy', otmFuzzyTol);
  };

  const runExactNet = () => {
    const exactNetKeys = exactNetMatchGroups.map(g => g._decKey);
    setDecisions(prev => {
      const copy = { ...prev };
      exactNetKeys.forEach(k => delete copy[k]);
      return copy;
    });

    triggerWorkerMatch('exact-net');
  };

  const runNetCross = () => {
    const netKeys = netMatchGroups.map(g => g._decKey);
    setDecisions(prev => {
      const copy = { ...prev };
      netKeys.forEach(k => delete copy[k]);
      return copy;
    });

    triggerWorkerMatch('net-cross', netTol);
  };

  const runAiMatching = async () => {
    setIsAiCalculating(true);
    setAiError(null);
    try {
      let data;
      const cachedKey = clientApiKey || "";

      // Safe number builder for direct API call
      const getSafeVal = (colValue: any) => {
        if (colValue === undefined || colValue === null) return 0;
        let s = String(colValue).trim();
        const arabicNums = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
        const persianNums = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /٨/g, /٩/g];
        for (let i = 0; i < 10; i++) {
          s = s.replace(arabicNums[i], String(i));
          s = s.replace(persianNums[i], String(i));
        }
        const v = parseFloat(s.replace(/[, ]/g, '').replace(/[^0-9.\-]/g, ''));
        return isNaN(v) ? 0 : v;
      };

      if (cachedKey && cachedKey.trim()) {
        // Direct Client-Side Call to Gemini API (Runs on GitHub/Cloudflare Pages)
        const maxItems = 100;
        const limitedBank = bankRem.slice(0, maxItems);
        const limitedSys = sysRem.slice(0, maxItems);

        if (limitedBank.length === 0 || limitedSys.length === 0) {
          setAiMatchGroups([]);
          return;
        }

        const prompt = `You are an expert, bilingual Arabic-English double-entry accounting auditor. Your task is to analyze unmatched Bank Statement items and System ERP entries to find high-confidence reconciliation matches.

STRICT DOUBLE-ENTRY BALANCE MANDATE:
An accounting match is strictly INVALID unless it balances mathematically.
For every match group:
1. Calculate the TOTAL Bank Amount (the active debit or credit) for all selected bank items in the group.
2. Calculate the TOTAL System Amount (the active debit or credit) for all selected system items in the group.
3. These sum totals MUST be identical (or within a tiny variance under 1-2% for potential transfer fees/bank charges). Never suggest matches where the sum totals do not balance.
4. If there are no logically or mathematically sound matches, simply return empty matches: {"matches": []}. Do not make random guesses or "best effort" combinations that do not balance.

GUIDELINES FOR BILINGUAL ARABIC & ENGLISH MATCHING:
- Date Proximity: Matched items should usually occur within 1-14 days of each other. Allow a wider window (up to 14 days) if amounts are unique and descriptions match.
- Description & Semantics: Look for similar words, business entity types, and common English-Arabic counterparts.
  * Counterparts: Match "الراجحي" with "Alrajhi", "فودافون" with "Vodafone", "الاتصالات" with "STC" or "telecom".
  * Accounting keywords: "سداد" (payment), "تحويل" (transfer), "فاتورة" (invoice), "إيداع" (deposit), "رواتب" (salaries/payroll), "عميل" (client), "مورد" (supplier).
  * Arabic Norm: Strip / ignore prefix "ال" (the), normalize "أإآ" to "ا", and "ة" to "e/h" conceptually to find semantic relations (e.g., "الشركة" and "شركة" are the same; "الراجحي" and "راجحي" are the same).
- Reference & Invoice Numbers: If descriptions contain matching numbers (e.g., invoice "Inv-2024-998" or reference "998"), they are very strong match indicators even if the names are slightly different!
- Grouping: A group can be 'one-to-one', 'one-to-many', 'many-to-one', or 'many-to-many'.

Bank Statement (Unmatched, max ${maxItems} items):
${JSON.stringify(
  limitedBank.map((b: any) => ({
    id: b._origIdx,
    date: b[bankMapping.date] || b.Date || "",
    desc: b[bankMapping.desc] || b.Description || "",
    debit: getSafeVal(b[bankMapping.debit]),
    credit: getSafeVal(b[bankMapping.credit]),
  }))
)}

System Transactions (Unmatched, max ${maxItems} items):
${JSON.stringify(
  limitedSys.map((s: any) => ({
    id: s._origIdx,
    date: s[sysMapping.date] || s.Date || "",
    desc: s[sysMapping.desc] || s.Description || "",
    debit: getSafeVal(s[sysMapping.debit]),
    credit: getSafeVal(s[sysMapping.credit]),
  }))
)}

Find up to 15 best proposed matches. Double check that every ID references an actual item index in the lists. Always output in the requested JSON structure.`;

        // Direct request to Gemini API (supports both gemini-1.5-flash and gemini-2.5-flash)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cachedKey.trim()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                required: ["matches"],
                properties: {
                  matches: {
                    type: "ARRAY",
                    description: "Array of recommended matches found by Gemini",
                    items: {
                      type: "OBJECT",
                      required: ["type", "bankOrigIdxs", "sysOrigIdxs", "confidence", "reasonAr", "reasonEn"],
                      properties: {
                        type: { type: "STRING" },
                        bankOrigIdxs: { type: "ARRAY", items: { type: "INTEGER" } },
                        sysOrigIdxs: { type: "ARRAY", items: { type: "INTEGER" } },
                        confidence: { type: "INTEGER" },
                        reasonAr: { type: "STRING" },
                        reasonEn: { type: "STRING" }
                      }
                    }
                  }
                }
              }
            }
          })
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `Gemini API responded with status ${res.status}`);
        }

        const resJson = await res.json();
        const cand = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!cand) {
          throw new Error("Invalid or empty response structure from direct Gemini API");
        }
        const parsed = JSON.parse(cand);
        data = { success: true, matches: parsed.matches || [] };
      } else {
        // Fallback to Express backend server
        const response = await fetch("/api/gemini/reconcile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bankRows: bankRem,
            sysRows: sysRem,
            bankMapping,
            sysMapping
          })
        });

        if (response.status === 404) {
          throw new Error("STATIONARY_HOST_ERROR");
        }

        data = await response.json();
        if (!data.success) {
          throw new Error(data.error || "An error occurred with Gemini");
        }
      }

      // Add decision keys to each match
      const matchedWithKeys = (data.matches || []).map((m: any) => ({
        ...m,
        _decKey: `ai_${m.bankOrigIdxs.join('-')}_sys_${m.sysOrigIdxs.join('-')}`
      }));

      setAiMatchGroups(matchedWithKeys);
      setAllAiMatchGroups(prev => {
        const next = [...prev];
        matchedWithKeys.forEach((m: any) => {
          if (!next.some(x => x._decKey === m._decKey)) {
            next.push(m);
          }
        });
        return next;
      });

      // Initialize decisions as undefined or pending
      setDecisions(prev => {
        const next = { ...prev };
        matchedWithKeys.forEach((m: any) => {
          if (next[m._decKey] === undefined) {
             // Keep it undefined so it starts as pending
          }
        });
        return next;
      });

    } catch (e: any) {
      console.error(e);
      if (
        e.message === "STATIONARY_HOST_ERROR" || 
        e.message.includes("Unexpected token '<'") || 
        e.message.includes("is not valid JSON") ||
        e.message.includes("Unexpected token 'U'")
      ) {
        setAiError(
          lang === 'ar' 
            ? "يبدو أنك قمت بنشر التطبيق على استضافة استاتيكية (مثل GitHub Pages أو Cloudflare Pages) بدون خادم تفاعلي. يُرجى توفير مفتاح Gemini API الشخصي الخاص بك في لوحة الإعدادات أدناه لتشغيل المطابقة الذكية مباشرة ومجاناً من المتصفح."
            : "It seems the app is hosted on a static server (like Cloudflare Pages or GitHub Pages) with no running back-end server. Please configure your personal Gemini API Key in the settings below to run smart reconciliation securely from your browser."
        );
        setShowKeyInput(true);
      } else {
        setAiError(e.message || "Failed to fetch intelligent recommendations from Gemini model.");
      }
    } finally {
      setIsAiCalculating(false);
    }
  };

  // Computed metrics for showing match rates
  const matchPctVal = useMemo(() => {
    const total = bankData.length;
    return total ? Math.round((matched.length / total) * 100) : 0;
  }, [bankData, matched]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors antialiased pb-12 flex flex-col">
      <Header lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} t={t} />

      <main className="container max-w-[1100px] mx-auto px-4 md:px-8 py-8 flex-1">
        {/* Phase Navigation */}
        <nav className="phase-nav">
          <button 
            className={`phase-btn ${phase === 1 ? 'active' : ''}`}
            onClick={() => setPhase(1)}
          >
            ⚖️ <span className="font-semibold">{t('tab1')}</span>
          </button>
          <button 
            className={`phase-btn ${isPhase2Locked ? 'locked' : ''} ${phase === 2 ? 'active' : ''}`}
            onClick={() => { if (!isPhase2Locked) setPhase(2); }}
          >
            🎯 <span className="font-semibold">{t('tab2')}</span>
          </button>
        </nav>

        {/* Phase 1 Pane */}
        {phase === 1 && (
          <div className="space-y-6">
            <div className="upload-row">
              {/* Bank Statement Upload Card */}
              <div className="card">
                <div className="card-title select-none">
                  <span className="step-badge active font-mono">1</span>
                  <span>{t('bankCard')}</span>
                </div>

                <div className={`upload-zone ${bankFileName ? 'done' : ''}`}>
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    onChange={(e) => handleFileChange(e, 'bank')}
                  />
                  <div className="upload-icon">🏦</div>
                  <div className="upload-text">
                    {bankFileName ? `✓ ${bankFileName} (${bankData.length.toLocaleString()} ${lang === 'ar' ? 'صف' : 'rows'})` : t('bankUpload')}
                  </div>
                  <div className="upload-hint">{bankCols.length ? `${bankCols.length} ${t('cols')}` : t('bankFmt')}</div>
                </div>

                {bankCols.length > 0 && (
                  <div className="animate-in fade-in zoom-in-95 duration-200">
                    <div className="col-grid col-grid-4">
                      <div className="field-group">
                        <label className="field-label">{t('bankDebit')}</label>
                        <select 
                          value={bankMapping.debit} 
                          onChange={(e) => setBankMapping(prev => ({ ...prev, debit: e.target.value }))}
                        >
                          <option value="">{t('selectOpt')}</option>
                          {bankCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{t('bankCredit')}</label>
                        <select 
                          value={bankMapping.credit} 
                          onChange={(e) => setBankMapping(prev => ({ ...prev, credit: e.target.value }))}
                        >
                          <option value="">{t('selectOpt')}</option>
                          {bankCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{t('bankDate')}</label>
                        <select 
                          value={bankMapping.date} 
                          onChange={(e) => setBankMapping(prev => ({ ...prev, date: e.target.value }))}
                        >
                          <option value="">{t('noneOpt')}</option>
                          {bankCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{t('bankDesc')}</label>
                        <select 
                          value={bankMapping.desc} 
                          onChange={(e) => setBankMapping(prev => ({ ...prev, desc: e.target.value }))}
                        >
                          <option value="">{t('noneOpt')}</option>
                          {bankCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    {bankData.length > 0 && (
                      <div className="note font-mono mt-3 break-words text-[11px] opacity-75">
                        {t('exampleRow')}
                        {Object.entries(bankData[0]).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* System ERP Upload Card */}
              <div className="card">
                <div className="card-title select-none">
                  <span className="step-badge active font-mono">2</span>
                  <span>{t('sysCard')}</span>
                </div>

                <div className={`upload-zone ${sysFileName ? 'done' : ''}`}>
                  <input 
                    type="file" 
                    accept=".xlsx,.xls,.csv" 
                    onChange={(e) => handleFileChange(e, 'sys')}
                  />
                  <div className="upload-icon">🗄️</div>
                  <div className="upload-text">
                    {sysFileName ? `✓ ${sysFileName} (${sysData.length.toLocaleString()} ${lang === 'ar' ? 'صف' : 'rows'})` : t('sysUpload')}
                  </div>
                  <div className="upload-hint">{sysCols.length ? `${sysCols.length} ${t('cols')}` : t('sysFmt')}</div>
                </div>

                {sysCols.length > 0 && (
                  <div className="animate-in fade-in zoom-in-95 duration-200">
                    <div className="col-grid col-grid-4">
                      <div className="field-group">
                        <label className="field-label">{t('sysDebit')}</label>
                        <select 
                          value={sysMapping.debit} 
                          onChange={(e) => setSysMapping(prev => ({ ...prev, debit: e.target.value }))}
                        >
                          <option value="">{t('selectOpt')}</option>
                          {sysCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{t('sysCredit')}</label>
                        <select 
                          value={sysMapping.credit} 
                          onChange={(e) => setSysMapping(prev => ({ ...prev, credit: e.target.value }))}
                        >
                          <option value="">{t('selectOpt')}</option>
                          {sysCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{t('sysDate')}</label>
                        <select 
                          value={sysMapping.date} 
                          onChange={(e) => setSysMapping(prev => ({ ...prev, date: e.target.value }))}
                        >
                          <option value="">{t('noneOpt')}</option>
                          {sysCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{t('sysDesc')}</label>
                        <select 
                          value={sysMapping.desc} 
                          onChange={(e) => setSysMapping(prev => ({ ...prev, desc: e.target.value }))}
                        >
                          <option value="">{t('noneOpt')}</option>
                          {sysCols.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    {sysData.length > 0 && (
                      <div className="note font-mono mt-3 break-words text-[11px] opacity-75">
                        {t('exampleRow')}
                        {Object.entries(sysData[0]).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Run exact reconciliation */}
            <div className="btn-group flex gap-2">
              <button 
                className="btn btn-primary"
                onClick={runReconciliation}
                disabled={bankData.length === 0 || sysData.length === 0}
                style={{ opacity: (bankData.length === 0 || sysData.length === 0) ? 0.5 : 1 }}
              >
                <Play size={15} />
                <span>{t('runBtn')}</span>
              </button>
            </div>

            {/* Reconciliation results overview */}
            {isReconciliationRan && (
              <div className="fade-in space-y-6">
                <div className="divider"></div>
                <div className="section-title font-semibold">{t('resultsTitle')}</div>

                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-val val-blue">{bankData.length.toLocaleString()}</div>
                    <div className="stat-lbl">{t('bankTotal')}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val val-blue">{sysData.length.toLocaleString()}</div>
                    <div className="stat-lbl">{t('sysTotal')}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val val-green">{matched.length.toLocaleString()}</div>
                    <div className="stat-lbl">{t('matched')}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val val-red">{(bankOnly.length + sysOnly.length).toLocaleString()}</div>
                    <div className="stat-lbl">{t('unmatched')}</div>
                  </div>
                </div>

                <div className="stats-grid stats-grid-2">
                  <div className="stat-card">
                    <div className="stat-val val-amber">{bankOnly.length.toLocaleString()}</div>
                    <div className="stat-lbl">{t('bankOnly')}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-val val-amber">{sysOnly.length.toLocaleString()}</div>
                    <div className="stat-lbl">{t('sysOnly')}</div>
                  </div>
                </div>

                <div className="progress-wrap">
                  <div className="progress-bar" style={{ width: `${matchPctVal}%` }}></div>
                </div>
                <div className="note font-semibold text-xs text-[var(--text2)]">
                  {t('matchPct')}{matchPctVal}% ({matched.length.toLocaleString()}{t('of')}{bankData.length.toLocaleString()})
                </div>

                {/* Differences View Table */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <div className="section-title text-[var(--text)] font-semibold" style={{ marginBottom: 0 }}>
                      {t('diffTable')}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      <button className="btn btn-sm btn-success" onClick={() => downloadResult('bank_only')}>
                        <Download size={12} />
                        <span>{t('dlBank')}</span>
                      </button>
                      <button className="btn btn-sm btn-success" onClick={() => downloadResult('sys_only')}>
                        <Download size={12} />
                        <span>{t('dlSys')}</span>
                      </button>
                      <button className="btn btn-sm" onClick={() => downloadResult('all_diff')}>
                        <Download size={12} />
                        <span>{t('dlAll')}</span>
                      </button>
                      <button className="btn btn-sm btn-amber" onClick={() => downloadResult('matched')}>
                        <Eye size={12} />
                        <span>{t('dlMatched')}</span>
                      </button>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: '90px' }}>{lang === 'ar' ? 'المصدر' : 'Source'}</th>
                          <th>{lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
                          {(bankMapping.date || sysMapping.date) && <th>{lang === 'ar' ? 'التاريخ' : 'Date'}</th>}
                          {(bankMapping.desc || sysMapping.desc) && <th>{lang === 'ar' ? 'البيان' : 'Description'}</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {bankOnly.slice(0, 100).map((r, i) => (
                          <tr key={`b-${i}`} className="row-bank">
                            <td>
                              <span className="tag tag-bank">{t('bankRowTag')}</span>
                            </td>
                            <td className="font-mono font-medium">
                              {(r._المبلغ || '').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {bankMapping.date && <td>{r[bankMapping.date]}</td>}
                            {bankMapping.desc && <td className="truncate max-w-[200px]" title={r[bankMapping.desc]}>{r[bankMapping.desc]}</td>}
                          </tr>
                        ))}
                        {sysOnly.slice(0, 100).map((r, i) => (
                          <tr key={`s-${i}`} className="row-sys">
                            <td>
                              <span className="tag tag-sys">{t('sysRowTag')}</span>
                            </td>
                            <td className="font-mono font-medium">
                              {(r._المبلغ || '').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            {sysMapping.date && <td>{r[sysMapping.date]}</td>}
                            {sysMapping.desc && <td className="truncate max-w-[200px]" title={r[sysMapping.desc]}>{r[sysMapping.desc]}</td>}
                          </tr>
                        ))}
                        {bankOnly.length === 0 && sysOnly.length === 0 && (
                          <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>
                              {t('noDiff')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="btn-group mt-6">
                  <button className="btn btn-primary" onClick={() => setPhase(2)}>
                    <span>{t('goPhase2')}</span>
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Phase 2 Pane */}
        {phase === 2 && (
          <div className="space-y-6">
            <div className="alert alert-info flex gap-2 font-medium">
              <Info className="text-[var(--blue-text)] flex-shrink-0" size={16} />
              <span>{t('p2Info')}</span>
            </div>

            {/* Metrics Remaining */}
            <div className="stats-grid stats-grid-3">
              <div className="stat-card">
                <div className="stat-val val-amber">
                  {p2BankOrig.length.toLocaleString()} → {bankRem.length.toLocaleString()}
                </div>
                <div className="stat-lbl">{t('p2BankRem')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-val val-amber">
                  {p2SysOrig.length.toLocaleString()} → {sysRem.length.toLocaleString()}
                </div>
                <div className="stat-lbl">{t('p2SysRem')}</div>
              </div>
              <div className="stat-card">
                <div className="stat-val val-green">
                  {acceptedBankRows.length.toLocaleString()}
                </div>
                <div className="stat-lbl">{t('p2Matched')}</div>
              </div>
            </div>

            {/* STEP 3: Smart Unified Matching (Consolidated Stage) */}
            <div className="card relative overflow-hidden">
              <div className="card-title select-none flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="step-badge active font-mono bg-[var(--blue)] text-white">3</span>
                  <span>{t('unifiedTitle')}</span>
                </div>
              </div>
              <p className="text-xs text-[var(--text2)] leading-relaxed mb-4">
                {t('unifiedInfo')}
              </p>

              <div className="flex gap-4 items-center flex-wrap my-4 bg-[var(--bg3)] p-3 rounded border border-[var(--border)]">
                {/* Free tolerance configuration */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-[var(--text2)]">{t('fuzzyTolLbl')}</label>
                  <input 
                    type="number" 
                    value={fuzzyTol} 
                    onChange={e => setFuzzyTol(Math.max(0, parseFloat(e.target.value) || 0))} 
                    className="input w-16 text-xs px-2 py-1 text-center" 
                    min="0"
                  />
                  <span className="text-[10px] text-[var(--text3)] uppercase tracking-wider">{t('fuzzyCurr')}</span>
                </div>

                {isWorkerCalculating && currentWorkerTask === 'unified' ? (
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--blue-text)]">
                    <Loader className="animate-spin text-[var(--blue)]" size={16} />
                    <span>{lang === 'ar' ? 'جاري تشغيل محرك المطابقة الموحد لفرز النتائج وتقليل الضوضاء...' : 'Consolidating matches, text semantics and date proximity sequentially...'}</span>
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary" 
                    onClick={runUnifiedReconciliation}
                    disabled={bankRem.length === 0 || sysRem.length === 0}
                  >
                    <RefreshCw size={14} />
                    <span>{t('unifiedBtn')}</span>
                  </button>
                )}
              </div>

              {unifiedMatchGroups.length > 0 && (
                <div className="mt-5 space-y-4 animate-in fade-in duration-200">
                  <div className="divider"></div>
                  <div className="section-title text-[var(--text)] font-semibold mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{t('unifiedMatched')}</span>
                      <span className="badge bg-[var(--blue-dim)] text-[var(--blue-text)] px-2.5 py-0.5 rounded text-xs font-bold">{unifiedMatchGroups.length}</span>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('unifiedThType')}</th>
                          <th>{t('unifiedThBank')}</th>
                          <th>{t('unifiedThSys')}</th>
                          <th>{t('unifiedThAmt')}</th>
                          <th>{t('unifiedThConfidence')}</th>
                          <th>{t('aiThDec')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unifiedMatchGroups.slice(0, 150).map((g, idx) => {
                          const dec = decisions[g._decKey];
                          const scoreColor = g.score >= 90 ? 'bg-[var(--green-dim)] text-[var(--green-text)] border-[var(--green)]' : 'bg-[var(--amber-dim)] text-[var(--amber-text)] border-[var(--amber)]';

                          return (
                            <tr 
                              key={g._decKey}
                              className={`fuzzy-clickable ${g.diff === 0 ? 'net-accepted' : ''} ${dec === 'accept' ? 'fuzzy-accepted' : dec === 'reject' ? 'fuzzy-rejected' : ''}`}
                              onClick={() => {
                                setSelectedGroup(g);
                                setSelectedGroupIndex(idx);
                                setModalType('unified');
                                setIsModalOpen(true);
                              }}
                              title={t('clickToReview')}
                            >
                              <td>
                                <span className={`tag text-[9px] font-bold uppercase ${
                                  g.type === '1-to-1' ? 'text-[var(--violet-text)] bg-[var(--violet-dim)] border-[var(--violet)]' :
                                  g.type === 'net-exact' ? 'text-[var(--green-text)] bg-[var(--green-dim)] border-[var(--green)]' :
                                  'text-[var(--teal-text)] bg-[var(--teal-dim)] border-[var(--teal)]'
                                } border`}>
                                  {g.type}
                                </span>
                              </td>
                              <td className="max-w-[200px] truncate font-mono text-xs">
                                <div className="font-semibold">{g.bankSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div className="text-[10px] text-[var(--text3)] truncate" title={g.bankRows[0]?._desc || ''}>
                                  {g.bankRows[0]?._desc || ''} {g.bankRows.length > 1 ? `(+${g.bankRows.length - 1} ${lang === 'ar' ? 'أخرى' : 'more'})` : ''}
                                </div>
                              </td>
                              <td className="max-w-[200px] truncate font-mono text-xs">
                                <div className="font-semibold">{g.sysSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                <div className="text-[10px] text-[var(--text3)] truncate" title={g.sysRows[0]?._desc || ''}>
                                  {g.sysRows[0]?._desc || ''} {g.sysRows.length > 1 ? `(+${g.sysRows.length - 1} ${lang === 'ar' ? 'أخرى' : 'more'})` : ''}
                                </div>
                              </td>
                              <td className="font-mono text-xs">
                                {g.diff === 0 ? (
                                  <span className="text-[var(--green-text)] font-semibold">{lang === 'ar' ? 'تطابق كامل' : 'Balanced'}</span>
                                ) : (
                                  <span className="text-[var(--amber-text)] font-semibold">±{g.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                )}
                              </td>
                              <td>
                                <span className={`tag ${scoreColor} text-[10px] font-bold border`}>
                                  {g.score}%
                                </span>
                              </td>
                              <td>
                                {dec === 'accept' ? (
                                  <span className="tag tag-match">⏳ {t('acceptedLabel')}</span>
                                ) : dec === 'reject' ? (
                                  <span className="tag tag-bank">⏳ {t('rejectedLabel')}</span>
                                ) : (
                                  <span className="tag bg-[var(--amber-dim)] text-[var(--amber-text)] border border-[var(--amber)] text-[10px] font-bold">⏳ {t('pendingReview')}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* STEP AI: Gemini Copilot Matching */}
            <div className="card relative overflow-hidden border border-[var(--violet-dim)] shadow-inner">
              <div className="absolute top-0 right-0 p-1 bg-gradient-to-l from-[var(--violet)] to-transparent text-[10px] text-white font-bold opacity-30 select-none">
                CO-PILOT ENHANCED
              </div>
              <div className="card-title select-none flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="step-badge active font-mono bg-gradient-to-br from-[var(--violet)] to-[var(--blue)]">AI</span>
                  <span>{t('aiTitle')}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--violet-dim)] text-[var(--violet-text)] uppercase font-mono tracking-wider">
                  Powered by Gemini 3.5
                </span>
              </div>
              <p className="text-xs text-[var(--text2)] mb-4 leading-normal">
                {t('aiInfo')}
              </p>

              {/* Personal Gemini API Key Configuration Support for Static Hosts (like Cloudflare/GitHub Pages) */}
              <div className="mb-4 bg-[var(--bg2)] border border-[var(--border)] rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-[var(--violet-text)] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    onClick={() => setShowKeyInput(!showKeyInput)}
                  >
                    ⚙️ {showKeyInput 
                      ? (lang === 'ar' ? 'إخفاء إعدادات مفتاح API الشخصي' : 'Hide Personal API Key Settings')
                      : (lang === 'ar' ? 'إعدادات مفتاح API الشخصي (إذا كنت تستخدم GitHub / Cloudflare)' : 'Personal API Key Settings (If using GitHub / Cloudflare)')}
                  </button>
                  {clientApiKey ? (
                    <span className="text-[10px] text-emerald-600 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1">
                      ● {lang === 'ar' ? 'المفتاح الشخصي نشط محلياً' : 'Personal Key Active'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-600 font-semibold px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-1">
                      ℹ {lang === 'ar' ? 'الاتصال بخادم التطبيق الافتراضي' : 'Default Server Connection'}
                    </span>
                  )}
                </div>

                {showKeyInput && (
                  <div className="mt-3 space-y-3 pt-3 border-t border-[var(--border)] animate-in fade-in slide-in-from-top-1 duration-200">
                    <p className="text-[var(--text2)] leading-relaxed">
                      {lang === 'ar' 
                        ? "عند رفع هذا التطبيق على استضافات ثابتة مثل GitHub Pages أو Cloudflare Pages، لا يتوافر خادم خلفي لتشغيل الذكاء الاصطناعي. لحل هذا، يمكنك توليد مفتاح API مجاني ووضعه هنا ليقوم التطبيق بطلب النتائج من متصفحك مباشرة وبسرية تامة."
                        : "Since modern hosts like GitHub/Cloudflare Pages don't run a back-end, you can use your own FREE Gemini API key. Requests will be processed completely client-side in safety."}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-[var(--text)]">{lang === 'ar' ? '1. احصل على مفتاح مجاني من هنا:' : '1. Get your free API key here:'}</span>
                      <a 
                        href="https://aistudio.google.com/" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[var(--blue-text)] font-semibold underline hover:text-[var(--blue)] cursor-pointer"
                      >
                        Google AI Studio ↗
                      </a>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="font-semibold text-[var(--text)]">{lang === 'ar' ? '2. أدخل مفتاح الـ API:' : '2. Enter the API Key:'}</span>
                      <input
                        type="password"
                        placeholder={lang === 'ar' ? "أدخل مفتاح Gemini API هنا (مثال: AIzaSy...)" : "Enter Gemini API Key here (e.g., AIzaSy...)"}
                        className="px-3 py-2 text-xs bg-[var(--bg)] border border-[var(--border)] rounded text-[var(--text)] focus:outline-none focus:border-[var(--violet)] w-full font-mono"
                        value={clientApiKey}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          setClientApiKey(val);
                          if (val) {
                            localStorage.setItem("user_gemini_api_key", val);
                          } else {
                            localStorage.removeItem("user_gemini_api_key");
                          }
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 items-center flex-wrap">
                {isAiCalculating ? (
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--violet-text)]">
                    <Loader className="animate-spin text-[var(--violet)]" size={16} />
                    <span>{lang === 'ar' ? 'جاري تحليل البيانات عبر Gemini وتطبيق خوارزميات الذكاء الاصطناعي...' : 'Gemini is evaluating unmatched rows and computing context-aware recommendations...'}</span>
                  </div>
                ) : (
                  <button 
                    className="btn bg-gradient-to-r from-[var(--violet)] to-[var(--blue)] text-white font-semibold hover:opacity-90 flex items-center gap-2 cursor-pointer"
                    onClick={runAiMatching}
                    disabled={bankRem.length === 0 || sysRem.length === 0}
                  >
                    <Sparkles size={14} />
                    <span>{t('aiBtn')}</span>
                  </button>
                )}
                
                <div className="text-xs text-[var(--text3)] font-mono">
                  {t('aiBankRem')}: <strong className="text-[var(--text)]">{Math.min(bankRem.length, 100)}</strong>, {t('aiSysRem')}: <strong className="text-[var(--text)]">{Math.min(sysRem.length, 100)}</strong>
                </div>
              </div>

              {aiError && (
                <div className="alert alert-red text-xs mt-3 flex items-center gap-1.5 p-3 rounded">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {aiMatchGroups.length > 0 && (
                <div className="mt-5 space-y-4 animate-in fade-in duration-200">
                  <div className="divider"></div>
                  <div className="section-title text-[var(--text)] font-semibold mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{t('aiMatched')}</span>
                      <span className="badge bg-[var(--violet-dim)] text-[var(--violet-text)] px-2.5 py-0.5 rounded text-xs font-bold">{aiMatchGroups.length}</span>
                    </div>
                  </div>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>{t('aiThType')}</th>
                          <th>{t('aiThBank')}</th>
                          <th>{t('aiThSys')}</th>
                          <th>{t('aiThConf')}</th>
                          <th className="hidden md:table-cell">{t('aiThReason')}</th>
                          <th>{t('aiThDec')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiMatchGroups.slice(0, 100).map((g, idx) => {
                          const dec = decisions[g._decKey];

                          // Resolve row details for sum computations
                          const matchedBankRows = (g.bankOrigIdxs || []).map((bIdx: number) => 
                            p2BankOrig.find(x => x._origIdx === bIdx)
                          ).filter(Boolean);

                          const matchedSysRows = (g.sysOrigIdxs || []).map((sIdx: number) => 
                            p2SysOrig.find(x => x._origIdx === sIdx)
                          ).filter(Boolean);

                          const sumNetOfRows = (rows: any[], mapping: any) => {
                            const dCol = mapping.debit;
                            const cCol = mapping.credit;
                            const parseVal = (r: any, col: string) => {
                              if (!col || !(col in r) || r[col] === undefined || r[col] === null) return 0;
                              const s = String(r[col]).replace(/[, ]/g, '').replace(/[^0-9.\-]/g, '');
                              const v = parseFloat(s);
                              return isNaN(v) ? 0 : v;
                            };
                            let totalDr = 0;
                            let totalCr = 0;
                            rows.forEach((r: any) => {
                              totalDr += parseVal(r, dCol);
                              totalCr += parseVal(r, cCol);
                            });
                            if (totalDr > 0 && totalCr > 0) {
                              return Math.round(Math.abs(totalDr - totalCr) * 100) / 100;
                            }
                            return Math.round((totalDr || totalCr) * 100) / 100;
                          };

                          const bankSum = sumNetOfRows(matchedBankRows, bankMapping);
                          const sysSum = sumNetOfRows(matchedSysRows, sysMapping);

                          const scoreColor = g.confidence >= 90 ? 'tag-match' : g.confidence >= 75 ? 'tag-fuzzy' : 'bg-[var(--bg3)] text-[var(--text3)]';

                          return (
                            <tr 
                              key={g._decKey}
                              className={`fuzzy-clickable ${dec === 'accept' ? 'fuzzy-accepted' : dec === 'reject' ? 'fuzzy-rejected' : ''}`}
                              onClick={() => {
                                setSelectedGroup({
                                  ...g,
                                  bankRows: matchedBankRows,
                                  sysRows: matchedSysRows
                                });
                                setSelectedGroupIndex(idx);
                                setModalType('ai');
                                setIsModalOpen(true);
                              }}
                              title={t('clickToReview')}
                            >
                              <td>
                                <span className="tag text-[9px] font-bold text-[var(--violet-text)] bg-[var(--violet-dim)] border border-[var(--violet)] uppercase">
                                  {g.type}
                                </span>
                              </td>
                              <td className="font-mono">
                                {bankSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {matchedBankRows.length > 1 && (
                                  <span className="text-[10px] text-[var(--text3)] block">({matchedBankRows.length} {lang === 'ar' ? 'صفوف' : 'rows'})</span>
                                )}
                              </td>
                              <td className="font-mono">
                                {sysSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                {matchedSysRows.length > 1 && (
                                  <span className="text-[10px] text-[var(--text3)] block">({matchedSysRows.length} {lang === 'ar' ? 'صفوف' : 'rows'})</span>
                                )}
                              </td>
                              <td>
                                <span className={`tag ${g.confidence >= 90 ? 'bg-[var(--green-dim)] text-[var(--green-text)] border-[var(--green)]' : 'bg-[var(--amber-dim)] text-[var(--amber-text)] border-[var(--amber)]'} text-[10px] font-bold`}>
                                  {g.confidence}%
                                </span>
                              </td>
                              <td className="max-w-[180px] truncate italic text-[11px] hidden md:table-cell" title={lang === 'ar' ? g.reasonAr : g.reasonEn}>
                                {lang === 'ar' ? g.reasonAr : g.reasonEn}
                              </td>
                              <td>
                                {dec === 'accept' ? (
                                  <span className="tag tag-match">⏳ {t('acceptedLabel')}</span>
                                ) : dec === 'reject' ? (
                                  <span className="tag tag-bank">⏳ {t('rejectedLabel')}</span>
                                ) : (
                                  <span className="tag bg-[var(--amber-dim)] text-[var(--amber-text)] border border-[var(--amber)] text-[10px] font-bold">⏳ {t('pendingReview')}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* STEP G: Download Classified Exports */}
            <div className="card">
              <div className="card-title select-none">
                <span className="step-badge active font-mono">F</span>
                <span>{t('exportTitle')}</span>
              </div>

              {p2Matches.length > 0 || acceptedBankRows.length > 0 ? (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="stats-grid stats-grid-3">
                    <div className="stat-card">
                      <div className="stat-val val-green">{(matched.length + acceptedBankRows.length).toLocaleString()}</div>
                      <div className="stat-lbl">{t('p2Total')}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-val val-red">{bankRem.length.toLocaleString()}</div>
                      <div className="stat-lbl">{t('p2BankFinal')}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-val val-red">{sysRem.length.toLocaleString()}</div>
                      <div className="stat-lbl">{t('p2SysFinal')}</div>
                    </div>
                  </div>

                  <div className="divider"></div>
                  <div className="section-title text-[var(--text)] font-semibold">{t('downloadFiles')}</div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <button className="btn btn-success" onClick={() => dlP2('bank_final')}>
                      <Download size={14} />
                      <span>{t('dlBankFinal')}</span>
                    </button>
                    <button className="btn btn-success" onClick={() => dlP2('sys_final')}>
                      <Download size={14} />
                      <span>{t('dlSysFinal')}</span>
                    </button>
                    <button className="btn" onClick={() => dlP2('p1_matched')}>
                      <FileSpreadsheet size={14} />
                      <span>{t('dlP1')}</span>
                    </button>
                    <button 
                      className={`btn btn-amber ${acceptedBankRows.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`} 
                      onClick={() => { if (acceptedBankRows.length > 0) dlP2('p2_matches'); }}
                      disabled={acceptedBankRows.length === 0}
                      title={acceptedBankRows.length === 0 ? (lang === 'ar' ? 'قبّل مطابقة واحدة على الأقل أولاً' : 'Accept at least one match first') : ''}
                    >
                      <Download size={14} />
                      <span>{t('dlP2')}</span>
                    </button>
                    <button className="btn" onClick={() => dlP2('full_bank')}>
                      <FileSpreadsheet size={14} />
                      <span>{t('dlFullBank')}</span>
                    </button>
                    <button className="btn" onClick={() => dlP2('full_sys')}>
                      <FileSpreadsheet size={14} />
                      <span>{t('dlFullSys')}</span>
                    </button>
                  </div>
                  <div className="note mt-3 text-[11px] opacity-80 leading-normal flex gap-1.5 items-center">
                    <Info size={11} className="text-[var(--blue)] flex-shrink-0" />
                    <span>{t('exportNote')}</span>
                  </div>
                </div>
              ) : (
                <div className="alert alert-warn shadow-sm text-xs font-semibold flex items-center gap-1.5">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>{t('p2NoExport')}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Transaction Modal View for review matches */}
      <TransactionModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedGroup={selectedGroup}
        modalType={modalType}
        bankCols={bankCols}
        sysCols={sysCols}
        decisions={decisions}
        onDecision={handleModalDecision}
        lang={lang}
        t={t}
      />

      <Footer t={t} />
    </div>
  );
}
