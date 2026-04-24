import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const uploadsDir = path.join(root, 'server', 'uploads');
const dataPath = path.join(root, 'server', 'data', 'requests.json');
const shiftSwapDataPath = path.join(root, 'server', 'data', 'shiftSwaps.json');
const rosterDataPath = path.join(root, 'server', 'data', 'roster.json');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 3847;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

const OPERATORS = [
  { name: 'Yohai Afuta', email: 'Yohai.Afuta@gevernova.com' },
  { name: 'Matan Ben Tanhum', email: 'matan.bentanhum@gevernova.com' },
  { name: 'Ali Bzadug', email: 'Ali.Bzadug@gevernova.com' },
  { name: 'Avraham Carasco', email: 'Avraham.Carasco@gevernova.com' },
  { name: 'Genya Furman', email: 'Genya.Furman@gevernova.com' },
  { name: 'Omer Haron', email: 'Omer.Haron@gevernova.com' },
  { name: 'Pavel Kigel', email: 'pavel.kigel@gevernova.com' },
  { name: 'Maria Melnyk', email: 'Maria.Melnyk@gevernova.com' },
  { name: 'Katrin Ostrov', email: 'Katrin.Ostrov@gevernova.com' },
  { name: 'Emil Yonaev', email: 'Emil.yonaev@gevernova.com' },
  { name: 'Yahav Zarfati', email: 'Yahav.Zarfati@gevernova.com' },
];

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/operators', (_req, res) => {
  res.json(OPERATORS);
});

/** 0.0.0.0 = required for PaaS (Render, etc.); 127.0.0.1 would block external health checks. */
app.listen(PORT, '0.0.0.0', () => {
  const host = `http://127.0.0.1:${PORT}`;
  console.log(`API ${host} (listen 0.0.0.0)`);
});

function readRequestsFile() {
  try {
    if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });
    if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, '[]', 'utf8');
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch {
    return [];
  }
}

function writeRequestsFile(list) {
  if (!fs.existsSync(path.dirname(dataPath))) fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(list, null, 2), 'utf8');
}

function readShiftSwapsFile() {
  try {
    if (!fs.existsSync(path.dirname(shiftSwapDataPath))) {
      fs.mkdirSync(path.dirname(shiftSwapDataPath), { recursive: true });
    }
    if (!fs.existsSync(shiftSwapDataPath)) fs.writeFileSync(shiftSwapDataPath, '[]', 'utf8');
    return JSON.parse(fs.readFileSync(shiftSwapDataPath, 'utf8'));
  } catch {
    return [];
  }
}

function writeShiftSwapsFile(list) {
  if (!fs.existsSync(path.dirname(shiftSwapDataPath))) {
    fs.mkdirSync(path.dirname(shiftSwapDataPath), { recursive: true });
  }
  fs.writeFileSync(shiftSwapDataPath, JSON.stringify(list, null, 2), 'utf8');
}

function readRosterFile() {
  try {
    if (!fs.existsSync(path.dirname(rosterDataPath))) fs.mkdirSync(path.dirname(rosterDataPath), { recursive: true });
    if (!fs.existsSync(rosterDataPath)) fs.writeFileSync(rosterDataPath, 'null', 'utf8');
    return JSON.parse(fs.readFileSync(rosterDataPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeRosterFile(snapshot) {
  if (!fs.existsSync(path.dirname(rosterDataPath))) fs.mkdirSync(path.dirname(rosterDataPath), { recursive: true });
  fs.writeFileSync(rosterDataPath, JSON.stringify(snapshot, null, 2), 'utf8');
}

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  const A0 = parseYmd(aStart).getTime();
  const A1 = parseYmd(aEnd).getTime();
  const B0 = parseYmd(bStart).getTime();
  const B1 = parseYmd(bEnd).getTime();
  return A0 <= B1 && B0 <= A1;
}

function findOverlaps(list, start, end, excludeEmail) {
  const warnings = [];
  for (const r of list) {
    if (r.operatorEmail === excludeEmail) continue;
    if (!rangesOverlap(start, end, r.startDate, r.endDate)) continue;
    warnings.push({
      otherName: r.operatorName,
      otherEmail: r.operatorEmail,
      otherRange: `${r.startDate} → ${r.endDate}`,
    });
  }
  return warnings;
}

function toYmd(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

function excelDateToYmd(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }
  return s;
}

function parseRosterWorkbook(filePath, originalName) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const firstSheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, blankrows: false });
  const dateRow = grid[1] || [];
  const dates = [];
  for (let c = 1; c < dateRow.length; c++) {
    const ymd = excelDateToYmd(dateRow[c]);
    if (ymd) dates.push(ymd);
  }
  const rows = [];
  for (let r = 2; r < Math.min(grid.length, 12); r++) {
    const row = grid[r] || [];
    const operatorName = String(row[0] || '').trim();
    if (!operatorName) continue;
    rows.push({
      operatorName,
      cells: dates.map((_, i) => ({
        value: row[i + 1] == null ? '' : String(row[i + 1]).trim(),
        hasRequest: false,
        requestNotes: [],
      })),
    });
  }
  return { originalName, uploadedAt: new Date().toISOString(), dates, rows };
}

function normalizeVacationRow(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    ...r,
    adminNotes: r.adminNotes ?? '',
    rosterProcessed: Boolean(r.rosterProcessed),
    processedAt: r.processedAt ?? null,
  };
}

function normalizeShiftSwapRow(s) {
  if (!s || typeof s !== 'object') return s;
  return {
    ...s,
    adminNotes: s.adminNotes ?? '',
    attachments: normalizeAttachments(s.attachments),
    rosterProcessed: Boolean(s.rosterProcessed),
    processedAt: s.processedAt ?? null,
  };
}

function normalizeAttachments(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((a) => ({
      filename: a.filename,
      originalName: a.originalName,
      url: a.url,
    }));
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
}

async function main() {
  let sql = null;
  const useNeon = Boolean(process.env.DATABASE_URL?.trim());

  if (useNeon) {
    const { neon } = await import('@neondatabase/serverless');
    sql = neon(process.env.DATABASE_URL);
    console.log('Database: Neon (PostgreSQL)');
  } else {
    readRequestsFile();
    readShiftSwapsFile();
    console.warn(
      'DATABASE_URL not set — using local JSON (server/data/requests.json). Add DATABASE_URL in .env for Neon.'
    );
    readRosterFile();
  }

  app.get('/api/requests', async (_req, res) => {
    if (useNeon) {
      try {
        const rows = await sql`
          SELECT
            r.id,
            r.operator_name AS "operatorName",
            r.operator_email AS "operatorEmail",
            r.start_date AS "startDate",
            r.end_date AS "endDate",
            r.days_count AS "daysCount",
            r.notes,
            r.admin_notes AS "adminNotes",
            r.status,
            r.conflict_warnings AS "conflictWarnings",
            r.roster_processed AS "rosterProcessed",
            r.processed_at AS "processedAt",
            r.created_at AS "createdAt",
            COALESCE(
              json_agg(
                json_build_object(
                  'filename', a.filename,
                  'originalName', a.original_name,
                  'url', a.url_path
                )
                ORDER BY a.id
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'::json
            ) AS attachments
          FROM vacation_requests r
          LEFT JOIN vacation_attachments a ON a.request_id = r.id
          GROUP BY r.id
          ORDER BY r.created_at DESC
        `;

        const mapped = rows.map((row) =>
          normalizeVacationRow({
            id: row.id,
            operatorName: row.operatorName,
            operatorEmail: row.operatorEmail,
            startDate: toYmd(row.startDate),
            endDate: toYmd(row.endDate),
            daysCount: row.daysCount,
            notes: row.notes ?? '',
            adminNotes: row.adminNotes ?? '',
            status: row.status,
            conflictWarnings: Array.isArray(row.conflictWarnings)
              ? row.conflictWarnings
              : typeof row.conflictWarnings === 'string'
                ? JSON.parse(row.conflictWarnings)
                : [],
            rosterProcessed: row.rosterProcessed,
            processedAt:
              row.processedAt == null
                ? null
                : row.processedAt instanceof Date
                  ? row.processedAt.toISOString()
                  : String(row.processedAt),
            createdAt:
              row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
            attachments: normalizeAttachments(row.attachments),
          })
        );

        res.json(mapped);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load requests.' });
      }
      return;
    }

    res.json(readRequestsFile().map((r) => normalizeVacationRow({ ...r, adminNotes: r.adminNotes ?? '' })));
  });

  app.get('/api/shift-swaps', async (_req, res) => {
    if (useNeon) {
      try {
        const rows = await sql`
          SELECT
            s.id,
            s.requester_name AS "requesterName",
            s.requester_email AS "requesterEmail",
            s.colleague_name AS "colleagueName",
            s.colleague_email AS "colleagueEmail",
            s.roster_date AS "rosterDate",
            s.return_roster_date AS "returnRosterDate",
            s.current_shift AS "currentShift",
            s.requested_shift AS "requestedShift",
            s.details,
            s.admin_notes AS "adminNotes",
            s.status,
            s.roster_processed AS "rosterProcessed",
            s.processed_at AS "processedAt",
            s.created_at AS "createdAt",
            COALESCE(
              json_agg(
                json_build_object(
                  'filename', a.filename,
                  'originalName', a.original_name,
                  'url', a.url_path
                )
                ORDER BY a.id
              ) FILTER (WHERE a.id IS NOT NULL),
              '[]'::json
            ) AS attachments
          FROM shift_swap_requests s
          LEFT JOIN shift_swap_attachments a ON a.request_id = s.id
          GROUP BY s.id
          ORDER BY s.created_at DESC
        `;
        res.json(
          rows.map((row) =>
            normalizeShiftSwapRow({
              ...row,
              rosterDate: toYmd(row.rosterDate),
              returnRosterDate: toYmd(row.returnRosterDate),
              adminNotes: row.adminNotes ?? '',
              attachments: normalizeAttachments(row.attachments),
              rosterProcessed: row.rosterProcessed,
              processedAt:
                row.processedAt == null
                  ? null
                  : row.processedAt instanceof Date
                    ? row.processedAt.toISOString()
                    : String(row.processedAt),
              createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
            })
          )
        );
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load shift swaps.' });
      }
      return;
    }

    res.json(
      readShiftSwapsFile().map((s) => normalizeShiftSwapRow({ ...s, adminNotes: s.adminNotes ?? '' }))
    );
  });

  app.post('/api/requests', upload.array('attachments', 8), async (req, res) => {
    const body = req.body;
    const start = body.startDate;
    const end = body.endDate;
    const operatorEmail = body.operatorEmail;
    const operatorName = body.operatorName;
    const notes = body.notes || '';

    if (!start || !end || !operatorEmail) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const daysCount = Number(body.daysCount) || 0;
    const files = req.files || [];
    const attachments = files.map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      url: `/uploads/${f.filename}`,
    }));

    if (!useNeon) {
      const list = readRequestsFile();
      const conflictWarnings = findOverlaps(list, start, end, operatorEmail);
      const record = {
        id: uuidv4(),
        operatorName: operatorName || '',
        operatorEmail,
        startDate: start,
        endDate: end,
        daysCount,
        notes,
        adminNotes: '',
        attachments,
        conflictWarnings,
        createdAt: new Date().toISOString(),
        status: 'pending',
        rosterProcessed: false,
        processedAt: null,
      };
      list.unshift(record);
      writeRequestsFile(list);
      return res.status(201).json(record);
    }

    const id = uuidv4();
    try {
      const overlapRows = await sql`
        SELECT operator_name AS "operatorName", operator_email AS "operatorEmail", start_date AS "startDate", end_date AS "endDate"
        FROM vacation_requests
        WHERE operator_email <> ${operatorEmail}
          AND start_date <= ${end}::date
          AND end_date >= ${start}::date
      `;

      const conflictWarnings = overlapRows.map((r) => ({
        otherName: r.operatorName,
        otherEmail: r.operatorEmail,
        otherRange: `${toYmd(r.startDate)} → ${toYmd(r.endDate)}`,
      }));

      await sql`
        INSERT INTO vacation_requests (
          id,
          operator_name,
          operator_email,
          start_date,
          end_date,
          days_count,
          notes,
          admin_notes,
          status,
          conflict_warnings,
          roster_processed,
          processed_at
        )
        VALUES (
          ${id}::uuid,
          ${operatorName || ''},
          ${operatorEmail},
          ${start}::date,
          ${end}::date,
          ${daysCount},
          ${notes},
          '',
          'pending',
          ${JSON.stringify(conflictWarnings)}::jsonb,
          FALSE,
          NULL
        )
      `;

      for (const f of files) {
        const urlPath = `/uploads/${f.filename}`;
        await sql`
          INSERT INTO vacation_attachments (request_id, filename, original_name, url_path)
          VALUES (${id}::uuid, ${f.filename}, ${f.originalname}, ${urlPath})
        `;
      }

      const record = {
        id,
        operatorName: operatorName || '',
        operatorEmail,
        startDate: start,
        endDate: end,
        daysCount,
        notes,
        adminNotes: '',
        attachments,
        conflictWarnings,
        createdAt: new Date().toISOString(),
        status: 'pending',
        rosterProcessed: false,
        processedAt: null,
      };

      res.status(201).json(record);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not save the request.' });
    }
  });

  app.post('/api/shift-swaps', upload.array('attachments', 8), async (req, res) => {
    const body = req.body || {};
    const requesterName = body.requesterName || '';
    const requesterEmail = body.requesterEmail || '';
    const colleagueName = body.colleagueName || '';
    const colleagueEmail = body.colleagueEmail || '';
    const rosterDate = body.rosterDate || '';
    const returnRosterDate = body.returnRosterDate || null;
    const currentShift = body.currentShift || '';
    const requestedShift = body.requestedShift || '';
    const details = body.details || '';

    if (
      !requesterEmail ||
      !colleagueEmail ||
      !rosterDate ||
      !['morning', 'night'].includes(currentShift) ||
      !['morning', 'night'].includes(requestedShift)
    ) {
      return res.status(400).json({ error: 'Missing required fields for shift swap request.' });
    }
    if (requesterEmail === colleagueEmail) {
      return res.status(400).json({ error: 'Requester and colleague must be different operators.' });
    }
    const files = req.files || [];
    const attachments = files.map((f) => ({
      filename: f.filename,
      originalName: f.originalname,
      url: `/uploads/${f.filename}`,
    }));

    const record = {
      id: uuidv4(),
      requesterName,
      requesterEmail,
      colleagueName,
      colleagueEmail,
      rosterDate,
      returnRosterDate,
      currentShift,
      requestedShift,
      details,
      adminNotes: '',
      attachments,
      status: 'pending',
      createdAt: new Date().toISOString(),
      rosterProcessed: false,
      processedAt: null,
    };

    if (!useNeon) {
      const list = readShiftSwapsFile();
      list.unshift(record);
      writeShiftSwapsFile(list);
      return res.status(201).json(record);
    }

    try {
      await sql`
        INSERT INTO shift_swap_requests (
          id,
          requester_name,
          requester_email,
          colleague_name,
          colleague_email,
          roster_date,
          return_roster_date,
          current_shift,
          requested_shift,
          details,
          admin_notes,
          status,
          roster_processed,
          processed_at
        )
        VALUES (
          ${record.id}::uuid,
          ${requesterName},
          ${requesterEmail},
          ${colleagueName},
          ${colleagueEmail},
          ${rosterDate}::date,
          ${returnRosterDate}::date,
          ${currentShift},
          ${requestedShift},
          ${details},
          '',
          'pending',
          FALSE,
          NULL
        )
      `;
      for (const f of files) {
        const urlPath = `/uploads/${f.filename}`;
        await sql`
          INSERT INTO shift_swap_attachments (request_id, filename, original_name, url_path)
          VALUES (${record.id}::uuid, ${f.filename}, ${f.originalname}, ${urlPath})
        `;
      }
      res.status(201).json(record);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not save shift swap request.' });
    }
  });

  app.patch('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    const hasRoster = typeof req.body?.rosterProcessed === 'boolean';
    const hasAdmin = typeof req.body?.adminNotes === 'string';
    if (!hasRoster && !hasAdmin) {
      return res.status(400).json({ error: 'Body must include rosterProcessed (boolean) and/or adminNotes (string).' });
    }

    if (!useNeon) {
      const list = readRequestsFile();
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      const prev = list[i];
      const rosterProcessed = hasRoster ? req.body.rosterProcessed : prev.rosterProcessed;
      const adminNotes = hasAdmin ? req.body.adminNotes : prev.adminNotes || '';
      const newProcessedAt = hasRoster
        ? req.body.rosterProcessed
          ? new Date().toISOString()
          : null
        : prev.processedAt ?? null;
      list[i] = { ...prev, rosterProcessed, adminNotes, processedAt: newProcessedAt };
      writeRequestsFile(list);
      return res.json({ id, rosterProcessed, adminNotes, processedAt: newProcessedAt });
    }

    try {
      if (hasRoster && hasAdmin) {
        const rows = await sql`
          UPDATE vacation_requests
          SET
            roster_processed = ${req.body.rosterProcessed},
            processed_at = CASE WHEN ${req.body.rosterProcessed} THEN NOW() ELSE NULL END,
            admin_notes = ${req.body.adminNotes}
          WHERE id = ${id}::uuid
          RETURNING id, roster_processed AS "rosterProcessed", admin_notes AS "adminNotes", processed_at AS "processedAt"
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found.' });
        return jsonVacationPatch(rows[0], res);
      }
      if (hasRoster) {
        const rosterProcessed = req.body.rosterProcessed;
        const rows = await sql`
          UPDATE vacation_requests
          SET
            roster_processed = ${rosterProcessed},
            processed_at = CASE WHEN ${rosterProcessed} THEN NOW() ELSE NULL END
          WHERE id = ${id}::uuid
          RETURNING id, roster_processed AS "rosterProcessed", admin_notes AS "adminNotes", processed_at AS "processedAt"
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found.' });
        return jsonVacationPatch(rows[0], res);
      }
      const adminNotes = req.body.adminNotes;
      const rows = await sql`
        UPDATE vacation_requests
        SET admin_notes = ${adminNotes}
        WHERE id = ${id}::uuid
        RETURNING id, roster_processed AS "rosterProcessed", admin_notes AS "adminNotes", processed_at AS "processedAt"
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      return jsonVacationPatch(rows[0], res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update vacation request.' });
    }
  });

  function jsonVacationPatch(row, res) {
    const processedAt =
      row.processedAt == null
        ? null
        : row.processedAt instanceof Date
          ? row.processedAt.toISOString()
          : String(row.processedAt);
    res.json({
      id: row.id,
      rosterProcessed: Boolean(row.rosterProcessed),
      adminNotes: row.adminNotes ?? '',
      processedAt,
    });
  }

  app.patch('/api/shift-swaps/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    const hasRoster = typeof req.body?.rosterProcessed === 'boolean';
    const hasAdmin = typeof req.body?.adminNotes === 'string';
    if (!hasRoster && !hasAdmin) {
      return res.status(400).json({ error: 'Body must include rosterProcessed (boolean) and/or adminNotes (string).' });
    }

    if (!useNeon) {
      const list = readShiftSwapsFile();
      const i = list.findIndex((s) => s.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      const prev = list[i];
      const rosterProcessed = hasRoster ? req.body.rosterProcessed : prev.rosterProcessed;
      const adminNotes = hasAdmin ? req.body.adminNotes : prev.adminNotes || '';
      const newProcessedAt = hasRoster
        ? req.body.rosterProcessed
          ? new Date().toISOString()
          : null
        : prev.processedAt ?? null;
      list[i] = { ...prev, rosterProcessed, adminNotes, processedAt: newProcessedAt };
      writeShiftSwapsFile(list);
      return res.json({ id, rosterProcessed, adminNotes, processedAt: newProcessedAt });
    }

    try {
      if (hasRoster && hasAdmin) {
        const rows = await sql`
          UPDATE shift_swap_requests
          SET
            roster_processed = ${req.body.rosterProcessed},
            processed_at = CASE WHEN ${req.body.rosterProcessed} THEN NOW() ELSE NULL END,
            admin_notes = ${req.body.adminNotes}
          WHERE id = ${id}::uuid
          RETURNING id, roster_processed AS "rosterProcessed", admin_notes AS "adminNotes", processed_at AS "processedAt"
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found.' });
        return jsonVacationPatch(rows[0], res);
      }
      if (hasRoster) {
        const rosterProcessed = req.body.rosterProcessed;
        const rows = await sql`
          UPDATE shift_swap_requests
          SET
            roster_processed = ${rosterProcessed},
            processed_at = CASE WHEN ${rosterProcessed} THEN NOW() ELSE NULL END
          WHERE id = ${id}::uuid
          RETURNING id, roster_processed AS "rosterProcessed", admin_notes AS "adminNotes", processed_at AS "processedAt"
        `;
        if (!rows.length) return res.status(404).json({ error: 'Not found.' });
        return jsonVacationPatch(rows[0], res);
      }
      const adminNotes = req.body.adminNotes;
      const rows = await sql`
        UPDATE shift_swap_requests
        SET admin_notes = ${adminNotes}
        WHERE id = ${id}::uuid
        RETURNING id, roster_processed AS "rosterProcessed", admin_notes AS "adminNotes", processed_at AS "processedAt"
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      return jsonVacationPatch(rows[0], res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update shift swap request.' });
    }
  });

  app.patch('/api/requests/:id/status', async (req, res) => {
    const { id } = req.params;
    const status = String(req.body?.status || '');
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, accepted, or rejected.' });
    }
    if (!useNeon) {
      const list = readRequestsFile();
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      list[i] = { ...list[i], status };
      writeRequestsFile(list);
      return res.json({ id, status });
    }
    try {
      const rows = await sql`
        UPDATE vacation_requests
        SET status = ${status}
        WHERE id = ${id}::uuid
        RETURNING id, status
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      res.json({ id: rows[0].id, status: rows[0].status });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update request status.' });
    }
  });

  app.patch('/api/shift-swaps/:id/status', async (req, res) => {
    const { id } = req.params;
    const status = String(req.body?.status || '');
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, accepted, or rejected.' });
    }
    if (!useNeon) {
      const list = readShiftSwapsFile();
      const i = list.findIndex((s) => s.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      list[i] = { ...list[i], status };
      writeShiftSwapsFile(list);
      return res.json({ id, status });
    }
    try {
      const rows = await sql`
        UPDATE shift_swap_requests
        SET status = ${status}
        WHERE id = ${id}::uuid
        RETURNING id, status
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      res.json({ id: rows[0].id, status: rows[0].status });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update shift swap status.' });
    }
  });

  app.patch('/api/requests/:id/schedule', async (req, res) => {
    const { id } = req.params;
    const startDate = String(req.body?.startDate || '');
    const endDate = String(req.body?.endDate || '');
    const daysCount = Number(req.body?.daysCount) || 0;
    if (!startDate || !endDate) return res.status(400).json({ error: 'Missing startDate/endDate.' });
    if (!useNeon) {
      const list = readRequestsFile();
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      list[i] = { ...list[i], startDate, endDate, daysCount };
      writeRequestsFile(list);
      return res.json({ id, startDate, endDate, daysCount });
    }
    try {
      const rows = await sql`
        UPDATE vacation_requests
        SET start_date = ${startDate}::date, end_date = ${endDate}::date, days_count = ${daysCount}
        WHERE id = ${id}::uuid
        RETURNING id, start_date AS "startDate", end_date AS "endDate", days_count AS "daysCount"
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      res.json({ id: rows[0].id, startDate: toYmd(rows[0].startDate), endDate: toYmd(rows[0].endDate), daysCount: rows[0].daysCount });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update vacation dates.' });
    }
  });

  app.patch('/api/shift-swaps/:id/schedule', async (req, res) => {
    const { id } = req.params;
    const rosterDate = String(req.body?.rosterDate || '');
    const returnRosterDate = req.body?.returnRosterDate ? String(req.body.returnRosterDate) : null;
    if (!rosterDate) return res.status(400).json({ error: 'Missing rosterDate.' });
    if (!useNeon) {
      const list = readShiftSwapsFile();
      const i = list.findIndex((s) => s.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      list[i] = { ...list[i], rosterDate, returnRosterDate };
      writeShiftSwapsFile(list);
      return res.json({ id, rosterDate, returnRosterDate });
    }
    try {
      const rows = await sql`
        UPDATE shift_swap_requests
        SET roster_date = ${rosterDate}::date, return_roster_date = ${returnRosterDate}::date
        WHERE id = ${id}::uuid
        RETURNING id, roster_date AS "rosterDate", return_roster_date AS "returnRosterDate"
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      res.json({ id: rows[0].id, rosterDate: toYmd(rows[0].rosterDate), returnRosterDate: toYmd(rows[0].returnRosterDate) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update shift swap date.' });
    }
  });

  app.get('/api/roster', async (_req, res) => {
    if (!useNeon) return res.json(readRosterFile());
    try {
      const rows = await sql`
        SELECT original_name AS "originalName", rows_json AS "snapshot", uploaded_at AS "uploadedAt"
        FROM roster_snapshots
        ORDER BY uploaded_at DESC
        LIMIT 1
      `;
      if (!rows.length) return res.json(null);
      res.json({
        ...rows[0].snapshot,
        originalName: rows[0].originalName,
        uploadedAt: rows[0].uploadedAt instanceof Date ? rows[0].uploadedAt.toISOString() : String(rows[0].uploadedAt),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not load roster.' });
    }
  });

  app.post('/api/roster', upload.single('roster'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Upload an Excel file.' });
    try {
      const snapshot = parseRosterWorkbook(req.file.path, req.file.originalname);
      if (!snapshot.dates.length || !snapshot.rows.length) {
        return res.status(400).json({ error: 'Could not read roster. Expected dates in row 2 and operators in A3:A12.' });
      }
      if (!useNeon) {
        writeRosterFile(snapshot);
        return res.status(201).json(snapshot);
      }
      await sql`
        INSERT INTO roster_snapshots (original_name, rows_json)
        VALUES (${snapshot.originalName}, ${JSON.stringify(snapshot)}::jsonb)
      `;
      res.status(201).json(snapshot);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not parse roster workbook.' });
    }
  });

  app.delete('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (!useNeon) {
      const list = readRequestsFile();
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      list.splice(i, 1);
      writeRequestsFile(list);
      return res.json({ ok: true });
    }
    try {
      const rows = await sql`DELETE FROM vacation_requests WHERE id = ${id}::uuid RETURNING id`;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not delete request.' });
    }
  });

  app.delete('/api/shift-swaps/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (!useNeon) {
      const list = readShiftSwapsFile();
      const i = list.findIndex((s) => s.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      list.splice(i, 1);
      writeShiftSwapsFile(list);
      return res.json({ ok: true });
    }
    try {
      const rows = await sql`DELETE FROM shift_swap_requests WHERE id = ${id}::uuid RETURNING id`;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not delete shift swap request.' });
    }
  });

  const distPath = path.join(root, 'client', 'dist');
  const indexFile = path.join(distPath, 'index.html');
  if (fs.existsSync(indexFile)) {
    app.use(
      express.static(distPath, {
        fallthrough: true,
        index: 'index.html',
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      if (req.method === 'GET') {
        return res.sendFile(indexFile);
      }
      next();
    });
    console.log(`Web UI: also serving ${distPath} (one public URL: web + API)`);
  } else {
    console.warn('No client/dist: run npm run build to serve a public web app, or use dev + Vite.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
