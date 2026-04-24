import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Operator, RosterSnapshot, ShiftSwapRequest, VacationRequest } from './types';
import {
  countBusinessDays,
  enumerateDays,
  formatIsoDate,
  parseYmd,
  rangesOverlap,
} from './utils';
import { ISRAEL_HOLIDAYS } from './israelHolidays';

type RequestStatus = 'pending' | 'accepted' | 'rejected';
type Tab = 'request' | 'shiftSwap' | 'inbox' | 'calendar' | 'roster';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

function initialTabFromUrl(): Tab {
  if (typeof window === 'undefined') return 'request';
  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'roster' || view === 'calendar' || view === 'inbox' || view === 'shiftSwap' || view === 'request'
    ? view
    : 'request';
}

function shareablePublicUrl(): string | null {
  const fromEnv = (import.meta.env.VITE_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (fromEnv) return fromEnv;
  if (typeof window === 'undefined') return null;
  const h = window.location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return null;
  return window.location.origin;
}

function rosterTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/#/g, ' ')
    .split(/[\\/,&+]+/)
    .flatMap((part) => part.trim().split(/\s+/))
    .filter(Boolean);
}

function rosterNameMatches(rosterName: string, personName: string, personEmail: string): boolean {
  const roster = rosterTokens(rosterName);
  const person = rosterTokens(personName);
  const email = personEmail.toLowerCase();
  return roster.some((token) => person.includes(token) || email.includes(token));
}

function rosterShiftClass(operatorName: string, value: string): string {
  const code = value.trim().toUpperCase();
  const isKety = operatorName.trim().toLowerCase() === 'kety';
  if (isKety && code === 'D') return 'shift-kety-d';
  if (code === 'O') return 'shift-o';
  if (code === 'V') return 'shift-v';
  if (code === 'D') return 'shift-d';
  if (code === 'N') return 'shift-n';
  if (code === 'C') return 'shift-c';
  return '';
}

function shortWeekday(ymd: string): string {
  const d = parseYmd(ymd);
  return ['SUN', 'M', 'TU', 'W', 'TH', 'F', 'SAT'][d.getDay()] || '';
}

function formatRosterDate(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export default function App() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [shiftSwaps, setShiftSwaps] = useState<ShiftSwapRequest[]>([]);
  const [roster, setRoster] = useState<RosterSnapshot | null>(null);
  const [tab, setTab] = useState<Tab>(() => initialTabFromUrl());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [operatorEmail, setOperatorEmail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [swapRequesterEmail, setSwapRequesterEmail] = useState('');
  const [swapColleagueEmail, setSwapColleagueEmail] = useState('');
  const [swapRosterDate, setSwapRosterDate] = useState('');
  const [swapReturnRosterDate, setSwapReturnRosterDate] = useState('');
  const [swapCurrentShift, setSwapCurrentShift] = useState<'morning' | 'night'>('morning');
  const [swapRequestedShift, setSwapRequestedShift] = useState<'morning' | 'night'>('night');
  const [swapDetails, setSwapDetails] = useState('');
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null);
  const [copyShareDone, setCopyShareDone] = useState(false);
  const [deletionNotice, setDeletionNotice] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [swapFiles, setSwapFiles] = useState<FileList | null>(null);
  const [calFilterFrom, setCalFilterFrom] = useState('');
  const [calFilterTo, setCalFilterTo] = useState('');
  const [calNameFilter, setCalNameFilter] = useState('');
  const [rosterUploading, setRosterUploading] = useState(false);
  const [rosterFromDate, setRosterFromDate] = useState(() => formatIsoDate(new Date()));
  const [selectedRosterRow, setSelectedRosterRow] = useState('');

  const [emailTo, setEmailTo] = useState<Record<string, boolean>>({});

  const publicShareUrl = useMemo(() => shareablePublicUrl(), []);

  function appViewLink(view: Tab): string {
    const base =
      publicShareUrl ||
      (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}`.replace(/\/$/, '') : '');
    return `${base}/?view=${view}`;
  }

  const selectedOp = useMemo(
    () => operators.find((o) => o.email === operatorEmail),
    [operators, operatorEmail]
  );
  const swapRequester = useMemo(
    () => operators.find((o) => o.email === swapRequesterEmail),
    [operators, swapRequesterEmail]
  );
  const swapColleague = useMemo(
    () => operators.find((o) => o.email === swapColleagueEmail),
    [operators, swapColleagueEmail]
  );

  const businessDays = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return countBusinessDays(startDate, endDate);
  }, [startDate, endDate]);

  const copyPublicLink = useCallback(() => {
    const u = publicShareUrl;
    if (!u) return;
    void navigator.clipboard.writeText(u).then(() => {
      setCopyShareDone(true);
      window.setTimeout(() => setCopyShareDone(false), 2000);
    });
  }, [publicShareUrl]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 12000);
    try {
      const [opRes, reqRes, swapRes, rosterRes] = await Promise.all([
        fetch(`${API}/api/operators`, { signal: ctl.signal }),
        fetch(`${API}/api/requests`, { signal: ctl.signal }),
        fetch(`${API}/api/shift-swaps`, { signal: ctl.signal }),
        fetch(`${API}/api/roster`, { signal: ctl.signal }),
      ]);
      const [opsRaw, reqsRaw, swapsRaw, rosterRaw] = await Promise.all([
        opRes.json(),
        reqRes.json(),
        swapRes.json(),
        rosterRes.json(),
      ]);
      const ops = Array.isArray(opsRaw) ? (opsRaw as Operator[]) : [];
      const reqs = Array.isArray(reqsRaw) ? (reqsRaw as VacationRequest[]) : [];
      const swaps = Array.isArray(swapsRaw) ? (swapsRaw as ShiftSwapRequest[]) : [];
      const parts: string[] = [];
      if (!opRes.ok) parts.push('operators');
      if (!reqRes.ok) parts.push('vacation requests');
      if (!swapRes.ok) parts.push('shift swaps');
      if (!rosterRes.ok) parts.push('roster');
      if (parts.length) {
        setLoadError(
          `API returned an error for: ${parts.join(', ')}. If you use Neon, run server/schema.sql in the Neon SQL editor.`
        );
      }
      setOperators(ops);
      setRequests(reqs);
      setShiftSwaps(swaps);
      setRoster(rosterRaw && typeof rosterRaw === 'object' ? (rosterRaw as RosterSnapshot) : null);
      const map: Record<string, boolean> = {};
      for (const o of ops) map[o.email] = false;
      setEmailTo(map);
    } catch (e) {
      const msg =
        e instanceof Error && e.name === 'AbortError'
          ? 'Timed out waiting for the API (12s). Start the backend with npm run dev:server or run npm run dev.'
          : 'Could not reach the API. Start the backend (port 3847) or run npm run dev.';
      setLoadError(msg);
      setOperators([]);
      setRequests([]);
      setShiftSwaps([]);
      setRoster(null);
      setEmailTo({});
    } finally {
      window.clearTimeout(t);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const calendarMonth = useMemo(() => new Date(), []);
  const [calYear, setCalYear] = useState(calendarMonth.getFullYear());
  const [calMonth, setCalMonth] = useState(calendarMonth.getMonth());

  const filteredCalendarRequests = useMemo(() => {
    const q = calNameFilter.trim().toLowerCase();
    return requests.filter((r) => {
      if (q && !`${r.operatorName} ${r.operatorEmail}`.toLowerCase().includes(q)) return false;
      if (calFilterFrom && r.endDate < calFilterFrom) return false;
      if (calFilterTo && r.startDate > calFilterTo) return false;
      return true;
    });
  }, [requests, calNameFilter, calFilterFrom, calFilterTo]);

  const filteredCalendarSwaps = useMemo(() => {
    const q = calNameFilter.trim().toLowerCase();
    return shiftSwaps.filter((s) => {
      if (q) {
        const blob = `${s.requesterName} ${s.colleagueName} ${s.requesterEmail} ${s.colleagueEmail}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      const swapEnd = s.returnRosterDate || s.rosterDate;
      if (calFilterFrom && swapEnd < calFilterFrom) return false;
      if (calFilterTo && s.rosterDate > calFilterTo) return false;
      return true;
    });
  }, [shiftSwaps, calNameFilter, calFilterFrom, calFilterTo]);

  const calendarLinesByDay = useMemo(() => {
    const m = new Map<string, { kind: 'vac' | 'swap'; title: string; note: string }[]>();
    for (const r of filteredCalendarRequests) {
      for (const day of enumerateDays(r.startDate, r.endDate)) {
        if (!m.has(day)) m.set(day, []);
        const noteParts = [r.notes, r.adminNotes].map((x) => (x || '').trim()).filter(Boolean);
        m.get(day)!.push({
          kind: 'vac',
          title: r.operatorName,
          note: noteParts.length ? noteParts.join(' · ') : '—',
        });
      }
    }
    for (const s of filteredCalendarSwaps) {
      if (s.status === 'rejected') continue;
      const noteParts = [s.status || 'pending', s.details, s.adminNotes].map((x) => (x || '').trim()).filter(Boolean);
      if (!m.has(s.rosterDate)) m.set(s.rosterDate, []);
      m.get(s.rosterDate)!.push({
        kind: 'swap',
        title: `${s.colleagueName} covers ${s.requesterName}`,
        note: `${s.currentShift}${noteParts.length ? ` · ${noteParts.join(' · ')}` : ''}`,
      });
      if (s.returnRosterDate) {
        if (!m.has(s.returnRosterDate)) m.set(s.returnRosterDate, []);
        m.get(s.returnRosterDate)!.push({
          kind: 'swap',
          title: `${s.requesterName} covers ${s.colleagueName}`,
          note: `${s.requestedShift}${noteParts.length ? ` · ${noteParts.join(' · ')}` : ''}`,
        });
      }
    }
    return m;
  }, [filteredCalendarRequests, filteredCalendarSwaps]);

  const rosterWithRequests = useMemo(() => {
    if (!roster) return null;
    return {
      ...roster,
      rows: roster.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell, i) => {
          const ymd = roster.dates[i];
          const employee = row.operatorName.trim().toLowerCase();
          const notes: string[] = [];
          for (const r of requests) {
            const sameOperator =
              r.operatorName.trim().toLowerCase() === employee ||
              rosterNameMatches(row.operatorName, r.operatorName, r.operatorEmail);
            if (sameOperator && ymd >= r.startDate && ymd <= r.endDate && r.status !== 'rejected') {
              notes.push(`${r.status === 'accepted' ? 'Approved' : 'Requesting'} vacation`);
            }
          }
          for (const s of shiftSwaps) {
            const isRequester =
              s.requesterName.trim().toLowerCase() === employee ||
              rosterNameMatches(row.operatorName, s.requesterName, s.requesterEmail);
            const isColleague =
              s.colleagueName.trim().toLowerCase() === employee ||
              rosterNameMatches(row.operatorName, s.colleagueName, s.colleagueEmail);
            const swapState = s.status === 'accepted' ? 'Approved' : 'Requesting';
            if (s.status !== 'rejected' && ymd === s.rosterDate) {
              if (isRequester || isColleague) notes.push(`${swapState}: ${s.colleagueName} covers ${s.requesterName}`);
            }
            if (s.status !== 'rejected' && s.returnRosterDate && ymd === s.returnRosterDate) {
              if (isRequester || isColleague) notes.push(`${swapState}: ${s.requesterName} covers ${s.colleagueName}`);
            }
          }
          return { ...cell, hasRequest: notes.length > 0, requestNotes: notes };
        }),
      })),
    };
  }, [requests, roster, shiftSwaps]);

  const visibleRoster = useMemo(() => {
    if (!rosterWithRequests) return null;
    const startIndex = rosterFromDate ? rosterWithRequests.dates.findIndex((d) => d >= rosterFromDate) : 0;
    const from = startIndex < 0 ? rosterWithRequests.dates.length : startIndex;
    return {
      ...rosterWithRequests,
      dates: rosterWithRequests.dates.slice(from),
      rows: rosterWithRequests.rows.map((row) => ({
        ...row,
        cells: row.cells.slice(from),
      })),
    };
  }, [rosterFromDate, rosterWithRequests]);

  const todayYmd = useMemo(() => formatIsoDate(new Date()), []);

  const holidaysByDate = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of ISRAEL_HOLIDAYS) {
      map.set(h.date, h.name);
    }
    return map;
  }, []);

  const draftConflicts = useMemo(() => {
    if (!startDate || !endDate || !operatorEmail) return [];
    const out: { otherName: string; otherEmail: string; otherRange: string }[] = [];
    for (const r of requests) {
      if (r.operatorEmail === operatorEmail) continue;
      if (!rangesOverlap(startDate, endDate, r.startDate, r.endDate)) continue;
      out.push({
        otherName: r.operatorName,
        otherEmail: r.operatorEmail,
        otherRange: `${r.startDate} → ${r.endDate}`,
      });
    }
    return out;
  }, [requests, startDate, endDate, operatorEmail]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOp || !startDate || !endDate) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('operatorName', selectedOp.name);
      fd.append('operatorEmail', selectedOp.email);
      fd.append('startDate', startDate);
      fd.append('endDate', endDate);
      fd.append('daysCount', String(businessDays));
      fd.append('notes', notes);
      if (files) for (let i = 0; i < files.length; i++) fd.append('attachments', files[i]);

      const res = await fetch(`${API}/api/requests`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Save failed');
      const created = (await res.json()) as VacationRequest;
      setRequests((prev) => [created, ...prev]);
      setNotes('');
      setFiles(null);
      setTab('inbox');
    } catch {
      alert('Could not save the request. Is the API running?');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleShiftSwapSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!swapRequester || !swapColleague || !swapRosterDate) return;
    if (swapRequester.email === swapColleague.email) {
      alert('Requester and colleague must be different operators.');
      return;
    }

    setSwapSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('requesterName', swapRequester.name);
      fd.append('requesterEmail', swapRequester.email);
      fd.append('colleagueName', swapColleague.name);
      fd.append('colleagueEmail', swapColleague.email);
      fd.append('rosterDate', swapRosterDate);
      fd.append('returnRosterDate', swapReturnRosterDate);
      fd.append('currentShift', swapCurrentShift);
      fd.append('requestedShift', swapRequestedShift);
      fd.append('details', swapDetails.trim());
      if (swapFiles) for (let i = 0; i < swapFiles.length; i++) fd.append('attachments', swapFiles[i]);
      const res = await fetch(`${API}/api/shift-swaps`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Save failed');
      const created = (await res.json()) as ShiftSwapRequest;
      setShiftSwaps((prev) => [created, ...prev]);
      setSwapColleagueEmail('');
      setSwapRosterDate('');
      setSwapReturnRosterDate('');
      setSwapCurrentShift('morning');
      setSwapRequestedShift('night');
      setSwapDetails('');
      setSwapFiles(null);
      setTab('inbox');
    } catch {
      alert('Could not save shift swap request. Is the API running?');
    } finally {
      setSwapSubmitting(false);
    }
  }

  function buildNotificationBody(req: VacationRequest): string {
    const rosterLink = appViewLink('roster');
    const lines = [
      `Vacation request — ${req.operatorName}`,
      `Dates: ${req.startDate} to ${req.endDate}`,
      `Business days: ${req.daysCount}`,
      req.notes ? `Notes: ${req.notes}` : '',
      '',
      `Open roster view: ${rosterLink}`,
      '',
      'Outlook cannot add attachments via a web link. Open the inbox in this app and download attachments if needed.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  function openMailto(req: VacationRequest) {
    const recipients = operators
      .filter((o) => emailTo[o.email])
      .map((o) => o.email);
    const to = recipients.length ? recipients.join(';') : '';
    const subject = encodeURIComponent(
      `Vacation request — ${req.operatorName} (${req.startDate}–${req.endDate})`
    );
    const body = encodeURIComponent(buildNotificationBody(req));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function openWhatsApp(req: VacationRequest) {
    const text = encodeURIComponent(buildNotificationBody(req));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function buildShiftSwapRequestBody(s: ShiftSwapRequest): string {
    return [
      `Shift swap request — ${s.requesterName}`,
      `With: ${s.colleagueName}`,
      `Needs free: ${s.rosterDate} (${s.currentShift}) — ${s.colleagueName} covers`,
      s.returnRosterDate ? `Returns shift: ${s.returnRosterDate} (${s.requestedShift}) — ${s.requesterName} works` : '',
      s.details ? `Details: ${s.details}` : '',
      '',
      `Open roster view: ${appViewLink('roster')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function openMailtoShiftSwap(s: ShiftSwapRequest) {
    const recipients = operators.filter((o) => emailTo[o.email]).map((o) => o.email);
    const to = recipients.length ? recipients.join(';') : '';
    const subject = encodeURIComponent(
      `Shift swap — ${s.requesterName} / ${s.colleagueName} (${s.rosterDate})`
    );
    const body = encodeURIComponent(buildShiftSwapRequestBody(s));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function openWhatsAppShiftSwap(s: ShiftSwapRequest) {
    const text = encodeURIComponent(buildShiftSwapRequestBody(s));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function buildDecisionVacationBody(req: VacationRequest, status: RequestStatus): string {
    return [
      `Hello ${req.operatorName},`,
      '',
      `Your vacation request (${req.startDate} → ${req.endDate}) was ${status}.`,
      req.adminNotes ? `Admin note: ${req.adminNotes}` : '',
      '',
      `Open roster view: ${appViewLink('roster')}`,
      '',
      'If you have questions, reply to the roster owner.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function buildDecisionSwapBody(s: ShiftSwapRequest, status: RequestStatus): string {
    return [
      `Hello ${s.requesterName} and ${s.colleagueName},`,
      '',
      `Your shift swap request was ${status}.`,
      `Needs free: ${s.rosterDate} (${s.currentShift}) — ${s.colleagueName} covers`,
      s.returnRosterDate ? `Returns shift: ${s.returnRosterDate} (${s.requestedShift}) — ${s.requesterName} works` : '',
      s.adminNotes ? `Admin note: ${s.adminNotes}` : '',
      '',
      `Open roster view: ${appViewLink('roster')}`,
      '',
      'If you have questions, reply to the roster owner.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function setVacationStatus(req: VacationRequest, status: RequestStatus, notifyEmail = false) {
    setPatchBusyId(req.id);
    try {
      const res = await fetch(`${API}/api/requests/${encodeURIComponent(req.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('status');
      setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status } : r)));
      if (status === 'accepted') {
        setStatusNotice('Approved: roster data was updated. The request appears in Roster view after refresh / next load.');
      }
      if (notifyEmail) {
        const subject = encodeURIComponent(`Vacation request ${status} (${req.startDate}–${req.endDate})`);
        const body = encodeURIComponent(buildDecisionVacationBody({ ...req, status }, status));
        window.location.href = `mailto:${req.operatorEmail}?subject=${subject}&body=${body}`;
      }
    } catch {
      alert('Could not update status. Check API and database.');
    } finally {
      setPatchBusyId(null);
    }
  }

  async function setShiftSwapStatus(s: ShiftSwapRequest, status: RequestStatus, notifyEmail = false) {
    setPatchBusyId(s.id);
    try {
      const res = await fetch(`${API}/api/shift-swaps/${encodeURIComponent(s.id)}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('status');
      setShiftSwaps((prev) => prev.map((x) => (x.id === s.id ? { ...x, status } : x)));
      if (status === 'accepted') {
        setStatusNotice('Approved: roster data was updated. The request appears in Roster view after refresh / next load.');
      }
      if (notifyEmail) {
        const subject = encodeURIComponent(`Shift swap ${status} (${s.rosterDate})`);
        const body = encodeURIComponent(buildDecisionSwapBody({ ...s, status }, status));
        window.location.href = `mailto:${s.requesterEmail};${s.colleagueEmail}?subject=${subject}&body=${body}`;
      }
    } catch {
      alert('Could not update status. Check API and database.');
    } finally {
      setPatchBusyId(null);
    }
  }

  async function uploadRoster(file: File | null) {
    if (!file) return;
    setRosterUploading(true);
    try {
      const fd = new FormData();
      fd.append('roster', file);
      const res = await fetch(`${API}/api/roster`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('roster');
      setRoster((await res.json()) as RosterSnapshot);
      setTab('roster');
    } catch {
      alert('Could not upload roster. Expected Excel with dates in row 2 and operators in A3:A12.');
    } finally {
      setRosterUploading(false);
    }
  }

  function openWhatsAppDecisionVacation(req: VacationRequest) {
    const status = (req.status || 'pending') as RequestStatus;
    const text = encodeURIComponent(buildDecisionVacationBody(req, status));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function openWhatsAppDecisionSwap(s: ShiftSwapRequest) {
    const status = (s.status || 'pending') as RequestStatus;
    const text = encodeURIComponent(buildDecisionSwapBody(s, status));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  async function saveVacationSchedule(req: VacationRequest, startDate: string, endDate: string) {
    if (!startDate || !endDate || parseYmd(startDate) > parseYmd(endDate)) {
      alert('End date must be on or after start date.');
      return;
    }
    setPatchBusyId(req.id);
    try {
      const daysCount = countBusinessDays(startDate, endDate);
      const res = await fetch(`${API}/api/requests/${encodeURIComponent(req.id)}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, daysCount }),
      });
      if (!res.ok) throw new Error('schedule');
      setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, startDate, endDate, daysCount } : r)));
      setStatusNotice('Dates updated. Re-check Roster view after refresh / next load.');
    } catch {
      alert('Could not update vacation dates.');
    } finally {
      setPatchBusyId(null);
    }
  }

  async function saveShiftSwapSchedule(s: ShiftSwapRequest, rosterDate: string, returnRosterDate = s.returnRosterDate || '') {
    if (!rosterDate) return;
    setPatchBusyId(s.id);
    try {
      const res = await fetch(`${API}/api/shift-swaps/${encodeURIComponent(s.id)}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterDate, returnRosterDate }),
      });
      if (!res.ok) throw new Error('schedule');
      setShiftSwaps((prev) => prev.map((x) => (x.id === s.id ? { ...x, rosterDate, returnRosterDate } : x)));
      setStatusNotice('Date updated. Re-check Roster view after refresh / next load.');
    } catch {
      alert('Could not update shift swap date.');
    } finally {
      setPatchBusyId(null);
    }
  }

  function buildRosterProcessedVacationBody(req: VacationRequest): string {
    return [
      `Hello ${req.operatorName},`,
      '',
      `Your vacation request (${req.startDate} → ${req.endDate}, ${req.daysCount} business days) has been accepted and updated in the published roster.`,
      '',
      `Open roster view: ${appViewLink('roster')}`,
      '',
      'If anything looks wrong, reply to the roster owner.',
    ].join('\n');
  }

  function buildRosterProcessedSwapBody(s: ShiftSwapRequest): string {
    return [
      `Hello ${s.requesterName} and ${s.colleagueName},`,
      '',
      `Your shift swap has been accepted and updated in the published roster.`,
      `Needs free: ${s.rosterDate} (${s.currentShift}) — ${s.colleagueName} covers`,
      s.returnRosterDate ? `Returns shift: ${s.returnRosterDate} (${s.requestedShift}) — ${s.requesterName} works` : '',
      s.details ? `Original request: ${s.details}` : '',
      '',
      `Open roster view: ${appViewLink('roster')}`,
      '',
      'If anything looks wrong, reply to the roster owner.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  function openMailtoRosterProcessedVacation(req: VacationRequest) {
    const to = req.operatorEmail;
    const subject = encodeURIComponent(`Roster updated — vacation (${req.startDate}–${req.endDate})`);
    const body = encodeURIComponent(buildRosterProcessedVacationBody(req));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function openMailtoRosterProcessedSwap(s: ShiftSwapRequest) {
    const to = `${s.requesterEmail};${s.colleagueEmail}`;
    const subject = encodeURIComponent(`Roster updated — shift swap (${s.rosterDate})`);
    const body = encodeURIComponent(buildRosterProcessedSwapBody(s));
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  function openWhatsAppRosterProcessedVacation(req: VacationRequest) {
    const text = encodeURIComponent(buildRosterProcessedVacationBody(req));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  function openWhatsAppRosterProcessedSwap(s: ShiftSwapRequest) {
    const text = encodeURIComponent(buildRosterProcessedSwapBody(s));
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  async function patchVacationRoster(id: string, rosterProcessed: boolean) {
    setPatchBusyId(id);
    try {
      const res = await fetch(`${API}/api/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterProcessed }),
      });
      if (!res.ok) throw new Error('patch');
      const data = (await res.json()) as {
        id: string;
        rosterProcessed: boolean;
        processedAt: string | null;
        adminNotes?: string;
      };
      setRequests((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                rosterProcessed: data.rosterProcessed,
                processedAt: data.processedAt,
                adminNotes: data.adminNotes ?? r.adminNotes,
              }
            : r
        )
      );
    } catch {
      alert('Could not update roster status. Check the API and database schema.');
    } finally {
      setPatchBusyId(null);
    }
  }

  async function saveVacationAdminNotes(id: string, adminNotes: string) {
    setPatchBusyId(id);
    try {
      const res = await fetch(`${API}/api/requests/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes }),
      });
      if (!res.ok) throw new Error('patch');
      const data = (await res.json()) as { adminNotes: string };
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, adminNotes: data.adminNotes } : r)));
    } catch {
      alert('Could not save admin note. Run the latest SQL migration on Neon and redeploy if needed.');
    } finally {
      setPatchBusyId(null);
    }
  }

  async function saveShiftSwapAdminNotes(id: string, adminNotes: string) {
    setPatchBusyId(id);
    try {
      const res = await fetch(`${API}/api/shift-swaps/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes }),
      });
      if (!res.ok) throw new Error('patch');
      const data = (await res.json()) as { adminNotes: string };
      setShiftSwaps((prev) => prev.map((s) => (s.id === id ? { ...s, adminNotes: data.adminNotes } : s)));
    } catch {
      alert('Could not save admin note. Run the latest SQL migration on Neon and redeploy if needed.');
    } finally {
      setPatchBusyId(null);
    }
  }

  function buildDeletedVacationNotice(req: VacationRequest): string {
    return [
      '[REMOVED] This vacation request was deleted from the team inbox system by an administrator.',
      `Operator: ${req.operatorName}`,
      `Dates: ${req.startDate} → ${req.endDate} (${req.daysCount} business days)`,
      req.notes ? `Original notes: ${req.notes}` : '',
      '',
      `Open roster view: ${appViewLink('roster')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function buildDeletedShiftNotice(s: ShiftSwapRequest): string {
    return [
      '[REMOVED] This shift swap request was deleted from the team inbox system by an administrator.',
      `Request: ${s.requesterName} ↔ ${s.colleagueName}`,
      `Roster date: ${s.rosterDate} (${s.currentShift} → ${s.requestedShift})`,
      s.details ? `Details: ${s.details}` : '',
      '',
      `Open roster view: ${appViewLink('roster')}`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function deleteVacationRequest(req: VacationRequest) {
    if (!window.confirm('Delete this vacation request permanently? It will be removed for everyone.')) return;
    const notice = buildDeletedVacationNotice(req);
    setPatchBusyId(req.id);
    try {
      const res = await fetch(`${API}/api/requests/${encodeURIComponent(req.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete');
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      setDeletionNotice(notice);
    } catch {
      alert('Could not delete. Check the API and database (migration for DELETE).');
    } finally {
      setPatchBusyId(null);
    }
  }

  async function deleteShiftSwapRequest(s: ShiftSwapRequest) {
    if (!window.confirm('Delete this shift swap request permanently? It will be removed for everyone.')) return;
    const notice = buildDeletedShiftNotice(s);
    setPatchBusyId(s.id);
    try {
      const res = await fetch(`${API}/api/shift-swaps/${encodeURIComponent(s.id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete');
      setShiftSwaps((prev) => prev.filter((x) => x.id !== s.id));
      setDeletionNotice(notice);
    } catch {
      alert('Could not delete. Check the API and database (migration for DELETE).');
    } finally {
      setPatchBusyId(null);
    }
  }

  function openMailtoDeletionNotice() {
    if (!deletionNotice) return;
    const subject = encodeURIComponent('Removed: vacation / shift request (inbox update)');
    const body = encodeURIComponent(deletionNotice);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function openWhatsAppDeletionNotice() {
    if (!deletionNotice) return;
    const text = encodeURIComponent(deletionNotice);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  }

  async function patchShiftSwapRoster(id: string, rosterProcessed: boolean) {
    setPatchBusyId(id);
    try {
      const res = await fetch(`${API}/api/shift-swaps/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rosterProcessed }),
      });
      if (!res.ok) throw new Error('patch');
      const data = (await res.json()) as {
        id: string;
        rosterProcessed: boolean;
        processedAt: string | null;
        adminNotes?: string;
      };
      setShiftSwaps((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                rosterProcessed: data.rosterProcessed,
                processedAt: data.processedAt,
                adminNotes: data.adminNotes ?? s.adminNotes,
              }
            : s
        )
      );
    } catch {
      alert('Could not update roster status. Check the API and database schema.');
    } finally {
      setPatchBusyId(null);
    }
  }

  const calendarCells = useMemo(() => {
    const first = new Date(calYear, calMonth, 1);
    const startPad = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: ({ type: 'empty' } | { type: 'day'; ymd: string; day: number })[] = [];
    for (let i = 0; i < startPad; i++) cells.push({ type: 'empty' });
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = formatIsoDate(new Date(calYear, calMonth, d));
      cells.push({ type: 'day', ymd, day: d });
    }
    return cells;
  }, [calYear, calMonth]);

  function shiftMonth(delta: number) {
    const d = new Date(calYear, calMonth + delta, 1);
    setCalYear(d.getFullYear());
    setCalMonth(d.getMonth());
  }

  if (loading) {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
        <p className="hint" style={{ marginTop: '0.75rem' }}>
          Waiting for the API at <code>/api</code> (proxied to port 3847). If this stays here, run{' '}
          <code>npm run dev</code> from the project folder.
        </p>
      </div>
    );
  }

  if (loadError && operators.length === 0) {
    return (
      <div className="shell">
        <section className="card">
          <h2>Could not load data</h2>
          <p className="alert" style={{ marginBottom: '1rem' }}>
            {loadError}
          </p>
          <p className="muted" style={{ marginBottom: '1rem' }}>
            Tip: use <code>npm run dev</code> so the API starts before the web app. The API must listen on{' '}
            <code>http://127.0.0.1:3847</code>.
          </p>
          <button type="button" className="btn primary" onClick={() => void load()}>
            Retry
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="shell">
      {deletionNotice && (
        <div className="card deletion-banner" role="status">
          <p style={{ marginTop: 0 }}>
            <strong>Deleted — share this text</strong> so people know the request was removed from the system:
          </p>
          <pre className="deletion-pre">{deletionNotice}</pre>
          <div className="actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => void navigator.clipboard.writeText(deletionNotice)}
            >
              Copy text
            </button>
            <button type="button" className="btn secondary" onClick={() => openMailtoDeletionNotice()}>
              Email
            </button>
            <button type="button" className="btn secondary" onClick={() => openWhatsAppDeletionNotice()}>
              WhatsApp
            </button>
            <button type="button" className="btn ghost" onClick={() => setDeletionNotice(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {statusNotice && (
        <div className="alert compact-notice" role="status">
          <span>{statusNotice}</span>
          <button type="button" className="btn ghost" onClick={() => setStatusNotice(null)}>
            OK
          </button>
        </div>
      )}
      {loadError && (
        <div className="alert" role="status" style={{ marginBottom: '1rem' }}>
          {loadError}
        </div>
      )}
      <header className="header">
        <h1>Vacation requests</h1>
        <p className="tagline">
          Submit time off, see team coverage on the calendar, and notify others by email or WhatsApp.
        </p>
        {publicShareUrl ? (
          <p className="shareLine">
            <span>Public link to share (WhatsApp, email):</span>
            <code>{publicShareUrl}</code>
            <button type="button" className="btn secondary" onClick={() => copyPublicLink()}>
              {copyShareDone ? 'Copied' : 'Copy link'}
            </button>
          </p>
        ) : (
          <p className="shareLine" style={{ color: 'var(--muted)' }}>
            Local dev: <code>http://127.0.0.1:5173</code> is only for this PC. Set{' '}
            <code style={{ background: 'transparent', border: 'none' }}>VITE_PUBLIC_APP_URL</code> in <code> .env</code> to
            your Render <code>https://…onrender.com</code> URL, or run <code>npm run share</code> after you save that line. On
            Render, the public link is detected automatically.
            After deploy, this page can show the link automatically.
          </p>
        )}
        <nav className="tabs">
          <button type="button" className={tab === 'request' ? 'active' : ''} onClick={() => setTab('request')}>
            New request
          </button>
          <button
            type="button"
            className={tab === 'shiftSwap' ? 'active' : ''}
            onClick={() => setTab('shiftSwap')}
          >
            Shift swap
          </button>
          <button type="button" className={tab === 'inbox' ? 'active' : ''} onClick={() => setTab('inbox')}>
            Inbox
          </button>
          <button type="button" className={tab === 'calendar' ? 'active' : ''} onClick={() => setTab('calendar')}>
            Calendar
          </button>
          <button type="button" className={tab === 'roster' ? 'active' : ''} onClick={() => setTab('roster')}>
            Roster view
          </button>
        </nav>
      </header>

      {tab === 'request' && (
        <section className="card">
          <h2>New vacation request</h2>
          <form onSubmit={handleSubmit} className="form">
            <label className="field">
              <span>Operator</span>
              <select
                required
                value={operatorEmail}
                onChange={(e) => setOperatorEmail(e.target.value)}
              >
                <option value="">— Select your name —</option>
                {operators.map((o) => (
                  <option key={o.email} value={o.email}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="row">
              <label className="field">
                <span>Start date</span>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>
              <label className="field">
                <span>End date</span>
                <input
                  type="date"
                  required
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </label>
            </div>

            <p className="highlight">
              <strong>Business days counted (Mon–Fri):</strong>{' '}
              {startDate && endDate && parseYmd(startDate) <= parseYmd(endDate)
                ? businessDays
                : '—'}
            </p>

            {(draftConflicts.length > 0 || (startDate && endDate && parseYmd(startDate) > parseYmd(endDate))) && (
              <div className="alert" role="status">
                {startDate && endDate && parseYmd(startDate) > parseYmd(endDate) && (
                  <p>End date must be on or after the start date.</p>
                )}
                {draftConflicts.map((c, i) => (
                  <p key={i}>
                    <strong>Overlap:</strong> {c.otherName} already has time off ({c.otherRange}).
                  </p>
                ))}
              </div>
            )}

            <label className="field">
              <span>Notes (optional)</span>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Reason or shift handover notes…"
              />
            </label>

            <label className="field">
              <span>Attach photo or document (optional)</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setFiles(e.target.files)}
              />
              <span className="hint">Stored on the server with your request (max ~12 MB per upload).</span>
            </label>

            <fieldset className="fieldset">
              <legend>Email notification — choose recipients</legend>
              <p className="hint">
                Selecting addresses fills the Outlook “To” field when you click Email on a saved request. You can edit
                recipients in Outlook before sending.
              </p>
              <div className="checkbox-grid">
                {operators.map((o) => (
                  <label key={o.email} className="check">
                    <input
                      type="checkbox"
                      checked={emailTo[o.email] ?? false}
                      onChange={(e) =>
                        setEmailTo((prev) => ({ ...prev, [o.email]: e.target.checked }))
                      }
                    />
                    <span>{o.name}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <button type="submit" className="btn primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Submit to inbox'}
            </button>
          </form>
        </section>
      )}

      {tab === 'shiftSwap' && (
        <section className="card">
          <h2>Shift swap request (roster change)</h2>
          <p className="muted">
            Use this when the Excel roster is already published and you need to request a morning/night shift swap
            with a colleague.
          </p>
          <form onSubmit={handleShiftSwapSubmit} className="form">
            <div className="row">
              <label className="field">
                <span>Requester (you)</span>
                <select
                  required
                  value={swapRequesterEmail}
                  onChange={(e) => setSwapRequesterEmail(e.target.value)}
                >
                  <option value="">— Select your name —</option>
                  {operators.map((o) => (
                    <option key={o.email} value={o.email}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Requested colleague</span>
                <select
                  required
                  value={swapColleagueEmail}
                  onChange={(e) => setSwapColleagueEmail(e.target.value)}
                >
                  <option value="">— Select colleague —</option>
                  {operators.map((o) => (
                    <option key={o.email} value={o.email}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="row">
              <label className="field">
                <span>Date you need free</span>
                <input
                  type="date"
                  required
                  value={swapRosterDate}
                  onChange={(e) => setSwapRosterDate(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Date you will work for colleague</span>
                <input
                  type="date"
                  required
                  value={swapReturnRosterDate}
                  onChange={(e) => setSwapReturnRosterDate(e.target.value)}
                />
              </label>
            </div>
            <div className="row">
              <div className="row">
                <label className="field">
                  <span>Your shift to cover</span>
                  <select
                    value={swapCurrentShift}
                    onChange={(e) => setSwapCurrentShift(e.target.value as 'morning' | 'night')}
                  >
                    <option value="morning">Morning</option>
                    <option value="night">Night</option>
                  </select>
                </label>
                <label className="field">
                  <span>Colleague shift you will work</span>
                  <select
                    value={swapRequestedShift}
                    onChange={(e) => setSwapRequestedShift(e.target.value as 'morning' | 'night')}
                  >
                    <option value="morning">Morning</option>
                    <option value="night">Night</option>
                  </select>
                </label>
              </div>
            </div>

            <label className="field">
              <span>What exactly needs to change</span>
              <textarea
                rows={4}
                required
                value={swapDetails}
                onChange={(e) => setSwapDetails(e.target.value)}
                placeholder="Example: Please swap my Night shift on 2026-05-12 with Matan's Morning shift due to medical appointment."
              />
            </label>

            <label className="field">
              <span>Attach photo or document (optional)</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx"
                onChange={(e) => setSwapFiles(e.target.files)}
              />
              <span className="hint">Same as vacation: stored on the server (max ~12 MB per file).</span>
            </label>

            {swapRequesterEmail && swapColleagueEmail && swapRequesterEmail === swapColleagueEmail ? (
              <div className="alert" role="status">
                {swapRequesterEmail && swapColleagueEmail && swapRequesterEmail === swapColleagueEmail && (
                  <p>Requester and colleague must be different operators.</p>
                )}
              </div>
            ) : null}

            <p className="highlight">
              <strong>Request preview:</strong>{' '}
              {swapColleague?.name || 'Colleague'} covers {swapRequester?.name || 'Requester'} on{' '}
              {swapRosterDate || 'first date'} ({swapCurrentShift}); {swapRequester?.name || 'Requester'} works for{' '}
              {swapColleague?.name || 'Colleague'} on {swapReturnRosterDate || 'second date'} ({swapRequestedShift}).
            </p>

            <button type="submit" className="btn primary" disabled={swapSubmitting}>
              {swapSubmitting ? 'Saving…' : 'Submit shift swap request'}
            </button>
          </form>
        </section>
      )}

      {tab === 'inbox' && (
        <section className="card">
          <h2>Inbox — all operators</h2>
          <p className="muted">
            Everyone sees all vacation and shift swap requests.
          </p>
          <fieldset className="fieldset">
            <legend>Email recipients (optional, for “Email — request”)</legend>
            <p className="hint">
              Checked names fill the Outlook “To” field. “Roster processed” emails use fixed recipients (vacation:
              requester; swap: both operators).
            </p>
            <div className="checkbox-grid">
              {operators.map((o) => (
                <label key={o.email} className="check">
                  <input
                    type="checkbox"
                    checked={emailTo[o.email] ?? false}
                    onChange={(e) => setEmailTo((prev) => ({ ...prev, [o.email]: e.target.checked }))}
                  />
                  <span>{o.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <h3 className="subhead">Vacation requests</h3>
          <p className="hint" style={{ marginBottom: '0.75rem' }}>
            Use the roster checkbox so everyone sees what is still pending. “Roster processed” email/WhatsApp goes to the
            requester only (not the recipient list above).
          </p>
          <ul className="inbox-list">
            {requests.map((r) => (
              <li key={r.id} className={`inbox-item ${r.rosterProcessed ? 'item-done' : ''}`}>
                <div className="inbox-head">
                  <div>
                    <strong>{r.operatorName}</strong>
                    <span className={`status-pill status-${r.status || 'pending'}`}>{r.status || 'pending'}</span>
                    <span className={`status-pill ${r.rosterProcessed ? 'done' : 'pending'}`}>
                      {r.rosterProcessed ? 'Processed in roster' : 'Pending roster update'}
                    </span>
                  </div>
                  <span className="muted">{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                {r.processedAt && r.rosterProcessed && (
                  <p className="muted" style={{ fontSize: '0.82rem' }}>
                    Marked processed: {new Date(r.processedAt).toLocaleString()}
                  </p>
                )}
                <div className="schedule-edit">
                  <label>
                    <span>Start</span>
                    <input
                      type="date"
                      defaultValue={r.startDate}
                      disabled={patchBusyId === r.id}
                      onBlur={(e) => {
                        if (e.target.value === r.startDate) return;
                        void saveVacationSchedule(r, e.target.value, r.endDate);
                      }}
                    />
                  </label>
                  <label>
                    <span>End</span>
                    <input
                      type="date"
                      defaultValue={r.endDate}
                      disabled={patchBusyId === r.id}
                      onBlur={(e) => {
                        if (e.target.value === r.endDate) return;
                        void saveVacationSchedule(r, r.startDate, e.target.value);
                      }}
                    />
                  </label>
                  <span className="schedule-days">{r.daysCount} business days</span>
                </div>
                {r.notes && <p className="notes">{r.notes}</p>}
                <label className="field admin-note-field">
                  <span>Admin note (visible on Calendar; for roster owner)</span>
                  <textarea
                    key={`${r.id}-adm-${(r.adminNotes || '').length}`}
                    className="admin-textarea"
                    rows={2}
                    defaultValue={r.adminNotes || ''}
                    disabled={patchBusyId === r.id}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v.trim() === (r.adminNotes || '').trim()) return;
                      void saveVacationAdminNotes(r.id, v);
                    }}
                    placeholder="e.g. Approved in HR system, or roster line 12 updated…"
                  />
                </label>
                {r.conflictWarnings?.length > 0 && (
                  <div className="warn">
                    <strong>Overlap warning:</strong>
                    <ul>
                      {r.conflictWarnings.map((w, i) => (
                        <li key={i}>
                          {w.otherName}: {w.otherRange}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.attachments?.length > 0 && (
                  <ul className="attachments">
                    {r.attachments.map((a) => (
                      <li key={a.filename}>
                        <a href={`${API}${a.url}`} download target="_blank" rel="noreferrer">
                          {a.originalName}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="roster-check">
                  <input
                    type="checkbox"
                    checked={Boolean(r.rosterProcessed)}
                    disabled={patchBusyId === r.id}
                    onChange={(e) => void patchVacationRoster(r.id, e.target.checked)}
                  />
                  <span>Accepted and updated in the roster (visible to everyone)</span>
                </label>
                <p className="actions-label">Send the request (uses recipient checkboxes at top of Inbox)</p>
                <div className="actions">
                  <button type="button" className="btn secondary" onClick={() => openMailto(r)}>
                    Email — request
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsApp(r)}>
                    WhatsApp — request
                  </button>
                </div>
                <p className="actions-label">Process</p>
                <div className="actions decision-actions">
                  <select
                    value={r.status || 'pending'}
                    disabled={patchBusyId === r.id}
                    onChange={(e) => void setVacationStatus(r, e.target.value as RequestStatus)}
                  >
                    <option value="pending">Requesting</option>
                    <option value="accepted">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button type="button" className="btn secondary" onClick={() => void setVacationStatus(r, (r.status || 'pending') as RequestStatus, true)}>
                    Email status
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppDecisionVacation(r)}>
                    WhatsApp status
                  </button>
                </div>
                <p className="actions-label">Tell the requester it is done in the roster</p>
                <div className="actions">
                  <button type="button" className="btn secondary" onClick={() => openMailtoRosterProcessedVacation(r)}>
                    Email — roster processed
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppRosterProcessedVacation(r)}>
                    WhatsApp — roster processed
                  </button>
                </div>
                <div className="danger-zone">
                  <button
                    type="button"
                    className="btn danger"
                    disabled={patchBusyId === r.id}
                    onClick={() => void deleteVacationRequest(r)}
                  >
                    Delete vacation request
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {requests.length === 0 && <p className="muted">No requests yet.</p>}

          <h3 className="subhead">Shift swap requests</h3>
          <p className="hint" style={{ marginBottom: '0.75rem' }}>
            “Roster processed” email is addressed to both operators; WhatsApp sends one message you can forward if needed.
          </p>
          <ul className="inbox-list">
            {shiftSwaps.map((s) => (
              <li key={s.id} className={`inbox-item ${s.rosterProcessed ? 'item-done' : ''}`}>
                <div className="inbox-head">
                  <div>
                    <strong>{s.requesterName}</strong>
                    <span className={`status-pill status-${s.status || 'pending'}`}>{s.status || 'pending'}</span>
                    <span className={`status-pill ${s.rosterProcessed ? 'done' : 'pending'}`}>
                      {s.rosterProcessed ? 'Processed in roster' : 'Pending roster update'}
                    </span>
                  </div>
                  <span className="muted">{new Date(s.createdAt).toLocaleString()}</span>
                </div>
                {s.processedAt && s.rosterProcessed && (
                  <p className="muted" style={{ fontSize: '0.82rem' }}>
                    Marked processed: {new Date(s.processedAt).toLocaleString()}
                  </p>
                )}
                <div className="schedule-edit">
                  <span>
                    Requests swap with <strong>{s.colleagueName}</strong>
                  </span>
                  <label>
                    <span>Roster date</span>
                    <input
                      type="date"
                      defaultValue={s.rosterDate}
                      disabled={patchBusyId === s.id}
                      onBlur={(e) => {
                        if (e.target.value === s.rosterDate) return;
                        void saveShiftSwapSchedule(s, e.target.value);
                      }}
                    />
                  </label>
                  <label>
                    <span>Return date</span>
                    <input
                      type="date"
                      defaultValue={s.returnRosterDate || ''}
                      disabled={patchBusyId === s.id}
                      onBlur={(e) => {
                        if (e.target.value === (s.returnRosterDate || '')) return;
                        void saveShiftSwapSchedule(s, s.rosterDate, e.target.value);
                      }}
                    />
                  </label>
                </div>
                <p>
                  Exchange: <strong>{s.currentShift}</strong> on requester date / <strong>{s.requestedShift}</strong> on return date
                </p>
                {s.details && <p className="notes">{s.details}</p>}
                {s.attachments && s.attachments.length > 0 && (
                  <ul className="attachments">
                    {s.attachments.map((a) => (
                      <li key={a.filename}>
                        <a href={`${API}${a.url}`} download target="_blank" rel="noreferrer">
                          {a.originalName}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="field admin-note-field">
                  <span>Admin note (visible on Calendar; for roster owner)</span>
                  <textarea
                    key={`${s.id}-adm-${(s.adminNotes || '').length}`}
                    className="admin-textarea"
                    rows={2}
                    defaultValue={s.adminNotes || ''}
                    disabled={patchBusyId === s.id}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v.trim() === (s.adminNotes || '').trim()) return;
                      void saveShiftSwapAdminNotes(s.id, v);
                    }}
                    placeholder="e.g. Roster file updated — row 4…"
                  />
                </label>
                <label className="roster-check">
                  <input
                    type="checkbox"
                    checked={Boolean(s.rosterProcessed)}
                    disabled={patchBusyId === s.id}
                    onChange={(e) => void patchShiftSwapRoster(s.id, e.target.checked)}
                  />
                  <span>Accepted and updated in the roster (visible to everyone)</span>
                </label>
                <p className="actions-label">Send the swap request</p>
                <div className="actions">
                  <button type="button" className="btn secondary" onClick={() => openMailtoShiftSwap(s)}>
                    Email — request
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppShiftSwap(s)}>
                    WhatsApp — request
                  </button>
                </div>
                <p className="actions-label">Process</p>
                <div className="actions decision-actions">
                  <select
                    value={s.status || 'pending'}
                    disabled={patchBusyId === s.id}
                    onChange={(e) => void setShiftSwapStatus(s, e.target.value as RequestStatus)}
                  >
                    <option value="pending">Requesting</option>
                    <option value="accepted">Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                  <button type="button" className="btn secondary" onClick={() => void setShiftSwapStatus(s, (s.status || 'pending') as RequestStatus, true)}>
                    Email status
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppDecisionSwap(s)}>
                    WhatsApp status
                  </button>
                </div>
                <p className="actions-label">Tell both operators it is done in the roster</p>
                <div className="actions">
                  <button type="button" className="btn secondary" onClick={() => openMailtoRosterProcessedSwap(s)}>
                    Email — roster processed
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppRosterProcessedSwap(s)}>
                    WhatsApp — roster processed
                  </button>
                </div>
                <div className="danger-zone">
                  <button
                    type="button"
                    className="btn danger"
                    disabled={patchBusyId === s.id}
                    onClick={() => void deleteShiftSwapRequest(s)}
                  >
                    Delete shift swap request
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {shiftSwaps.length === 0 && <p className="muted">No shift swap requests yet.</p>}
        </section>
      )}

      {tab === 'calendar' && (
        <section className="card">
          <div className="cal-toolbar">
            <button type="button" className="btn ghost" onClick={() => shiftMonth(-1)}>
              ← Previous
            </button>
            <h2>
              {new Date(calYear, calMonth).toLocaleString('en', { month: 'long', year: 'numeric' })}
            </h2>
            <button type="button" className="btn ghost" onClick={() => shiftMonth(1)}>
              Next →
            </button>
          </div>
          <p className="muted" style={{ marginBottom: '0.5rem' }}>
            Use filters to find people or a date range. Each day shows who is off and admin notes. Purple: Israel
            holidays.
          </p>
          <div className="cal-filters">
            <label className="field inline">
              <span>From</span>
              <input type="date" value={calFilterFrom} onChange={(e) => setCalFilterFrom(e.target.value)} />
            </label>
            <label className="field inline">
              <span>To</span>
              <input type="date" value={calFilterTo} onChange={(e) => setCalFilterTo(e.target.value)} />
            </label>
            <label className="field inline grow">
              <span>Search name / email</span>
              <input
                type="search"
                value={calNameFilter}
                onChange={(e) => setCalNameFilter(e.target.value)}
                placeholder="Filter calendar rows…"
              />
            </label>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setCalFilterFrom('');
                setCalFilterTo('');
                setCalNameFilter('');
              }}
            >
              Clear filters
            </button>
          </div>
          <div className="weekdays">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="wd">
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {calendarCells.map((c, idx) =>
              c.type === 'empty' ? (
                <div key={`e-${idx}`} className="cal-cell empty" />
              ) : (
                <div key={c.ymd} className={`cal-cell ${holidaysByDate.has(c.ymd) ? 'holiday-day' : ''}`}>
                  <span className="cal-day">{c.day}</span>
                  {holidaysByDate.has(c.ymd) && (
                    <span className="holiday-badge" title={holidaysByDate.get(c.ymd)}>
                      {holidaysByDate.get(c.ymd)}
                    </span>
                  )}
                  <div className="cal-entries">
                    {(calendarLinesByDay.get(c.ymd) || []).map((line, li) => (
                      <div
                        key={li}
                        className={`cal-line ${line.kind === 'swap' ? 'cal-line-swap' : ''}`}
                        title={`${line.title}\n${line.note}`}
                      >
                        <span className="cal-line-title">{line.title}</span>
                        <span className="cal-line-note">{line.note}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </section>
      )}

      {tab === 'roster' && (
        <section className="card roster-card">
          <h2>Roster Excel view</h2>
          <p className="muted">
            Upload the current roster workbook. The parser expects operator names in <strong>A3:A12</strong> and dates
            in row <strong>2</strong> from <strong>B2</strong>. Cells become yellow when there is an active vacation or
            shift swap request for that operator/date.
          </p>
          <label className="field">
            <span>Upload / update roster document</span>
            <input
              type="file"
              accept=".xlsx,.xls,.xlsm"
              disabled={rosterUploading}
              onChange={(e) => void uploadRoster(e.target.files?.[0] || null)}
            />
            <span className="hint">
              Uploading a newer document replaces the current view. The original Excel file is parsed and stored as data
              so Render can show it later.
            </span>
          </label>
          {rosterWithRequests ? (
            <>
              <p className="hint">
                Current file: <strong>{rosterWithRequests.originalName}</strong> · uploaded{' '}
                {new Date(rosterWithRequests.uploadedAt).toLocaleString()}
              </p>
              <div className="cal-filters roster-filters">
                <label className="field inline">
                  <span>Show roster from date</span>
                  <input type="date" value={rosterFromDate} onChange={(e) => setRosterFromDate(e.target.value)} />
                </label>
                <button type="button" className="btn ghost" onClick={() => setRosterFromDate('')}>
                  Show all dates
                </button>
                <button type="button" className="btn ghost" onClick={() => setRosterFromDate(formatIsoDate(new Date()))}>
                  From today
                </button>
              </div>
              <div className="roster-scroll">
                <table className="roster-table">
                  <thead>
                    <tr>
                      <th>Operator</th>
                      {visibleRoster!.dates.map((d) => (
                        <th
                          key={d}
                          className={[d === todayYmd ? 'roster-today-col' : '', holidaysByDate.has(d) ? 'roster-holiday-col' : '']
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <div className="roster-weekday">{shortWeekday(d)}</div>
                          <div>{formatRosterDate(d)}</div>
                          {holidaysByDate.has(d) && (
                            <div className="roster-holiday-label" title={holidaysByDate.get(d)}>
                              {holidaysByDate.get(d)}
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRoster!.rows.map((row) => (
                      <tr
                        key={row.operatorName}
                        className={selectedRosterRow === row.operatorName ? 'roster-row-selected' : ''}
                        onClick={() =>
                          setSelectedRosterRow((current) => (current === row.operatorName ? '' : row.operatorName))
                        }
                      >
                        <th>{row.operatorName}</th>
                        {row.cells.map((cell, i) => (
                          <td
                            key={`${row.operatorName}-${visibleRoster!.dates[i]}`}
                            className={[
                              rosterShiftClass(row.operatorName, cell.value),
                              cell.hasRequest ? 'roster-request-cell' : '',
                              visibleRoster!.dates[i] === todayYmd ? 'roster-today-col' : '',
                              holidaysByDate.has(visibleRoster!.dates[i]) ? 'roster-holiday-col' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            title={cell.requestNotes.join('\n')}
                          >
                            <div className="roster-cell-value">{cell.value || '—'}</div>
                            {cell.hasRequest && (
                              <div className="roster-cell-note">
                                {cell.requestNotes.slice(0, 2).map((n) => (
                                  <div key={n}>{n}</div>
                                ))}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {visibleRoster!.dates.length === 0 && (
                <p className="muted" style={{ marginTop: '0.75rem' }}>
                  No roster dates from the selected date. Use “Show all dates” or choose an earlier date.
                </p>
              )}
            </>
          ) : (
            <p className="muted">No roster uploaded yet.</p>
          )}
        </section>
      )}
    </div>
  );
}
