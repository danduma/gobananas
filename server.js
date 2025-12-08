import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import Database from 'better-sqlite3';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5174;
const API_PREFIX = '/api';
const STATE_DIR = path.join(__dirname, 'server-data');
const CONFIG_PATH = path.join(STATE_DIR, 'config.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const ensureStateDir = async () => {
  await fs.mkdir(STATE_DIR, { recursive: true });
};

const readConfig = async () => {
  await ensureStateDir();
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { storagePath: null, apiKey: null };
  }
};

const writeConfig = async (config) => {
  await ensureStateDir();
  const next = { storagePath: config.storagePath ?? null, apiKey: config.apiKey ?? null };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
};

const resolveStorage = async () => {
  const config = await readConfig();
  if (!config.storagePath) {
    throw new Error('No storage path configured');
  }
  const root = config.storagePath;
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.join(root, 'input_images'), { recursive: true });
  return { root, config };
};

const conversationsPath = (root) => path.join(root, 'conversations.json');
const metadataPath = (root) => path.join(root, 'generations.json');
const generatedImagePath = (root, imageId, mimeType = 'image/png') => {
  const ext = mimeType.split('/')[1] || 'png';
  return path.join(root, `nano-banana-${imageId}.${ext}`);
};
const inputImagePath = (root, imageId) => path.join(root, 'input_images', imageId);

// --- SQLite helpers -------------------------------------------------------
const dbCache = new Map();

const ensureThreadsTable = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `);
};

const migrateJsonConversations = async (root, db) => {
  const convPath = conversationsPath(root);
  if (!(await fileExists(convPath))) return;

  try {
    const json = await readJson(convPath, { version: '2.0', threads: [] });
    const threads = Array.isArray(json?.threads) ? json.threads : [];
    if (threads.length === 0) return;

    const insert = db.prepare('INSERT OR REPLACE INTO threads (id, data, updatedAt) VALUES (?, ?, ?)');
    const tx = db.transaction((items) => {
      for (const t of items) {
        insert.run(t.id, JSON.stringify(t), t.updatedAt || Date.now());
      }
    });
    tx(threads);
  } catch (err) {
    console.warn('Failed migrating JSON conversations to SQLite', err);
  }
};

const getDb = async (root) => {
  const dbPath = path.join(root, 'nano-banana.db');
  if (dbCache.has(dbPath)) return dbCache.get(dbPath);

  await fs.mkdir(root, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureThreadsTable(db);
  await migrateJsonConversations(root, db);
  dbCache.set(dbPath, db);
  return db;
};

const loadThreadsFromDb = (db) => {
  const rows = db.prepare('SELECT data FROM threads ORDER BY updatedAt DESC').all();
  return rows.map((r) => JSON.parse(r.data));
};

const replaceThreadsInDb = (db, threads) => {
  const tx = db.transaction((items) => {
    db.prepare('DELETE FROM threads').run();
    const stmt = db.prepare('INSERT INTO threads (id, data, updatedAt) VALUES (?, ?, ?)');
    for (const t of items) {
      stmt.run(t.id, JSON.stringify(t), t.updatedAt || Date.now());
    }
  });
  tx(threads);
};

const upsertThreadInDb = (db, thread) => {
  db.prepare(
    'INSERT INTO threads (id, data, updatedAt) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updatedAt=excluded.updatedAt'
  ).run(thread.id, JSON.stringify(thread), thread.updatedAt || Date.now());
};

const fileExists = async (p) => {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
};

const findGeneratedImageFile = async (root, imageId, mimeType = 'image/png') => {
  // Try the expected naming with mime-derived extension
  const primary = generatedImagePath(root, imageId, mimeType);
  if (await fileExists(primary)) {
    return { path: primary, mimeType };
  }

  // Try common extensions with our prefix
  const commonExts = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  for (const ext of commonExts) {
    const candidate = path.join(root, `nano-banana-${imageId}.${ext}`);
    if (await fileExists(candidate)) {
      return { path: candidate, mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    }
  }

  // Try raw filenames (in case legacy files were saved without prefix)
  for (const ext of commonExts) {
    const candidate = path.join(root, `${imageId}.${ext}`);
    if (await fileExists(candidate)) {
      return { path: candidate, mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    }
  }

  // Try direct path as provided
  const asProvided = path.join(root, imageId);
  if (await fileExists(asProvided)) {
    // Best-effort mime guess from extension
    const ext = path.extname(asProvided).replace('.', '').toLowerCase();
    const guessMime = ext ? `image/${ext === 'jpg' ? 'jpeg' : ext}` : mimeType;
    return { path: asProvided, mimeType: guessMime };
  }

  return null;
};

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const writeJson = async (filePath, data) => {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const saveBase64File = async (targetPath, dataBase64) => {
  const buffer = Buffer.from(dataBase64, 'base64');
  await fs.writeFile(targetPath, buffer);
};

const runCommand = (cmd) =>
  new Promise((resolve, reject) => {
    exec(cmd, { timeout: 20000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(error);
      }
      if (stderr) {
        console.warn(stderr);
      }
      resolve(stdout.trim());
    });
  });

const pickFolder = async () => {
  if (process.platform === 'darwin') {
    try {
      const script = `osascript -e 'set theFolder to POSIX path of (choose folder with prompt "Select save folder")' -e 'theFolder'`;
      const result = await runCommand(script);
      return result || null;
    } catch {
      return null;
    }
  }

  if (process.platform === 'win32') {
    try {
      const ps = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        '$f = New-Object System.Windows.Forms.FolderBrowserDialog;',
        '$f.Description = "Select save folder";',
        '$null = $f.ShowDialog();',
        'Write-Output $f.SelectedPath;'
      ].join(' ');
      const result = await runCommand(`powershell -NoProfile -Command "${ps}"`);
      return result || null;
    } catch {
      return null;
    }
  }

  try {
    const result = await runCommand('zenity --file-selection --directory --title="Select save folder"');
    return result || null;
  } catch {
    return null;
  }
};

app.get(`${API_PREFIX}/config`, async (_req, res) => {
  try {
    const config = await readConfig();
    res.json({ storagePath: config.storagePath, apiKey: config.apiKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/config`, async (req, res) => {
  try {
    const { storagePath, apiKey } = req.body || {};
    const current = await readConfig();
    const next = await writeConfig({
      storagePath: storagePath ?? current.storagePath ?? null,
      apiKey: apiKey ?? current.apiKey ?? null,
    });
    if (next.storagePath) {
      await fs.mkdir(next.storagePath, { recursive: true });
      await fs.mkdir(path.join(next.storagePath, 'input_images'), { recursive: true });
    }
    res.json({ storagePath: next.storagePath, apiKey: next.apiKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/select-folder`, async (_req, res) => {
  try {
    const folder = await pickFolder();
    if (!folder) {
      return res.status(400).json({ error: 'Folder selection cancelled' });
    }
    res.json({ path: folder });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/conversations`, async (_req, res) => {
  try {
    const { root } = await resolveStorage();
    const db = await getDb(root);
    const threads = loadThreadsFromDb(db);
    res.json({ version: '2.0', threads });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/conversations/:id`, async (req, res) => {
  try {
    const { root } = await resolveStorage();
    const db = await getDb(root);
    const row = db.prepare('SELECT data FROM threads WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Thread not found' });
    res.json(JSON.parse(row.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/conversations/thread`, async (req, res) => {
  try {
    const payload = req.body;
    const { root } = await resolveStorage();
    const db = await getDb(root);

    // If the payload already contains the full list of threads, persist as-is
    if (Array.isArray(payload?.threads)) {
      const trimmed = payload.threads
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 50);
      replaceThreadsInDb(db, trimmed);
      return res.json({ ok: true });
    }

    const thread = payload;
    if (!thread?.id) {
      return res.status(400).json({ error: 'Thread id is required' });
    }

    // Upsert and enforce cap
    const existing = loadThreadsFromDb(db).filter((t) => t.id !== thread.id);
    const combined = [thread, ...existing]
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 50);
    replaceThreadsInDb(db, combined);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const deleteThreadAssets = async (root, thread) => {
  for (const message of thread.messages || []) {
    for (const content of message.content || []) {
      if (content.type === 'image') {
        if (content.isInputImage) {
          await fs.rm(inputImagePath(root, content.imageId), { force: true });
        } else {
          const target = generatedImagePath(root, content.imageId, content.mimeType || 'image/png');
          await fs.rm(target, { force: true });
        }
      }
    }
  }
};

app.delete(`${API_PREFIX}/conversations/:id`, async (req, res) => {
  try {
    const { root } = await resolveStorage();
    const db = await getDb(root);
    const row = db.prepare('SELECT data FROM threads WHERE id = ?').get(req.params.id);
    if (row) {
      await deleteThreadAssets(root, JSON.parse(row.data));
    }
    db.prepare('DELETE FROM threads WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/images/input`, async (req, res) => {
  try {
    const { imageId, dataBase64, mimeType } = req.body || {};
    if (!imageId || !dataBase64) {
      return res.status(400).json({ error: 'imageId and dataBase64 are required' });
    }
    const { root } = await resolveStorage();
    const target = inputImagePath(root, imageId);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await saveBase64File(target, dataBase64);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/images/generated`, async (req, res) => {
  try {
    const { imageId, dataBase64, mimeType } = req.body || {};
    if (!imageId || !dataBase64) {
      return res.status(400).json({ error: 'imageId and dataBase64 are required' });
    }
    const { root } = await resolveStorage();
    const target = generatedImagePath(root, imageId, mimeType);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await saveBase64File(target, dataBase64);
    const exists = await fileExists(target);
    res.json({ ok: true, filename: exists ? path.basename(target) : '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/images/:id`, async (req, res) => {
  try {
    const { id } = req.params;
    const type = req.query.type === 'input' ? 'input' : 'generated';
    const mimeType = req.query.mimeType || 'image/png';
    const { root } = await resolveStorage();
    if (type === 'input') {
      const filePath = inputImagePath(root, id);
      if (!(await fileExists(filePath))) {
        const fallback = await findGeneratedImageFile(root, id, mimeType);
        if (!fallback) {
          return res.status(404).json({ error: 'Image not found' });
        }
        const data = await fs.readFile(fallback.path);
        const base64 = data.toString('base64');
        return res.json({ dataBase64: base64, mimeType: fallback.mimeType });
      }
      const data = await fs.readFile(filePath);
      const base64 = data.toString('base64');
      return res.json({ dataBase64: base64, mimeType });
    }

    const found = await findGeneratedImageFile(root, id, mimeType);
    if (!found) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const data = await fs.readFile(found.path);
    const base64 = data.toString('base64');
    res.json({ dataBase64: base64, mimeType: found.mimeType });
  } catch (err) {
    res.status(404).json({ error: 'Image not found' });
  }
});

app.delete(`${API_PREFIX}/images/input/:id`, async (req, res) => {
  try {
    const { root } = await resolveStorage();
    await fs.rm(inputImagePath(root, req.params.id), { force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(`${API_PREFIX}/images/generated/:id`, async (req, res) => {
  try {
    const mimeType = req.query.mimeType || 'image/png';
    const { root } = await resolveStorage();
    await fs.rm(generatedImagePath(root, req.params.id, mimeType), { force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get(`${API_PREFIX}/metadata`, async (_req, res) => {
  try {
    const { root } = await resolveStorage();
    const items = await readJson(metadataPath(root), []);
    res.json({ items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/metadata`, async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }
    const { root } = await resolveStorage();
    await writeJson(metadataPath(root), items);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post(`${API_PREFIX}/metadata/delete`, async (req, res) => {
  try {
    const { id, filename } = req.body || {};
    if (!id || !filename) {
      return res.status(400).json({ error: 'id and filename are required' });
    }
    const { root } = await resolveStorage();
    const items = await readJson(metadataPath(root), []);
    const filtered = items.filter((item) => item.id !== id);
    await writeJson(metadataPath(root), filtered);
    await fs.rm(path.join(root, filename), { force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Storage API listening on http://localhost:${PORT}${API_PREFIX}`);
});

