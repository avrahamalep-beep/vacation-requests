import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const uploadsDir = path.join(root, 'server', 'uploads');
const dataPath = path.join(root, 'server', 'data', 'requests.json');
const shiftSwapDataPath = path.join(root, 'server', 'data', 'shiftSwaps.json');

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

function normalizeVacationRow(r) {
  if (!r || typeof r !== 'object') return r;
  return {
    ...r,
    rosterProcessed: Boolean(r.rosterProcessed),
    processedAt: r.processedAt ?? null,
  };
}

function normalizeShiftSwapRow(s) {
  if (!s || typeof s !== 'object') return s;
  return {
    ...s,
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

    res.json(readRequestsFile().map(normalizeVacationRow));
  });

  app.get('/api/shift-swaps', async (_req, res) => {
    if (useNeon) {
      try {
        const rows = await sql`
          SELECT
            id,
            requester_name AS "requesterName",
            requester_email AS "requesterEmail",
            colleague_name AS "colleagueName",
            colleague_email AS "colleagueEmail",
            roster_date AS "rosterDate",
            current_shift AS "currentShift",
            requested_shift AS "requestedShift",
            details,
            status,
            roster_processed AS "rosterProcessed",
            processed_at AS "processedAt",
            created_at AS "createdAt"
          FROM shift_swap_requests
          ORDER BY created_at DESC
        `;
        res.json(
          rows.map((row) =>
            normalizeShiftSwapRow({
              ...row,
              rosterDate: toYmd(row.rosterDate),
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

    res.json(readShiftSwapsFile().map(normalizeShiftSwapRow));
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

  app.post('/api/shift-swaps', async (req, res) => {
    const body = req.body || {};
    const requesterName = body.requesterName || '';
    const requesterEmail = body.requesterEmail || '';
    const colleagueName = body.colleagueName || '';
    const colleagueEmail = body.colleagueEmail || '';
    const rosterDate = body.rosterDate || '';
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
    if (currentShift === requestedShift) {
      return res.status(400).json({ error: 'Requested shift must be different from current shift.' });
    }

    const record = {
      id: uuidv4(),
      requesterName,
      requesterEmail,
      colleagueName,
      colleagueEmail,
      rosterDate,
      currentShift,
      requestedShift,
      details,
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
          current_shift,
          requested_shift,
          details,
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
          ${currentShift},
          ${requestedShift},
          ${details},
          'pending',
          FALSE,
          NULL
        )
      `;
      res.status(201).json(record);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not save shift swap request.' });
    }
  });

  app.patch('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (typeof req.body?.rosterProcessed !== 'boolean') {
      return res.status(400).json({ error: 'Body must include rosterProcessed (boolean).' });
    }
    const rosterProcessed = req.body.rosterProcessed;

    if (!useNeon) {
      const list = readRequestsFile();
      const i = list.findIndex((r) => r.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      const processedAt = rosterProcessed ? new Date().toISOString() : null;
      list[i] = { ...list[i], rosterProcessed, processedAt };
      writeRequestsFile(list);
      return res.json({ id, rosterProcessed, processedAt });
    }

    try {
      const rows = await sql`
        UPDATE vacation_requests
        SET
          roster_processed = ${rosterProcessed},
          processed_at = CASE WHEN ${rosterProcessed} THEN NOW() ELSE NULL END
        WHERE id = ${id}::uuid
        RETURNING id, roster_processed AS "rosterProcessed", processed_at AS "processedAt"
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      const row = rows[0];
      const processedAt =
        row.processedAt == null
          ? null
          : row.processedAt instanceof Date
            ? row.processedAt.toISOString()
            : String(row.processedAt);
      res.json({ id: row.id, rosterProcessed: Boolean(row.rosterProcessed), processedAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update vacation request.' });
    }
  });

  app.patch('/api/shift-swaps/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (typeof req.body?.rosterProcessed !== 'boolean') {
      return res.status(400).json({ error: 'Body must include rosterProcessed (boolean).' });
    }
    const rosterProcessed = req.body.rosterProcessed;

    if (!useNeon) {
      const list = readShiftSwapsFile();
      const i = list.findIndex((s) => s.id === id);
      if (i === -1) return res.status(404).json({ error: 'Not found.' });
      const processedAt = rosterProcessed ? new Date().toISOString() : null;
      list[i] = { ...list[i], rosterProcessed, processedAt };
      writeShiftSwapsFile(list);
      return res.json({ id, rosterProcessed, processedAt });
    }

    try {
      const rows = await sql`
        UPDATE shift_swap_requests
        SET
          roster_processed = ${rosterProcessed},
          processed_at = CASE WHEN ${rosterProcessed} THEN NOW() ELSE NULL END
        WHERE id = ${id}::uuid
        RETURNING id, roster_processed AS "rosterProcessed", processed_at AS "processedAt"
      `;
      if (!rows.length) return res.status(404).json({ error: 'Not found.' });
      const row = rows[0];
      const processedAt =
        row.processedAt == null
          ? null
          : row.processedAt instanceof Date
            ? row.processedAt.toISOString()
            : String(row.processedAt);
      res.json({ id: row.id, rosterProcessed: Boolean(row.rosterProcessed), processedAt });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not update shift swap request.' });
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
