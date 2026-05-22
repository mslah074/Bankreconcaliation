/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Helper functions
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function convertArabicNumerals(str: string): string {
  const arabicNums = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
  const persianNums = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /٨/g, /٩/g];
  for (let i = 0; i < 10; i++) {
    str = str.replace(arabicNums[i], String(i));
    str = str.replace(persianNums[i], String(i));
  }
  return str;
}

function getNum(row: any, col: string): number {
  if (!col || !(col in row) || row[col] === undefined || row[col] === null) return 0;
  let s = convertArabicNumerals(String(row[col]).trim());
  const v = parseFloat(s.replace(/[, ]/g, '').replace(/[^0-9.\-]/g, ''));
  return isNaN(v) ? 0 : v;
}

function getAmt(row: any, dCol: string, cCol: string): number {
  if (dCol && cCol && dCol === cCol) {
    return Math.abs(getNum(row, dCol));
  }
  const d = getNum(row, dCol);
  const c = getNum(row, cCol);
  if (d && !c) return d;
  if (c && !d) return c;
  if (d && c) return round2(Math.abs(d - c));
  return 0;
}

function findAllSubsets(arr: any[], target: number, tol: number, maxSize?: number): any[][] {
  const results: any[][] = [];
  const maxN = Math.min(maxSize || arr.length, arr.length);
  
  function backtrack(start: number, current: any[], remaining: number) {
    if (Math.abs(remaining) <= tol && current.length >= 2) {
      results.push([...current]);
    }
    if (current.length >= maxN) return;
    for (let i = start; i < arr.length; i++) {
      const item = arr[i];
      if (item._amt <= 0) continue;
      if (item._amt > remaining + tol) continue;
      current.push(item);
      backtrack(i + 1, current, remaining - item._amt);
      current.pop();
    }
  }
  
  backtrack(0, [], target);
  return results;
}

function _combosOfSize(arr: any[], size: number): any[][] {
  if (size > arr.length) return [];
  if (size === 1) return arr.map(x => [x]);
  const result: any[][] = [];
  
  function recurse(start: number, combo: any[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      recurse(i + 1, combo);
      combo.pop();
    }
  }
  
  recurse(0, []);
  return result;
}

function runOneToMany(
  bankRem: any[],
  sysRem: any[],
  bd: string,
  bc: string,
  sd: string,
  sc: string
) {
  const bankArrCredit = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bc) || 0) }));
  const bankArrDebit = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bd) || 0) }));
  const sysArrDebit = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sd) || 0) }));
  const sysArrCredit = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sc) || 0) }));
  const TOL = 0; // Exactly 0 tolerance for Stage A
  const MAX_SUBSET = 10;
  const groups: any[] = [];
  const allResultsLog: any[] = [];

  sysArrDebit.forEach(s => {
    if (s._amt <= 0) return;
    const avail = bankArrCredit.filter(b => b._amt > 0);
    const allCombos = findAllSubsets(avail, s._amt, TOL, MAX_SUBSET);
    allCombos.forEach(combo => allResultsLog.push({
      dir: 'Bank Cr → Sys Dr',
      sysRow: s,
      bankRows: combo,
      sysAmt: s._amt,
      bankSum: round2(combo.reduce((a, b) => a + b._amt, 0))
    }));
    
    // Propose up to 10 suggestions per sys row
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach(combo => {
      const sumBank = round2(combo.reduce((a, b) => a + b._amt, 0));
      const dk = `otm_BankCr-SysDr_${s._origIdx}_comb_${combo.map(b => b._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Bank Cr → Sys Dr',
        sysRow: s,
        bankRows: combo,
        sysAmt: s._amt,
        bankSum: sumBank,
        diff: round2(Math.abs(s._amt - sumBank)),
        allCombos: allCombos.length,
        _decKey: dk
      });
    });
  });

  sysArrCredit.forEach(s => {
    if (s._amt <= 0) return;
    const avail = bankArrDebit.filter(b => b._amt > 0);
    const allCombos = findAllSubsets(avail, s._amt, TOL, MAX_SUBSET);
    allCombos.forEach(combo => allResultsLog.push({
      dir: 'Bank Dr → Sys Cr',
      sysRow: s,
      bankRows: combo,
      sysAmt: s._amt,
      bankSum: round2(combo.reduce((a, b) => a + b._amt, 0))
    }));
    
    // Propose up to 10 suggestions per sys row
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach(combo => {
      const sumBank = round2(combo.reduce((a, b) => a + b._amt, 0));
      const dk = `otm_BankDr-SysCr_${s._origIdx}_comb_${combo.map(b => b._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Bank Dr → Sys Cr',
        sysRow: s,
        bankRows: combo,
        sysAmt: s._amt,
        bankSum: sumBank,
        diff: round2(Math.abs(s._amt - sumBank)),
        allCombos: allCombos.length,
        _decKey: dk
      });
    });
  });

  const bankArrCr2 = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bc) || 0) }));
  const bankArrDb2 = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bd) || 0) }));
  const sysArrDb2 = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sd) || 0) }));
  const sysArrCr2 = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sc) || 0) }));

  bankArrCr2.forEach(b => {
    if (b._amt <= 0) return;
    const avail = sysArrDb2.filter(s => s._amt > 0);
    const allCombos = findAllSubsets(avail, b._amt, TOL, MAX_SUBSET);
    
    // Propose up to 10 suggestions per bank row
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach(combo => {
      const sumSys = round2(combo.reduce((a, s) => a + s._amt, 0));
      const dk = `otm_SysDr-BankCr_${b._origIdx}_comb_${combo.map(s => s._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Sys Dr (multi) → Bank Cr',
        sysRow: b,
        bankRows: combo.map(s => ({ ...s, _isSys: true })),
        sysAmt: b._amt,
        bankSum: sumSys,
        diff: round2(Math.abs(b._amt - sumSys)),
        allCombos: allCombos.length,
        reversed: true,
        _decKey: dk
      });
    });
  });

  bankArrDb2.forEach(b => {
    if (b._amt <= 0) return;
    const avail = sysArrCr2.filter(s => s._amt > 0);
    const allCombos = findAllSubsets(avail, b._amt, TOL, MAX_SUBSET);
    
    // Propose up to 10 suggestions per bank row
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach(combo => {
      const sumSys = round2(combo.reduce((a, s) => a + s._amt, 0));
      const dk = `otm_SysCr-BankDr_${b._origIdx}_comb_${combo.map(s => s._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Sys Cr (multi) → Bank Dr',
        sysRow: b,
        bankRows: combo.map(s => ({ ...s, _isSys: true })),
        sysAmt: b._amt,
        bankSum: sumSys,
        diff: round2(Math.abs(b._amt - sumSys)),
        allCombos: allCombos.length,
        reversed: true,
        _decKey: dk
      });
    });
  });

  const p2Matches: any[] = [];
  groups.forEach(g => {
    if (!g.reversed) {
      g.bankRows.forEach((b: any) => p2Matches.push({
        type: '1-to-many',
        dir: g.dir,
        bankAmt: b._amt,
        sysAmt: g.sysAmt,
        diff: g.diff,
        bankRow: b,
        sysRow: g.sysRow,
        _decKey: g._decKey
      }));
    } else {
      g.bankRows.forEach((s: any) => p2Matches.push({
        type: '1-to-many',
        dir: g.dir,
        bankAmt: g.sysAmt,
        sysAmt: s._amt,
        diff: g.diff,
        bankRow: g.sysRow,
        sysRow: s,
        _decKey: g._decKey
      }));
    }
  });

  return { groups, combosCount: allResultsLog.length, p2Matches };
}

function runFuzzy(
  bankRem: any[],
  sysRem: any[],
  bd: string,
  bc: string,
  sd: string,
  sc: string,
  tol: number
) {
  const bankArr = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getAmt(r, bd, bc)) }));
  const sysArr = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getAmt(r, sd, sc)) }));
  const fMatches: any[] = [];
  const p2Matches: any[] = [];

  bankArr.forEach((b) => {
    if (b._amt <= 0) return;
    let count = 0;
    sysArr.forEach((s) => {
      if (s._amt <= 0) return;
      const diff = Math.abs(s._amt - b._amt);
      if (diff <= tol) {
        if (count >= 10) return; // limit to 10 suggestions per bank row
        const dk = `fuzzy_b${b._origIdx}_s${s._origIdx}`;
        fMatches.push({
          bankAmt: b._amt,
          sysAmt: s._amt,
          diff: round2(diff),
          bankRow: b,
          sysRow: s,
          _decKey: dk
        });
        p2Matches.push({
          type: 'fuzzy',
          bankAmt: b._amt,
          sysAmt: s._amt,
          diff: round2(diff),
          bankRow: b,
          sysRow: s,
          _decKey: dk
        });
        count++;
      }
    });
  });

  return { fMatches, p2Matches };
}

function runOtmFuzzy(
  bankRem: any[],
  sysRem: any[],
  bd: string,
  bc: string,
  sd: string,
  sc: string,
  tol: number
) {
  const MAX_SUBSET = 10;
  const groups: any[] = [];
  const p2Matches: any[] = [];
  let totalCombos = 0;

  // Direction 1: bank-credit → sys-debit (fuzzy)
  const bankArrCredit = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bc) || 0) }));
  const sysArrDebit = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sd) || 0) }));
  sysArrDebit.forEach(s => {
    if (s._amt <= 0) return;
    const avail = bankArrCredit.filter(b => b._amt > 0);
    const allCombos = findAllSubsets(avail, s._amt, tol, MAX_SUBSET);
    totalCombos += allCombos.length;
    
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach((combo) => {
      const sumBank = round2(combo.reduce((a, b) => a + b._amt, 0));
      const diff = round2(Math.abs(s._amt - sumBank));
      const dk = `otm-fuzzy_BankCr-SysDr_${s._origIdx}_comb_${combo.map(b => b._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Bank Cr → Sys Dr (Fuzzy)',
        sysRow: s,
        bankRows: combo,
        sysAmt: s._amt,
        bankSum: sumBank,
        diff,
        allCombos: allCombos.length,
        _decKey: dk
      });
      combo.forEach(b => p2Matches.push({
        type: 'otm-fuzzy',
        dir: 'Bank Cr → Sys Dr (Fuzzy)',
        bankAmt: b._amt,
        sysAmt: s._amt,
        diff,
        bankRow: b,
        sysRow: s,
        _decKey: dk
      }));
    });
  });

  // Direction 2: bank-debit → sys-credit (fuzzy)
  const bankArrDebit = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bd) || 0) }));
  const sysArrCredit = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sc) || 0) }));
  sysArrCredit.forEach(s => {
    if (s._amt <= 0) return;
    const avail = bankArrDebit.filter(b => b._amt > 0);
    const allCombos = findAllSubsets(avail, s._amt, tol, MAX_SUBSET);
    totalCombos += allCombos.length;
    
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach((combo) => {
      const sumBank = round2(combo.reduce((a, b) => a + b._amt, 0));
      const diff = round2(Math.abs(s._amt - sumBank));
      const dk = `otm-fuzzy_BankDr-SysCr_${s._origIdx}_comb_${combo.map(b => b._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Bank Dr → Sys Cr (Fuzzy)',
        sysRow: s,
        bankRows: combo,
        sysAmt: s._amt,
        bankSum: sumBank,
        diff,
        allCombos: allCombos.length,
        _decKey: dk
      });
      combo.forEach(b => p2Matches.push({
        type: 'otm-fuzzy',
        dir: 'Bank Dr → Sys Cr (Fuzzy)',
        bankAmt: b._amt,
        sysAmt: s._amt,
        diff,
        bankRow: b,
        sysRow: s,
        _decKey: dk
      }));
    });
  });

  // Direction 3: sys-debit → bank-credit (reversed fuzzy)
  const bankArrCr2 = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bc) || 0) }));
  const sysArrDb2 = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sd) || 0) }));
  bankArrCr2.forEach(b => {
    if (b._amt <= 0) return;
    const avail = sysArrDb2.filter(s => s._amt > 0);
    const allCombos = findAllSubsets(avail, b._amt, tol, MAX_SUBSET);
    totalCombos += allCombos.length;
    
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach((combo) => {
      const sumSys = round2(combo.reduce((a, s) => a + s._amt, 0));
      const diff = round2(Math.abs(b._amt - sumSys));
      const dk = `otm-fuzzy_SysDr-BankCr_${b._origIdx}_comb_${combo.map(s => s._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Sys Dr (multi) → Bank Cr (Fuzzy)',
        sysRow: b,
        bankRows: combo.map(s => ({ ...s, _isSys: true })),
        sysAmt: b._amt,
        bankSum: sumSys,
        diff,
        allCombos: allCombos.length,
        reversed: true,
        _decKey: dk
      });
      combo.forEach(s => p2Matches.push({
        type: 'otm-fuzzy',
        dir: 'Sys Dr (multi) → Bank Cr (Fuzzy)',
        bankAmt: b._amt,
        sysAmt: s._amt,
        diff,
        bankRow: b,
        sysRow: s,
        _decKey: dk
      }));
    });
  });

  // Direction 4: sys-credit → bank-debit (reversed fuzzy)
  const bankArrDb2 = bankRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, bd) || 0) }));
  const sysArrCr2 = sysRem.map((r, i) => ({ ...r, _i: i, _amt: round2(getNum(r, sc) || 0) }));
  bankArrDb2.forEach(b => {
    if (b._amt <= 0) return;
    const avail = sysArrCr2.filter(s => s._amt > 0);
    const allCombos = findAllSubsets(avail, b._amt, tol, MAX_SUBSET);
    totalCombos += allCombos.length;
    
    const limitedCombos = allCombos.slice(0, 10);
    limitedCombos.forEach((combo) => {
      const sumSys = round2(combo.reduce((a, s) => a + s._amt, 0));
      const diff = round2(Math.abs(b._amt - sumSys));
      const dk = `otm-fuzzy_SysCr-BankDr_${b._origIdx}_comb_${combo.map(s => s._origIdx).sort((x, y) => x - y).join('-')}`;
      groups.push({
        dir: 'Sys Cr (multi) → Bank Dr (Fuzzy)',
        sysRow: b,
        bankRows: combo.map(s => ({ ...s, _isSys: true })),
        sysAmt: b._amt,
        bankSum: sumSys,
        diff,
        allCombos: allCombos.length,
        reversed: true,
        _decKey: dk
      });
      combo.forEach(s => p2Matches.push({
        type: 'otm-fuzzy',
        dir: 'Sys Cr (multi) → Bank Dr (Fuzzy)',
        bankAmt: b._amt,
        sysAmt: s._amt,
        diff,
        bankRow: b,
        sysRow: s,
        _decKey: dk
      }));
    });
  });

  return { groups, combosCount: totalCombos, p2Matches };
}

function runExactNet(
  bankRem: any[],
  sysRem: any[],
  bd: string,
  bc: string,
  sd: string,
  sc: string
) {
  const bankUsed = new Set<number>();
  const sysUsed = new Set<number>();
  const groups: any[] = [];
  const p2Matches: any[] = [];

  const MAX_GROSS_SIZE = 5;
  const EPS = 0.005;

  const bRows = bankRem.map((r, i) => ({
    ...r, _i: i,
    _dr: round2(getNum(r, bd) || 0),
    _cr: round2(getNum(r, bc) || 0)
  }));
  const sRows = sysRem.map((r, i) => ({
    ...r, _i: i,
    _dr: round2(getNum(r, sd) || 0),
    _cr: round2(getNum(r, sc) || 0)
  }));

  function* genGrossCombosOfSize(drPool: any[], crPool: any[], totalSize: number) {
    for (let dc = 0; dc <= totalSize; dc++) {
      const cc = totalSize - dc;
      if (dc > drPool.length || cc > crPool.length) continue;
      for (const drCombo of _combosOfSize(drPool, dc)) {
        const drSet = new Set(drCombo.map(r => r._i));
        const crPool2 = crPool.filter(r => !drSet.has(r._i));
        if (crPool2.length < cc) continue;
        for (const crCombo of _combosOfSize(crPool2, cc)) {
          const sumDr = round2(drCombo.reduce((a, r) => a + r._dr, 0));
          const sumCr = round2(crCombo.reduce((a, r) => a + r._cr, 0));
          if (Math.abs(sumDr - sumCr) < EPS) continue;
          const netVal = round2(Math.abs(sumDr - sumCr));
          const netIsDr = sumDr > sumCr;
          yield { drRows: drCombo, crRows: crCombo, sumDr, sumCr, netVal, netIsDr };
        }
      }
    }
  }

  function commitGroup(
    grossSide: 'bank' | 'sys',
    netSide: 'bank' | 'sys',
    grossDrRows: any[],
    grossCrRows: any[],
    netRow: any,
    grossSumDr: number,
    grossSumCr: number,
    grossNet: number
  ) {
    const dk = `exactnet_${groups.length}`;
    let g: any;
    if (grossSide === 'bank') {
      const dir = grossNet === 0 ? '?' :
        (grossSumDr > grossSumCr
          ? `Bank(${grossDrRows.length}Dr−${grossCrRows.length}Cr)→Dr ${grossNet} = Sys Cr ${netRow._cr}`
          : `Bank(${grossCrRows.length}Cr−${grossDrRows.length}Dr)→Cr ${grossNet} = Sys Dr ${netRow._dr}`);
      g = {
        dir, netSide: 'bank', netRow_sys: netRow, netRow_bank: null,
        drRows: grossDrRows, crRows: grossCrRows,
        bankDrAmt: grossSumDr, bankCrAmt: grossSumCr, bankNet: grossNet,
        sysAmt: grossSumDr > grossSumCr ? netRow._cr : netRow._dr,
        diff: 0, _decKey: dk
      };
    } else {
      const dir = grossNet === 0 ? '?' :
        (grossSumDr > grossSumCr
          ? `Sys(${grossDrRows.length}Dr−${grossCrRows.length}Cr)→Dr ${grossNet} = Bank Cr ${netRow._cr}`
          : `Sys(${grossCrRows.length}Cr−${grossDrRows.length}Dr)→Cr ${grossNet} = Bank Dr ${netRow._dr}`);
      g = {
        dir, netSide: 'sys', netRow_bank: netRow, netRow_sys: null,
        drRows: grossDrRows, crRows: grossCrRows,
        sysDrAmt: grossSumDr, sysCrAmt: grossSumCr, sysNet: grossNet,
        bankAmt: grossSumDr > grossSumCr ? netRow._cr : netRow._dr,
        diff: 0, _decKey: dk
      };
    }
    groups.push(g);
    p2Matches.push({ type: 'exact-net', ...g, _decKey: dk });
  }

  for (let grossSize = 1; grossSize <= MAX_GROSS_SIZE; grossSize++) {
    let foundThisPass = true;
    while (foundThisPass) {
      foundThisPass = false;

      // Direction A: Bank = GROSS, Sys = NET
      for (const sRow of sRows) {
        if (sysUsed.has(sRow._i)) continue;

        const bDrPool = bRows.filter(b => !bankUsed.has(b._i) && b._dr > 0);
        const bCrPool = bRows.filter(b => !bankUsed.has(b._i) && b._cr > 0);

        if (sRow._dr > 0) {
          for (const combo of genGrossCombosOfSize(bDrPool, bCrPool, grossSize)) {
            if (combo.netIsDr) continue;
            if (Math.abs(combo.netVal - sRow._dr) >= EPS) continue;
            const allRows = [...combo.drRows, ...combo.crRows];
            if (allRows.some(r => bankUsed.has(r._i))) continue;
            allRows.forEach(r => bankUsed.add(r._i));
            sysUsed.add(sRow._i);
            commitGroup('bank', 'sys', combo.drRows, combo.crRows, sRow, combo.sumDr, combo.sumCr, combo.netVal);
            foundThisPass = true;
            break;
          }
          if (sysUsed.has(sRow._i)) continue;
        }

        if (sRow._cr > 0 && !sysUsed.has(sRow._i)) {
          const bDrPool2 = bRows.filter(b => !bankUsed.has(b._i) && b._dr > 0);
          const bCrPool2 = bRows.filter(b => !bankUsed.has(b._i) && b._cr > 0);
          for (const combo of genGrossCombosOfSize(bDrPool2, bCrPool2, grossSize)) {
            if (!combo.netIsDr) continue;
            if (Math.abs(combo.netVal - sRow._cr) >= EPS) continue;
            const allRows = [...combo.drRows, ...combo.crRows];
            if (allRows.some(r => bankUsed.has(r._i))) continue;
            allRows.forEach(r => bankUsed.add(r._i));
            sysUsed.add(sRow._i);
            commitGroup('bank', 'sys', combo.drRows, combo.crRows, sRow, combo.sumDr, combo.sumCr, combo.netVal);
            foundThisPass = true;
            break;
          }
        }
      }

      // Direction B: Sys = GROSS, Bank = NET
      for (const bRow of bRows) {
        if (bankUsed.has(bRow._i)) continue;

        const sDrPool = sRows.filter(s => !sysUsed.has(s._i) && s._dr > 0);
        const sCrPool = sRows.filter(s => !sysUsed.has(s._i) && s._cr > 0);

        if (bRow._dr > 0) {
          for (const combo of genGrossCombosOfSize(sDrPool, sCrPool, grossSize)) {
            if (combo.netIsDr) continue;
            if (Math.abs(combo.netVal - bRow._dr) >= EPS) continue;
            const allRows = [...combo.drRows, ...combo.crRows];
            if (allRows.some(r => sysUsed.has(r._i))) continue;
            allRows.forEach(r => sysUsed.add(r._i));
            bankUsed.add(bRow._i);
            commitGroup('sys', 'bank', combo.drRows, combo.crRows, bRow, combo.sumDr, combo.sumCr, combo.netVal);
            foundThisPass = true;
            break;
          }
          if (bankUsed.has(bRow._i)) continue;
        }

        if (bRow._cr > 0 && !bankUsed.has(bRow._i)) {
          const sDrPool2 = sRows.filter(s => !sysUsed.has(s._i) && s._dr > 0);
          const sCrPool2 = sRows.filter(s => !sysUsed.has(s._i) && s._cr > 0);
          for (const combo of genGrossCombosOfSize(sDrPool2, sCrPool2, grossSize)) {
            if (!combo.netIsDr) continue;
            if (Math.abs(combo.netVal - bRow._cr) >= EPS) continue;
            const allRows = [...combo.drRows, ...combo.crRows];
            if (allRows.some(r => sysUsed.has(r._i))) continue;
            allRows.forEach(r => sysUsed.add(r._i));
            bankUsed.add(bRow._i);
            commitGroup('sys', 'bank', combo.drRows, combo.crRows, bRow, combo.sumDr, combo.sumCr, combo.netVal);
            foundThisPass = true;
            break;
          }
        }
      }
    }
  }

  return { groups, p2Matches };
}

function runNetCross(
  bankRem: any[],
  sysRem: any[],
  bd: string,
  bc: string,
  sd: string,
  sc: string,
  tol: number
) {
  const bankUsed = new Set<number>();
  const sysUsed = new Set<number>();
  const groups: any[] = [];
  const p2Matches: any[] = [];
  let totalCombos = 0;
  const MAX_DR = 5;
  const MAX_CR = 3;

  const bRows = bankRem.map((r, i) => ({
    ...r, _i: i,
    _dr: round2(getNum(r, bd) || 0),
    _cr: round2(getNum(r, bc) || 0)
  }));
  const sRows = sysRem.map((r, i) => ({
    ...r, _i: i,
    _dr: round2(getNum(r, sd) || 0),
    _cr: round2(getNum(r, sc) || 0)
  }));

  function findGrossCombo(grossPool_dr: any[], grossPool_cr: any[], usedSet: Set<number>, netAmt: number) {
    let best: any = null;

    function tryDrLedCombos() {
      const drCandidates = grossPool_dr.filter(r => !usedSet.has(r._i));
      const crCandidates = grossPool_cr.filter(r => !usedSet.has(r._i));

      const drOnlySubsets = findAllSubsets(drCandidates.map(r => ({ ...r, _amt: r._dr })), netAmt, tol, MAX_DR);
      totalCombos += drOnlySubsets.length;
      for (const combo of drOnlySubsets) {
        const sumDr = round2(combo.reduce((a, r) => a + r._dr, 0));
        const diff = round2(Math.abs(sumDr - netAmt));
        if (diff <= tol && (!best || diff < best.diff)) {
          best = { drRows: combo, crRows: [], sumDr, sumCr: 0, netVal: sumDr, netIsDr: true, diff };
          if (diff < 0.005) return;
        }
      }

      for (let dSize = 1; dSize <= Math.min(MAX_DR, drCandidates.length); dSize++) {
        const dSubsets = _combosOfSize(drCandidates, dSize);
        for (const drCombo of dSubsets) {
          if (drCombo.some(r => usedSet.has(r._i))) continue;
          const sumDr = round2(drCombo.reduce((a, r) => a + r._dr, 0));
          const crTarget = round2(sumDr - netAmt);
          if (crTarget <= 0) continue;
          const crPool2 = crCandidates.filter(r => !drCombo.some(d => d._i === r._i));
          const crSubsets = findAllSubsets(crPool2.map(r => ({ ...r, _amt: r._cr })), crTarget, tol, MAX_CR);
          totalCombos += crSubsets.length;
          for (const crCombo of crSubsets) {
            if (crCombo.some(r => usedSet.has(r._i))) continue;
            const sumCr = round2(crCombo.reduce((a, r) => a + r._cr, 0));
            const netVal = round2(sumDr - sumCr);
            const diff = round2(Math.abs(netVal - netAmt));
            if (diff <= tol && (!best || diff < best.diff)) {
              best = { drRows: drCombo, crRows: crCombo, sumDr, sumCr, netVal, netIsDr: true, diff };
              if (diff < 0.005) return;
            }
          }
        }
      }
    }

    function tryCrLedCombos() {
      const drCandidates = grossPool_dr.filter(r => !usedSet.has(r._i));
      const crCandidates = grossPool_cr.filter(r => !usedSet.has(r._i));

      const crOnlySubsets = findAllSubsets(crCandidates.map(r => ({ ...r, _amt: r._cr })), netAmt, tol, MAX_CR);
      totalCombos += crOnlySubsets.length;
      for (const combo of crOnlySubsets) {
        const sumCr = round2(combo.reduce((a, r) => a + r._cr, 0));
        const diff = round2(Math.abs(sumCr - netAmt));
        if (diff <= tol && (!best || diff < best.diff)) {
          best = { drRows: [], crRows: combo, sumDr: 0, sumCr, netVal: sumCr, netIsDr: false, diff };
          if (diff < 0.005) return;
        }
      }

      for (let cSize = 1; cSize <= Math.min(MAX_CR, crCandidates.length); cSize++) {
        const cSubsets = _combosOfSize(crCandidates, cSize);
        for (const crCombo of cSubsets) {
          if (crCombo.some(r => usedSet.has(r._i))) continue;
          const sumCr = round2(crCombo.reduce((a, r) => a + r._cr, 0));
          const drTarget = round2(sumCr - netAmt);
          if (drTarget <= 0) continue;
          const drPool2 = drCandidates.filter(r => !crCombo.some(c => c._i === r._i));
          const drSubsets = findAllSubsets(drPool2.map(r => ({ ...r, _amt: r._dr })), drTarget, tol, MAX_DR);
          totalCombos += drSubsets.length;
          for (const drCombo of drSubsets) {
            if (drCombo.some(r => usedSet.has(r._i))) continue;
            const sumDr = round2(drCombo.reduce((a, r) => a + r._dr, 0));
            const netVal = round2(sumCr - sumDr);
            const diff = round2(Math.abs(netVal - netAmt));
            if (diff <= tol && (!best || diff < best.diff)) {
              best = { drRows: drCombo, crRows: crCombo, sumDr, sumCr, netVal, netIsDr: false, diff };
              if (diff < 0.005) return;
            }
          }
        }
      }
    }

    tryDrLedCombos();
    if (!best || best.diff > 0) tryCrLedCombos();
    return best;
  }

  // DIRECTION 1
  sRows.forEach(s => {
    if (sysUsed.has(s._i)) return;
    const drPool = bRows.filter(b => !bankUsed.has(b._i) && b._dr > 0);
    const crPool = bRows.filter(b => !bankUsed.has(b._i) && b._cr > 0);

    if (s._dr > 0) {
      const netAmt = s._dr;
      const result = findGrossCombo(drPool, crPool, bankUsed, netAmt);
      if (result && !result.netIsDr) {
        const allBankRows = [...result.drRows, ...result.crRows];
        if (!allBankRows.some(r => bankUsed.has(r._i))) {
          allBankRows.forEach(r => bankUsed.add(r._i));
          sysUsed.add(s._i);
          const dk = `net_${groups.length}`;
          const g = {
            dir: `Bank(${result.crRows.length}Cr−${result.drRows.length}Dr)→net Cr ${result.netVal} = Sys Dr ${netAmt}`,
            netSide: 'bank', netRow_sys: s, netRow_bank: null,
            drRows: result.drRows, crRows: result.crRows,
            bankDrAmt: result.sumDr, bankCrAmt: result.sumCr, bankNet: result.netVal,
            sysAmt: netAmt, diff: result.diff, _decKey: dk
          };
          groups.push(g);
          p2Matches.push({ type: 'net', ...g, _decKey: dk });
        }
      }
    }

    if (!sysUsed.has(s._i) && s._cr > 0) {
      const netAmt = s._cr;
      const result = findGrossCombo(drPool, crPool, bankUsed, netAmt);
      if (result && result.netIsDr) {
        const allBankRows = [...result.drRows, ...result.crRows];
        if (!allBankRows.some(r => bankUsed.has(r._i))) {
          allBankRows.forEach(r => bankUsed.add(r._i));
          sysUsed.add(s._i);
          const dk = `net_${groups.length}`;
          const g = {
            dir: `Bank(${result.drRows.length}Dr−${result.crRows.length}Cr)→net Dr ${result.netVal} = Sys Cr ${netAmt}`,
            netSide: 'bank', netRow_sys: s, netRow_bank: null,
            drRows: result.drRows, crRows: result.crRows,
            bankDrAmt: result.sumDr, bankCrAmt: result.sumCr, bankNet: result.netVal,
            sysAmt: netAmt, diff: result.diff, _decKey: dk
          };
          groups.push(g);
          p2Matches.push({ type: 'net', ...g, _decKey: dk });
        }
      }
    }
  });

  // DIRECTION 2
  bRows.forEach(b => {
    if (bankUsed.has(b._i)) return;
    const drPool = sRows.filter(s => !sysUsed.has(s._i) && s._dr > 0);
    const crPool = sRows.filter(s => !sysUsed.has(s._i) && s._cr > 0);

    if (b._dr > 0) {
      const netAmt = b._dr;
      const result = findGrossCombo(drPool, crPool, sysUsed, netAmt);
      if (result && !result.netIsDr) {
        const allSysRows = [...result.drRows, ...result.crRows];
        if (!allSysRows.some(r => sysUsed.has(r._i))) {
          allSysRows.forEach(r => sysUsed.add(r._i));
          bankUsed.add(b._i);
          const dk = `net_${groups.length}`;
          const g = {
            dir: `Sys(${result.crRows.length}Cr−${result.drRows.length}Dr)→net Cr ${result.netVal} = Bank Dr ${netAmt}`,
            netSide: 'sys', netRow_bank: b, netRow_sys: null,
            drRows: result.drRows, crRows: result.crRows,
            sysDrAmt: result.sumDr, sysCrAmt: result.sumCr, sysNet: result.netVal,
            bankAmt: netAmt, diff: result.diff, _decKey: dk
          };
          groups.push(g);
          p2Matches.push({ type: 'net', ...g, _decKey: dk });
        }
      }
    }

    if (!bankUsed.has(b._i) && b._cr > 0) {
      const netAmt = b._cr;
      const result = findGrossCombo(drPool, crPool, sysUsed, netAmt);
      if (result && result.netIsDr) {
        const allSysRows = [...result.drRows, ...result.crRows];
        if (!allSysRows.some(r => sysUsed.has(r._i))) {
          allSysRows.forEach(r => sysUsed.add(r._i));
          bankUsed.add(b._i);
          const dk = `net_${groups.length}`;
          const g = {
            dir: `Sys(${result.drRows.length}Dr−${result.crRows.length}Cr)→net Dr ${result.netVal} = Bank Cr ${netAmt}`,
            netSide: 'sys', netRow_bank: b, netRow_sys: null,
            drRows: result.drRows, crRows: result.crRows,
            sysDrAmt: result.sumDr, sysCrAmt: result.sumCr, sysNet: result.netVal,
            bankAmt: netAmt, diff: result.diff, _decKey: dk
          };
          groups.push(g);
          p2Matches.push({ type: 'net', ...g, _decKey: dk });
        }
      }
    }
  });

  // DIRECTION 3: Bank has GROSS (many) ↔ Sys has GROSS (many)
  {
    const MAX_BANK_GROSS = 3;
    const MAX_SYS_GROSS = 3;

    const bDrPool = bRows.filter(b => !bankUsed.has(b._i) && b._dr > 0);
    const bCrPool = bRows.filter(b => !bankUsed.has(b._i) && b._cr > 0);
    const sDrPool = sRows.filter(s => !sysUsed.has(s._i) && s._dr > 0);
    const sCrPool = sRows.filter(s => !sysUsed.has(s._i) && s._cr > 0);

    const bankHasMixed = bDrPool.length > 0 && bCrPool.length > 0;
    const sysHasMixed = sDrPool.length > 0 && sCrPool.length > 0;
    if (bankHasMixed && sysHasMixed) {
      function genGrossCombos(drPool: any[], crPool: any[], maxDr: number, maxCr: number) {
        const results: any[] = [];
        for (let dSize = 1; dSize <= Math.min(maxDr, drPool.length); dSize++) {
          const dSubsets = _combosOfSize(drPool, dSize);
          for (const drCombo of dSubsets) {
            for (let cSize = 1; cSize <= Math.min(maxCr, crPool.length); cSize++) {
              const cPool2 = crPool.filter(r => !drCombo.some(d => d._i === r._i));
              const cSubsets = _combosOfSize(cPool2, cSize);
              for (const crCombo of cSubsets) {
                const sumDr = round2(drCombo.reduce((a, r) => a + r._dr, 0));
                const sumCr = round2(crCombo.reduce((a, r) => a + r._cr, 0));
                if (sumDr === sumCr) continue;
                const netVal = round2(Math.abs(sumDr - sumCr));
                const netIsDr = sumDr > sumCr;
                results.push({ drRows: drCombo, crRows: crCombo, sumDr, sumCr, netVal, netIsDr });
              }
            }
          }
        }
        return results;
      }

      const bankGrossCombos = genGrossCombos(bDrPool, bCrPool, MAX_BANK_GROSS, MAX_BANK_GROSS);
      totalCombos += bankGrossCombos.length;

      for (const bCombo of bankGrossCombos) {
        const allBankRows = [...bCombo.drRows, ...bCombo.crRows];
        if (allBankRows.some(r => bankUsed.has(r._i))) continue;

        const bankNetIsDr = bCombo.netIsDr;
        const bankNet = bCombo.netVal;

        const sDrCands = sDrPool.filter(s => !sysUsed.has(s._i));
        const sCrCands = sCrPool.filter(s => !sysUsed.has(s._i));
        const sysResult = findGrossCombo(sDrCands, sCrCands, sysUsed, bankNet);

        if (!sysResult) continue;
        if (sysResult.netIsDr === bankNetIsDr) continue;
        if (round2(Math.abs(sysResult.netVal - bankNet)) > tol) continue;

        const allSysRows = [...sysResult.drRows, ...sysResult.crRows];
        if (allSysRows.some(r => sysUsed.has(r._i))) continue;

        allBankRows.forEach(r => bankUsed.add(r._i));
        allSysRows.forEach(r => sysUsed.add(r._i));
        totalCombos += 1;

        const dk = `net_${groups.length}`;
        const dir = bankNetIsDr
          ? `Bank(${bCombo.drRows.length}Dr−${bCombo.crRows.length}Cr)→net Dr ${bCombo.netVal} ↔ Sys(${sysResult.crRows.length}Cr−${sysResult.drRows.length}Dr)→net Cr ${sysResult.netVal}`
          : `Bank(${bCombo.crRows.length}Cr−${bCombo.drRows.length}Dr)→net Cr ${bCombo.netVal} ↔ Sys(${sysResult.drRows.length}Dr−${sysResult.crRows.length}Cr)→net Dr ${sysResult.netVal}`;

        const g = {
          dir,
          netSide: 'both',
          netRow_bank: null, netRow_sys: null,
          bankDrRows: bCombo.drRows, bankCrRows: bCombo.crRows,
          bankDrAmt: bCombo.sumDr, bankCrAmt: bCombo.sumCr, bankNet: bCombo.netVal,
          drRows: sysResult.drRows, crRows: sysResult.crRows,
          sysDrAmt: sysResult.sumDr, sysCrAmt: sysResult.sumCr, sysNet: sysResult.netVal,
          diff: round2(Math.abs(bCombo.netVal - sysResult.netVal)),
          _decKey: dk
        };
        groups.push(g);
        p2Matches.push({ type: 'net', ...g, _decKey: dk });
      }
    }
  }

  return { groups, combosCount: totalCombos, p2Matches };
}

// Helper function for Arabic normalization
function normalizeArabic(s: string): string {
  return s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, ''); // Remove diacritics
}

// Helper function for tokenized and abbreviation-aware string similarity (Jaccard + Substring)
function getStringSimilarity(s1: any, s2: any): number {
  if (!s1 || !s2) return 0;
  const raw1 = String(s1).toLowerCase().trim();
  const raw2 = String(s2).toLowerCase().trim();
  if (raw1 === raw2) return 1.0;

  const str1 = normalizeArabic(raw1);
  const str2 = normalizeArabic(raw2);
  if (str1 === str2) return 0.95;

  // Clean and tokenize (supporting Arabic and Latin)
  const tokenize = (s: string) => {
    return s.replace(/[^\w\s\u0600-\u06FF]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
  };

  const cleanToken = (t: string) => {
    let w = t;
    if (w.startsWith('ال') && w.length > 3) {
      w = w.substring(2);
    }
    return w;
  };

  const tokens1 = tokenize(str1).map(cleanToken);
  const tokens2 = tokenize(str2).map(cleanToken);
  if (tokens1.length === 0 || tokens2.length === 0) return 0;

  // Exact substring check on normalized strings
  if (str1.includes(str2) || str2.includes(str1)) {
    return 0.8;
  }

  // Token-based Jaccard Index
  const set2 = new Set(tokens2);
  let intersect = 0;
  tokens1.forEach(t => {
    if (set2.has(t)) intersect++;
  });

  const unionSize = new Set([...tokens1, ...tokens2]).size;
  return unionSize > 0 ? (intersect / unionSize) : 0;
}

// Clean and parse different date styles like DD/MM/YYYY, YYYY-MM-DD
function parseDateClean(dStr: any): Date | null {
  if (!dStr) return null;
  let representation = convertArabicNumerals(String(dStr).trim());
  if (!representation) return null;

  // Pattern match DD/MM/YYYY or D/M/YYYY (avoid JavaScript Date.parse mis-ordering months/days)
  const dmYRegex = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/;
  const matchDmy = representation.match(dmYRegex);
  if (matchDmy) {
    const day = parseInt(matchDmy[1]);
    const month = parseInt(matchDmy[2]) - 1;
    const year = parseInt(matchDmy[3]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Pattern match YYYY-MM-DD
  const yMdRegex = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/;
  const matchYmd = representation.match(yMdRegex);
  if (matchYmd) {
    const year = parseInt(matchYmd[1]);
    const month = parseInt(matchYmd[2]) - 1;
    const day = parseInt(matchYmd[3]);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return d;
  }

  // Try standard parsing as final fallback
  const parsed = Date.parse(representation);
  if (!isNaN(parsed)) return new Date(parsed);

  return null;
}

function getDaysDiff(d1Str: any, d2Str: any): number {
  const date1 = parseDateClean(d1Str);
  const date2 = parseDateClean(d2Str);
  if (!date1 || !date2) return 14; // default conservative day gap
  const diffTime = Math.abs(date1.getTime() - date2.getTime());
  return diffTime / (1000 * 60 * 60 * 24);
}

// Get array of bank original indices from arbitrary group shape
function getGroupBankIdxs(g: any): number[] {
  const list: number[] = [];
  if (g.bankRow && g.bankRow._origIdx !== undefined) list.push(g.bankRow._origIdx);
  if (g.netRow_bank && g.netRow_bank._origIdx !== undefined) list.push(g.netRow_bank._origIdx);
  if (g.bankRows) g.bankRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  if (g.drRows && g.netSide === 'bank') g.drRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  if (g.crRows && g.netSide === 'bank') g.crRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  if (g.bankDrRows) g.bankDrRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  if (g.bankCrRows) g.bankCrRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  return Array.from(new Set(list));
}

// Get array of system original indices from arbitrary group shape
function getGroupSysIdxs(g: any): number[] {
  const list: number[] = [];
  if (g.sysRow && g.sysRow._origIdx !== undefined) list.push(g.sysRow._origIdx);
  if (g.netRow_sys && g.netRow_sys._origIdx !== undefined) list.push(g.netRow_sys._origIdx);
  if (g.sysRows) g.sysRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  if (g.drRows && (g.netSide === 'sys' || g.netSide === 'both')) g.drRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  if (g.crRows && (g.netSide === 'sys' || g.netSide === 'both')) g.crRows.forEach((r: any) => { if (r._origIdx !== undefined) list.push(r._origIdx); });
  return Array.from(new Set(list));
}

// SINGLE UNIFIED PHASE 2 CALCULATION PIPELINE (Reduces noise & overlaps sequentially)
function runUnifiedReconciliation(
  bankRem: any[],
  sysRem: any[],
  bd: string,
  bc: string,
  sd: string,
  sc: string,
  bankMapping: any,
  sysMapping: any,
  tol: number
) {
  const bankUsed = new Set<number>();
  const sysUsed = new Set<number>();
  const unifiedGroups: any[] = [];

  const getNetSumOfItems = (items: any[]) => {
    let totalDr = 0;
    let totalCr = 0;
    items.forEach(r => {
      totalDr += Number(r._dr) || 0;
      totalCr += Number(r._cr) || 0;
    });
    if (totalDr > 0 && totalCr > 0) {
      return round2(Math.abs(totalDr - totalCr));
    }
    return round2(totalDr || totalCr);
  };

  const bDescCol = bankMapping?.desc || "Description";
  const bDateCol = bankMapping?.date || "Date";
  const sDescCol = sysMapping?.desc || "Description";
  const sDateCol = sysMapping?.date || "Date";

  // Standardize bank and system items with helper properties
  const bankItems = bankRem.map((r) => ({
    ...r,
    _amt: round2(getAmt(r, bd, bc)),
    _dr: round2(getNum(r, bd)),
    _cr: round2(getNum(r, bc)),
    _desc: r[bDescCol] || "",
    _date: r[bDateCol] || ""
  }));

  const sysItems = sysRem.map((r) => ({
    ...r,
    _amt: round2(getAmt(r, sd, sc)),
    _dr: round2(getNum(r, sd)),
    _cr: round2(getNum(r, sc)),
    _desc: r[sDescCol] || "",
    _date: r[sDateCol] || ""
  }));

  // Helper check
  const isBUsed = (item: any) => bankUsed.has(item._origIdx);
  const isSUsed = (item: any) => sysUsed.has(item._origIdx);

  // --- STAGE 1: Smart 1-to-1 Fuzzy (Description Semantics + Amount similarity + Date proximity) ---
  const candidate1to1: any[] = [];
  bankItems.forEach(b => {
    if (b._amt <= 0) return;
    sysItems.forEach(s => {
      if (s._amt <= 0) return;

      const diff = round2(Math.abs(b._amt - s._amt));
      if (diff <= tol) {
        const textSim = getStringSimilarity(b._desc, s._desc);
        const daysDiff = getDaysDiff(b._date, s._date);

        // Combined score based on semantic + date closeness + exact sum balance
        const dateScore = Math.max(0, 14 - daysDiff) / 14;
        const amtScore = diff === 0 ? 1.0 : (tol - diff) / tol;

        const textWeight = textSim > 0 ? 0.5 : 0.0;
        const dateWeight = 0.3;
        const amtWeight = textSim > 0 ? 0.2 : 0.7;

        const combinedVal = (textSim * textWeight) + (dateScore * dateWeight) + (amtScore * amtWeight);
        const confidence = Math.round(combinedVal * 100);

        // Filter out noisy coincidences (must pass strict business audit criteria)
        // Allow exact matches in amounts (diff === 0) up to 12 days apart, even with low/no description resemblance.
        // Allow within-tolerance matches up to 15 days apart if there is any minor text resemblance (>= 0.08).
        // Allow solid text resemblance matches (>= 0.4) up to 21 days apart.
        const isStrong = 
          (diff === 0 && daysDiff <= 12) || 
          (textSim >= 0.08 && diff <= tol && daysDiff <= 15) || 
          (textSim >= 0.4 && diff <= tol * 1.5 && daysDiff <= 21);

        if (isStrong) {
          candidate1to1.push({
            b, s, diff, textSim, daysDiff, confidence,
            sortKey: confidence + (diff === 0 ? 5 : 0) - (daysDiff * 0.4)
          });
        }
      }
    });
  });

  // Sort and greedy-bind candidates
  candidate1to1.sort((x, y) => y.sortKey - x.sortKey);
  candidate1to1.forEach(c => {
    if (bankUsed.has(c.b._origIdx) || sysUsed.has(c.s._origIdx)) return;

    bankUsed.add(c.b._origIdx);
    sysUsed.add(c.s._origIdx);

    const dk = `unified_1to1_b${c.b._origIdx}_s${c.s._origIdx}`;
    const cleanBDesc = String(c.b._desc).substring(0, 20);
    const cleanSDesc = String(c.s._desc).substring(0, 20);

    const reasonAr = `مطابقة فردية ذكية بفرق ${c.diff} وتطابق نصوص ${Math.round(c.textSim*100)}% (${cleanBDesc} ↔ ${cleanSDesc})`;
    const reasonEn = `Smart 1-to-1 match (diff ${c.diff}, text sim ${Math.round(c.textSim*100)}% (${cleanBDesc} ↔ ${cleanSDesc}))`;

    unifiedGroups.push({
      type: '1-to-1',
      dir: `Bank ↔ System`,
      bankRows: [c.b],
      sysRows: [c.s],
      bankSum: c.b._amt,
      sysSum: c.s._amt,
      diff: c.diff,
      score: c.confidence,
      reasonAr,
      reasonEn,
      _decKey: dk
    });
  });

  // --- STAGE 2: Smart Group Matches (One-to-Many and Many-to-One) ---
  const runGroupMatching = (isSysToMultiBank: boolean) => {
    const targets = isSysToMultiBank
      ? sysItems.filter(s => !isSUsed(s) && s._amt > 0)
      : bankItems.filter(b => !isBUsed(b) && b._amt > 0);

    const pool = isSysToMultiBank
      ? bankItems.filter(b => !isBUsed(b) && b._amt > 0)
      : sysItems.filter(s => !isSUsed(s) && s._amt > 0);

    targets.forEach(target => {
      // Find elements relatively near the target in date (within 7 days)
      const targetDate = target._date;
      const candidates = pool.filter(p => getDaysDiff(p._date, targetDate) <= 7);
      if (candidates.length < 2) return;

      // combinations of size 2 to 4
      const allCombos = findAllSubsets(candidates, target._amt, 0, 4); // Exact sums
      if (allCombos.length === 0) return;

      let bestCombo: any[] | null = null;
      let bestComboScore = -1;

      allCombos.forEach(combo => {
        let sharedSimilarity = 0;
        let avgDays = 0;

        combo.forEach(c => {
          sharedSimilarity += getStringSimilarity(c._desc, target._desc);
          avgDays += getDaysDiff(c._date, targetDate);
        });

        const textSim = sharedSimilarity / combo.length;
        const daysAvg = avgDays / combo.length;

        // Semantic score computation
        const score = (textSim * 0.7) + (Math.max(0, 7 - daysAvg) / 7 * 0.3);

        // Strict noise gate check
        const isAcceptable = textSim > 0.05 || daysAvg <= 3;
        if (isAcceptable && score > bestComboScore) {
          bestCombo = combo;
          bestComboScore = score;
        }
      });

      if (bestCombo) {
        // Double check not used yet
        const isStale = isSysToMultiBank
          ? sysUsed.has(target._origIdx) || bestCombo.some((b: any) => bankUsed.has(b._origIdx))
          : bankUsed.has(target._origIdx) || bestCombo.some((s: any) => sysUsed.has(s._origIdx));

        if (!isStale) {
          if (isSysToMultiBank) {
            sysUsed.add(target._origIdx);
            bestCombo.forEach((b: any) => bankUsed.add(b._origIdx));
          } else {
            bankUsed.add(target._origIdx);
            bestCombo.forEach((s: any) => sysUsed.add(s._origIdx));
          }

          const bRows = isSysToMultiBank ? bestCombo : [target];
          const sRows = isSysToMultiBank ? [target] : bestCombo;
          const bankSum = bRows.reduce((a, b: any) => a + b._amt, 0);
          const sysSum = sRows.reduce((a, s: any) => a + s._amt, 0);
          const diff = round2(Math.abs(bankSum - sysSum));

          const dk = `unified_group_${isSysToMultiBank ? 'sys' : 'bank'}_t${target._origIdx}_comb_${bestCombo.map((x: any) => x._origIdx).join('-')}`;
          const cleanDesc = String(target._desc).substring(0, 20);

          const reasonAr = isSysToMultiBank
            ? `تجميع ذكي: البند (${cleanDesc}) تماثل مع ${bestCombo.length} حركات بالبنك`
            : `تجميع ذكي: البند (${cleanDesc}) تماثل مع ${bestCombo.length} حركات بالنظام`;
          
          const reasonEn = isSysToMultiBank
            ? `Smart Group: Entry (${cleanDesc}) aligned with ${bestCombo.length} bank rows`
            : `Smart Group: Entry (${cleanDesc}) aligned with ${bestCombo.length} system rows`;

          unifiedGroups.push({
            type: isSysToMultiBank ? 'one-to-many' : 'many-to-one',
            dir: isSysToMultiBank ? 'Sys → Bank (multi)' : 'Bank → Sys (multi)',
            bankRows: bRows,
            sysRows: sRows,
            bankSum: round2(bankSum),
            sysSum: round2(sysSum),
            diff,
            score: Math.round(85 + (bestComboScore * 15)),
            reasonAr,
            reasonEn,
            _decKey: dk
          });
        }
      }
    });
  };

  runGroupMatching(true);
  runGroupMatching(false);

  // --- STAGE 3: Exact Net Match Groups ---
  const remB1 = bankItems.filter(b => !bankUsed.has(b._origIdx));
  const remS1 = sysItems.filter(s => !sysUsed.has(s._origIdx));

  const exactNet = runExactNet(remB1, remS1, bd, bc, sd, sc);
  exactNet.groups.forEach(eg => {
    const bIdxs = getGroupBankIdxs(eg);
    const sIdxs = getGroupSysIdxs(eg);

    const isStale = bIdxs.some(i => bankUsed.has(i)) || sIdxs.some(i => sysUsed.has(i));
    if (!isStale) {
      bIdxs.forEach(i => bankUsed.add(i));
      sIdxs.forEach(i => sysUsed.add(i));

      const bankItemsList = bIdxs.map(idx => bankItems.find(x => x._origIdx === idx)).filter(Boolean);
      const sysItemsList = sIdxs.map(idx => sysItems.find(x => x._origIdx === idx)).filter(Boolean);

      const bSum = getNetSumOfItems(bankItemsList);
      const sSum = getNetSumOfItems(sysItemsList);

      const dk = `unified_exactsn_${unifiedGroups.length}`;
      const reasonAr = `مطابقة الصافي الدقيقة: موازنة القيود الدفترية لـ ${bankItemsList.length} بنك مع ${sysItemsList.length} نظام`;
      const reasonEn = `Exact Net Match: Ledger balancing of ${bankItemsList.length} bank with ${sysItemsList.length} system entries`;

      unifiedGroups.push({
        type: 'net-exact',
        dir: eg.dir,
        bankRows: bankItemsList,
        sysRows: sysItemsList,
        bankSum: round2(bSum),
        sysSum: round2(sSum),
        diff: 0,
        score: NetConfidenceScore(bankItemsList, sysItemsList, true),
        reasonAr,
        reasonEn,
        _decKey: dk
      });
    }
  });

  // --- STAGE 4: Net Cross Matching with Tolerance ---
  const remB2 = bankItems.filter(b => !bankUsed.has(b._origIdx));
  const remS2 = sysItems.filter(s => !sysUsed.has(s._origIdx));

  if (remB2.length > 0 && remS2.length > 0) {
    const netCross = runNetCross(remB2, remS2, bd, bc, sd, sc, tol);
    netCross.groups.forEach(cg => {
      const bIdxs = getGroupBankIdxs(cg);
      const sIdxs = getGroupSysIdxs(cg);

      const isStale = bIdxs.some(i => bankUsed.has(i)) || sIdxs.some(i => sysUsed.has(i));
      if (!isStale) {
        bIdxs.forEach(i => bankUsed.add(i));
        sIdxs.forEach(i => sysUsed.add(i));

        const bankItemsList = bIdxs.map(idx => bankItems.find(x => x._origIdx === idx)).filter(Boolean);
        const sysItemsList = sIdxs.map(idx => sysItems.find(x => x._origIdx === idx)).filter(Boolean);

        const bSum = getNetSumOfItems(bankItemsList);
        const sSum = getNetSumOfItems(sysItemsList);

        const dk = `unified_fuzzycross_${unifiedGroups.length}`;
        const reasonAr = `مطابقة صافي فروقات ميزان مع تسامح ±${cg.diff}`;
        const reasonEn = `Net Cross Match with tolerance ±${cg.diff}`;

        unifiedGroups.push({
          type: 'net-fuzzy',
          dir: cg.dir,
          bankRows: bankItemsList,
          sysRows: sysItemsList,
          bankSum: round2(bSum),
          sysSum: round2(sSum),
          diff: cg.diff,
          score: NetConfidenceScore(bankItemsList, sysItemsList, false),
          reasonAr,
          reasonEn,
          _decKey: dk
        });
      }
    });
  }

  // Map to final schema
  const p2Matches: any[] = [];
  unifiedGroups.forEach(g => {
    p2Matches.push({
      type: 'unified',
      _decKey: g._decKey,
      group: g,
      bankAmt: g.bankSum, 
      sysAmt: g.sysSum,
      diff: g.diff,
      // Pass representative rows for rendering logic in Modal
      bankRow: g.bankRows[0] || {},
      sysRow: g.sysRows[0] || {}
    });
  });

  return { groups: unifiedGroups, p2Matches };
}

// Compute Net Score based on text similarity and dates
function NetConfidenceScore(bank: any[], sys: any[], isExact: boolean): number {
  let textSum = 0;
  let matchesCount = 0;
  bank.forEach(b => {
    sys.forEach(s => {
      textSum += getStringSimilarity(b._desc, s._desc);
      matchesCount++;
    });
  });

  const textAvg = matchesCount > 0 ? (textSum / matchesCount) : 0;
  const base = isExact ? 90 : 75;
  return Math.min(100, Math.round(base + (textAvg * 10)));
}

onmessage = (e: MessageEvent) => {
  const { type, bankRem, sysRem, bd, bc, sd, sc, bankMapping, sysMapping, tol } = e.data;

  try {
    let result: any;
    if (type === 'unified') {
      result = runUnifiedReconciliation(bankRem, sysRem, bd, bc, sd, sc, bankMapping, sysMapping, tol);
    } else if (type === 'one-to-many') {
      result = runOneToMany(bankRem, sysRem, bd, bc, sd, sc);
    } else if (type === 'fuzzy') {
      result = runFuzzy(bankRem, sysRem, bd, bc, sd, sc, tol);
    } else if (type === 'otm-fuzzy') {
      result = runOtmFuzzy(bankRem, sysRem, bd, bc, sd, sc, tol);
    } else if (type === 'exact-net') {
      result = runExactNet(bankRem, sysRem, bd, bc, sd, sc);
    } else if (type === 'net-cross') {
      result = runNetCross(bankRem, sysRem, bd, bc, sd, sc, tol);
    } else {
      throw new Error(`Unknown match type: ${type}`);
    }

    postMessage({ success: true, ...result });
  } catch (err: any) {
    postMessage({ success: false, error: err.message });
  }
};
