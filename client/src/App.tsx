import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Operator, ShiftSwapRequest, VacationRequest } from './types';
import {
  countBusinessDays,
  enumerateDays,
  formatIsoDate,
  parseYmd,
  rangesOverlap,
} from './utils';
import { ISRAEL_HOLIDAYS } from './israelHolidays';

type Tab = 'request' | 'shiftSwap' | 'inbox' | 'calendar';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

export default function App() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [requests, setRequests] = useState<VacationRequest[]>([]);
  const [shiftSwaps, setShiftSwaps] = useState<ShiftSwapRequest[]>([]);
  const [tab, setTab] = useState<Tab>('request');
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
  const [swapCurrentShift, setSwapCurrentShift] = useState<'morning' | 'night'>('morning');
  const [swapRequestedShift, setSwapRequestedShift] = useState<'morning' | 'night'>('night');
  const [swapDetails, setSwapDetails] = useState('');
  const [swapSubmitting, setSwapSubmitting] = useState(false);
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null);

  const [emailTo, setEmailTo] = useState<Record<string, boolean>>({});

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const ctl = new AbortController();
    const t = window.setTimeout(() => ctl.abort(), 12000);
    try {
      const [opRes, reqRes, swapRes] = await Promise.all([
        fetch(`${API}/api/operators`, { signal: ctl.signal }),
        fetch(`${API}/api/requests`, { signal: ctl.signal }),
        fetch(`${API}/api/shift-swaps`, { signal: ctl.signal }),
      ]);
      const [opsRaw, reqsRaw, swapsRaw] = await Promise.all([
        opRes.json(),
        reqRes.json(),
        swapRes.json(),
      ]);
      const ops = Array.isArray(opsRaw) ? (opsRaw as Operator[]) : [];
      const reqs = Array.isArray(reqsRaw) ? (reqsRaw as VacationRequest[]) : [];
      const swaps = Array.isArray(swapsRaw) ? (swapsRaw as ShiftSwapRequest[]) : [];
      const parts: string[] = [];
      if (!opRes.ok) parts.push('operators');
      if (!reqRes.ok) parts.push('vacation requests');
      if (!swapRes.ok) parts.push('shift swaps');
      if (parts.length) {
        setLoadError(
          `API returned an error for: ${parts.join(', ')}. If you use Neon, run server/schema.sql in the Neon SQL editor.`
        );
      }
      setOperators(ops);
      setRequests(reqs);
      setShiftSwaps(swaps);
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

  const daysWithRequests = useMemo(() => {
    const map = new Map<string, { names: Set<string>; emails: Set<string> }>();
    for (const r of requests) {
      for (const day of enumerateDays(r.startDate, r.endDate)) {
        if (!map.has(day)) map.set(day, { names: new Set(), emails: new Set() });
        const e = map.get(day)!;
        e.names.add(r.operatorName || r.operatorEmail);
        e.emails.add(r.operatorEmail);
      }
    }
    return map;
  }, [requests]);

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
    if (swapCurrentShift === swapRequestedShift) {
      alert('Requested shift must be different from current shift.');
      return;
    }

    setSwapSubmitting(true);
    try {
      const payload = {
        requesterName: swapRequester.name,
        requesterEmail: swapRequester.email,
        colleagueName: swapColleague.name,
        colleagueEmail: swapColleague.email,
        rosterDate: swapRosterDate,
        currentShift: swapCurrentShift,
        requestedShift: swapRequestedShift,
        details: swapDetails.trim(),
      };
      const res = await fetch(`${API}/api/shift-swaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      const created = (await res.json()) as ShiftSwapRequest;
      setShiftSwaps((prev) => [created, ...prev]);
      setSwapColleagueEmail('');
      setSwapRosterDate('');
      setSwapCurrentShift('morning');
      setSwapRequestedShift('night');
      setSwapDetails('');
      setTab('inbox');
    } catch {
      alert('Could not save shift swap request. Is the API running?');
    } finally {
      setSwapSubmitting(false);
    }
  }

  function buildNotificationBody(req: VacationRequest): string {
    const lines = [
      `Vacation request — ${req.operatorName}`,
      `Dates: ${req.startDate} to ${req.endDate}`,
      `Business days: ${req.daysCount}`,
      req.notes ? `Notes: ${req.notes}` : '',
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
      `Roster date: ${s.rosterDate}`,
      `Change: ${s.currentShift} → ${s.requestedShift}`,
      s.details ? `Details: ${s.details}` : '',
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

  function buildRosterProcessedVacationBody(req: VacationRequest): string {
    return [
      `Hello ${req.operatorName},`,
      '',
      `Your vacation request (${req.startDate} → ${req.endDate}, ${req.daysCount} business days) has been accepted and updated in the published roster.`,
      '',
      'If anything looks wrong, reply to the roster owner.',
    ].join('\n');
  }

  function buildRosterProcessedSwapBody(s: ShiftSwapRequest): string {
    return [
      `Hello ${s.requesterName} and ${s.colleagueName},`,
      '',
      `Your shift swap for ${s.rosterDate} (${s.currentShift} → ${s.requestedShift}) has been accepted and updated in the published roster.`,
      s.details ? `Original request: ${s.details}` : '',
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
      const data = (await res.json()) as { id: string; rosterProcessed: boolean; processedAt: string | null };
      setRequests((prev) =>
        prev.map((r) => (r.id === id ? { ...r, rosterProcessed: data.rosterProcessed, processedAt: data.processedAt } : r))
      );
    } catch {
      alert('Could not update roster status. Check the API and database schema.');
    } finally {
      setPatchBusyId(null);
    }
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
      const data = (await res.json()) as { id: string; rosterProcessed: boolean; processedAt: string | null };
      setShiftSwaps((prev) =>
        prev.map((s) => (s.id === id ? { ...s, rosterProcessed: data.rosterProcessed, processedAt: data.processedAt } : s))
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
                <span>Roster date</span>
                <input
                  type="date"
                  required
                  value={swapRosterDate}
                  onChange={(e) => setSwapRosterDate(e.target.value)}
                />
              </label>
              <div className="row">
                <label className="field">
                  <span>Current shift</span>
                  <select
                    value={swapCurrentShift}
                    onChange={(e) => setSwapCurrentShift(e.target.value as 'morning' | 'night')}
                  >
                    <option value="morning">Morning</option>
                    <option value="night">Night</option>
                  </select>
                </label>
                <label className="field">
                  <span>Requested shift</span>
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

            {(swapRequesterEmail && swapColleagueEmail && swapRequesterEmail === swapColleagueEmail) ||
            swapCurrentShift === swapRequestedShift ? (
              <div className="alert" role="status">
                {swapRequesterEmail && swapColleagueEmail && swapRequesterEmail === swapColleagueEmail && (
                  <p>Requester and colleague must be different operators.</p>
                )}
                {swapCurrentShift === swapRequestedShift && (
                  <p>Current and requested shifts cannot be the same.</p>
                )}
              </div>
            ) : null}

            <p className="highlight">
              <strong>Request preview:</strong>{' '}
              {swapRequester?.name || 'Requester'} asks {swapColleague?.name || 'Colleague'} to swap{' '}
              {swapCurrentShift} → {swapRequestedShift}
              {swapRosterDate ? ` on ${swapRosterDate}` : ''}.
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
                <p>
                  {r.startDate} → {r.endDate} · <strong>{r.daysCount}</strong> business days
                </p>
                {r.notes && <p className="notes">{r.notes}</p>}
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
                <p className="actions-label">Tell the requester it is done in the roster</p>
                <div className="actions">
                  <button type="button" className="btn secondary" onClick={() => openMailtoRosterProcessedVacation(r)}>
                    Email — roster processed
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppRosterProcessedVacation(r)}>
                    WhatsApp — roster processed
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
                <p>
                  Requests swap with <strong>{s.colleagueName}</strong> on <strong>{s.rosterDate}</strong>
                </p>
                <p>
                  Change needed: <strong>{s.currentShift}</strong> → <strong>{s.requestedShift}</strong>
                </p>
                {s.details && <p className="notes">{s.details}</p>}
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
                <p className="actions-label">Tell both operators it is done in the roster</p>
                <div className="actions">
                  <button type="button" className="btn secondary" onClick={() => openMailtoRosterProcessedSwap(s)}>
                    Email — roster processed
                  </button>
                  <button type="button" className="btn secondary" onClick={() => openWhatsAppRosterProcessedSwap(s)}>
                    WhatsApp — roster processed
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
          <p className="muted">
            Blue badges: requested vacation days. Purple badges: Israel holidays.
          </p>
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
                  {daysWithRequests.has(c.ymd) && (
                    <span className="badge" title={[...daysWithRequests.get(c.ymd)!.names].join(', ')}>
                      {[...daysWithRequests.get(c.ymd)!.names].slice(0, 2).join(', ')}
                      {[...daysWithRequests.get(c.ymd)!.names].length > 2 ? '…' : ''}
                    </span>
                  )}
                </div>
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
