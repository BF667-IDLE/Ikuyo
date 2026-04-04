/**
 * ═══════════════════════════════════════════════════════════════
 *  HuggingFace Database (HFDB)
 *  For Ikuyo WhatsApp Bot
 * ═══════════════════════════════════════════════════════════════
 *
 *  Menyimpan dan memuat data bot ke/dari HuggingFace Dataset.
 *  Menggunakan HuggingFace Hub REST API dengan Bearer token.
 *
 *  Fitur:
 *    - Upload file JSON ke HF Dataset repo
 *    - Download file JSON dari HF Dataset repo
 *    - Sync database lokal ↔ HF (push & pull)
 *    - Auto-save periodik (opsional)
 *    - Support untuk jadibot ban list, TOS accepted, config, dll
 *
 *  API Endpoints:
 *    - Upload:  POST https://huggingface.co/api/datasets/{repo_id}/commit/main
 *    - Download: GET  https://huggingface.co/datasets/{repo_id}/resolve/main/{path}
 *    - List:     GET  https://huggingface.co/api/datasets/{repo_id}/tree/main
 *    - Delete:   DELETE via commit with deleted files
 *
 *  Usage:
 *    const hfdb = require('./lib/hfdb');
 *    hfdb.init();
 *
 *    // Upload file
 *    await hfdb.uploadFile('jadibot/banlist.json', data);
 *
 *    // Download file
 *    const data = await hfdb.downloadFile('jadibot/banlist.json');
 *
 *    // Sync all local data to HF
 *    await hfdb.push();
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');

// ============================================================
//  CONSTANTS
// ============================================================

const HF_BASE_URL = 'https://huggingface.co';
const HF_API_UPLOAD = (repo) => `${HF_BASE_URL}/api/datasets/${repo}/commit/main`;
const HF_API_DOWNLOAD = (repo, filePath) => `${HF_BASE_URL}/datasets/${repo}/resolve/main/${filePath}`;
const HF_API_TREE = (repo, path = '') => `${HF_BASE_URL}/api/datasets/${repo}/tree/main/${path}`;
const HF_API_REPO_INFO = (repo) => `${HF_BASE_URL}/api/datasets/${repo}`;

// ============================================================
//  HFDB CLASS
// ============================================================

class HFDatabase {
    constructor() {
        /** @type {string|null} HF Dataset repo ID (e.g. "username/ikuyo-bot-db") */
        this.repoId = null;
        /** @type {string|null} HF API token (Bearer) */
        this.apiToken = null;
        /** @type {boolean} */
        this.enabled = false;
        /** @type {number} Auto-save interval in ms */
        this.autoSaveInterval = null;
        /** @type {NodeJS.Timeout|null} */
        this._autoSaveTimer = null;
        /** @type {boolean} */
        this._initialized = false;
        /** @type {Map<string, any>} In-memory data cache */
        this._cache = new Map();
        /** @type {string} Local sync directory */
        this._localSyncDir = null;
    }

    // ============================================================
    //  INITIALIZATION
    // ============================================================

    /**
     * Inisialisasi HFDB dari config
     */
    init() {
        const cfg = global.config?.hfdb;
        if (!cfg || !cfg.enabled) {
            console.log(chalk.gray('[ HFDB ] HuggingFace Database tidak diaktifkan'));
            this.enabled = false;
            return;
        }

        this.repoId = cfg.repo_id;
        this.apiToken = cfg.api_key;
        this.enabled = true;
        this._localSyncDir = path.join(__dirname, '..', 'hfdb_local');

        if (!this.repoId) {
            console.error(chalk.red('[ HFDB ] repo_id belum diisi di config.js!'));
            this.enabled = false;
            return;
        }

        if (!this.apiToken) {
            console.error(chalk.red('[ HFDB ] api_key belum diisi di config.js!'));
            this.enabled = false;
            return;
        }

        // Buat local sync dir
        if (!fs.existsSync(this._localSyncDir)) {
            fs.mkdirSync(this._localSyncDir, { recursive: true });
        }

        // Set auto-save interval
        if (cfg.auto_save_interval) {
            const interval = cfg.auto_save_interval * 60 * 1000; // menit ke ms
            this.autoSaveInterval = interval;
            this._startAutoSave();
        }

        this._initialized = true;
        console.log(chalk.green(`[ HFDB ] Initialized (repo: ${this.repoId})`));

        // Test koneksi
        this._testConnection().catch(err => {
            console.error(chalk.yellow(`[ HFDB ] Connection test: ${err.message}`));
        });
    }

    // ============================================================
    //  CONNECTION TEST
    // ============================================================

    /**
     * Test koneksi ke HF Dataset
     * @private
     */
    async _testConnection() {
        try {
            const resp = await axios.get(HF_API_REPO_INFO(this.repoId), {
                headers: this._getHeaders(),
                timeout: 10000,
            });

            if (resp.status === 200) {
                console.log(chalk.green(`[ HFDB ] Connected to ${resp.data?.id || this.repoId}`));
                return true;
            }
        } catch (err) {
            if (err.response?.status === 404) {
                console.warn(chalk.yellow(`[ HFDB ] Repo "${this.repoId}" belum ada. Buat di https://huggingface.co/new-dataset`));
            } else if (err.response?.status === 401 || err.response?.status === 403) {
                console.error(chalk.red(`[ HFDB ] API key tidak valid atau tidak punya akses ke repo!`));
            }
            throw new Error(`Connection failed: ${err.response?.status || err.message}`);
        }
    }

    // ============================================================
    //  HEADERS & AUTH
    // ============================================================

    /**
     * @private Get authorization headers
     */
    _getHeaders() {
        return {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * @private Get multipart form headers
     */
    _getUploadHeaders() {
        return {
            'Authorization': `Bearer ${this.apiToken}`,
        };
    }

    // ============================================================
    //  FILE OPERATIONS
    // ============================================================

    /**
     * Upload file ke HF Dataset
     * @param {string} remotePath - Path file di repo (e.g. "jadibot/banlist.json")
     * @param {object|string|Buffer} data - Data yang akan diupload (JSON object, string, atau Buffer)
     * @param {string} [commitMsg] - Commit message
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async uploadFile(remotePath, data, commitMsg) {
        if (!this.enabled || !this._initialized) {
            return { success: false, message: 'HFDB not enabled' };
        }

        try {
            // Convert data ke Buffer
            let fileBuffer;
            let contentEncoding = 'utf-8';

            if (typeof data === 'object') {
                fileBuffer = Buffer.from(JSON.stringify(data, null, 2), contentEncoding);
            } else if (typeof data === 'string') {
                fileBuffer = Buffer.from(data, contentEncoding);
            } else if (Buffer.isBuffer(data)) {
                fileBuffer = data;
                contentEncoding = 'binary';
            } else {
                throw new Error('Data harus berupa object, string, atau Buffer');
            }

            const formData = new (require('form-data'))();
            formData.append('file', fileBuffer, {
                filename: path.basename(remotePath),
                contentType: contentEncoding === 'binary' ? 'application/octet-stream' : 'application/json',
            });

            const message = commitMsg || `sync: update ${remotePath}`;

            const resp = await axios.post(HF_API_UPLOAD(this.repoId), formData, {
                headers: {
                    ...this._getUploadHeaders(),
                    ...formData.getHeaders(),
                },
                params: { message },
                timeout: 60000,
            });

            // Cache locally
            this._cache.set(remotePath, data);
            this._saveLocal(remotePath, data);

            console.log(chalk.green(`[ HFDB ] Uploaded: ${remotePath} (${(fileBuffer.length / 1024).toFixed(1)}KB)`));

            return { success: true, message: `Uploaded ${remotePath}` };

        } catch (err) {
            const msg = err.response?.data?.error || err.message;
            console.error(chalk.red(`[ HFDB ] Upload failed ${remotePath}: ${msg}`));
            return { success: false, message: `Upload failed: ${msg}` };
        }
    }

    /**
     * Download file dari HF Dataset
     * @param {string} remotePath - Path file di repo
     * @param {boolean} [parseJson=true] - Auto-parse JSON response
     * @returns {Promise<any>} File content (parsed JSON or raw string/Buffer)
     */
    async downloadFile(remotePath, parseJson = true) {
        if (!this.enabled || !this._initialized) {
            return null;
        }

        // Check cache
        if (this._cache.has(remotePath)) {
            return this._cache.get(remotePath);
        }

        // Check local
        const localData = this._loadLocal(remotePath);
        if (localData !== null) {
            this._cache.set(remotePath, localData);
            return localData;
        }

        try {
            const resp = await axios.get(HF_API_DOWNLOAD(this.repoId, remotePath), {
                headers: this._getHeaders(),
                timeout: 30000,
                responseType: 'arraybuffer',
            });

            const contentType = resp.headers['content-type'] || '';

            if (contentType.includes('json') || parseJson) {
                try {
                    const parsed = JSON.parse(resp.data.toString('utf-8'));
                    this._cache.set(remotePath, parsed);
                    this._saveLocal(remotePath, parsed);
                    console.log(chalk.green(`[ HFDB ] Downloaded: ${remotePath}`));
                    return parsed;
                } catch {
                    // Not valid JSON, return as string
                    const text = resp.data.toString('utf-8');
                    this._cache.set(remotePath, text);
                    this._saveLocal(remotePath, text);
                    return text;
                }
            }

            // Return as buffer for non-JSON
            return resp.data;

        } catch (err) {
            if (err.response?.status === 404) {
                console.log(chalk.gray(`[ HFDB ] File not found: ${remotePath}`));
                return null;
            }
            console.error(chalk.red(`[ HFDB ] Download failed ${remotePath}: ${err.message}`));
            return null;
        }
    }

    /**
     * List files di HF Dataset repo
     * @param {string} [dirPath=''] - Directory path
     * @returns {Promise<Array<{path, type, size}>>}
     */
    async listFiles(dirPath = '') {
        if (!this.enabled || !this._initialized) {
            return [];
        }

        try {
            const resp = await axios.get(HF_API_TREE(this.repoId, dirPath), {
                headers: this._getHeaders(),
                timeout: 15000,
            });

            const files = (resp.data || []).map(f => ({
                path: f.path || f.rfilename,
                type: f.type || (f.rfilename ? 'file' : 'directory'),
                size: f.size || f.blobId ? 0 : undefined,
            }));

            return files;
        } catch (err) {
            console.error(chalk.red(`[ HFDB ] List failed: ${err.message}`));
            return [];
        }
    }

    /**
     * Cek apakah file ada di HF Dataset
     * @param {string} remotePath
     * @returns {Promise<boolean>}
     */
    async exists(remotePath) {
        try {
            const resp = await axios.head(HF_API_DOWNLOAD(this.repoId, remotePath), {
                headers: this._getHeaders(),
                timeout: 10000,
            });
            return resp.status === 200;
        } catch {
            return false;
        }
    }

    // ============================================================
    //  SYNC OPERATIONS
    // ============================================================

    /**
     * Push semua local data ke HF
     * @param {object} dataMap - Map of { remotePath: data }
     * @returns {Promise<{success: number, failed: number, errors: string[]}>}
     */
    async push(dataMap) {
        if (!this.enabled || !this._initialized) {
            return { success: 0, failed: 0, errors: ['HFDB not enabled'] };
        }

        const results = { success: 0, failed: 0, errors: [] };

        for (const [remotePath, data] of Object.entries(dataMap)) {
            const result = await this.uploadFile(remotePath, data);
            if (result.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push(`${remotePath}: ${result.message}`);
            }
        }

        console.log(chalk.cyan(`[ HFDB ] Push complete: ${results.success} success, ${results.failed} failed`));
        return results;
    }

    /**
     * Pull semua data dari HF ke lokal
     * @param {string[]} filePaths - List of remote paths to download
     * @returns {Promise<{success: number, failed: number, data: object}>}
     */
    async pull(filePaths) {
        if (!this.enabled || !this._initialized) {
            return { success: 0, failed: 0, data: {} };
        }

        const results = { success: 0, failed: 0, data: {} };

        for (const remotePath of filePaths) {
            const data = await this.downloadFile(remotePath);
            if (data !== null) {
                results.success++;
                results.data[remotePath] = data;
            } else {
                results.failed++;
            }
        }

        console.log(chalk.cyan(`[ HFDB ] Pull complete: ${results.success} success, ${results.failed} failed`));
        return results;
    }

    /**
     * Sync jadibot data (banlist, tos_accepted) dari/ke HF
     * @param {string} direction - 'push' atau 'pull'
     * @returns {Promise<object>}
     */
    async syncJadibot(direction) {
        const jadibot = require('./jadibot');
        const files = ['jadibot/banlist.json', 'jadibot/tos_accepted.json'];

        if (direction === 'pull') {
            const result = await this.pull(files);
            if (result.data['jadibot/banlist.json']) {
                try {
                    const banData = result.data['jadibot/banlist.json'];
                    if (Array.isArray(banData)) {
                        jadibot.bannedList = new Set(banData);
                    }
                } catch {}
            }
            if (result.data['jadibot/tos_accepted.json']) {
                try {
                    const tosData = result.data['jadibot/tos_accepted.json'];
                    if (Array.isArray(tosData)) {
                        jadibot.tosAccepted = new Set(tosData);
                    }
                } catch {}
            }
            return result;
        }

        if (direction === 'push') {
            return await this.push({
                'jadibot/banlist.json': Array.from(jadibot.bannedList || []),
                'jadibot/tos_accepted.json': Array.from(jadibot.tosAccepted || []),
            });
        }

        return { success: 0, failed: 0 };
    }

    // ============================================================
    //  LOCAL SYNC (Cache)
    // ============================================================

    /**
     * @private Save data to local file
     */
    _saveLocal(remotePath, data) {
        if (!this._localSyncDir) return;
        try {
            const localPath = path.join(this._localSyncDir, remotePath);
            const dir = path.dirname(localPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const content = typeof data === 'object'
                ? JSON.stringify(data, null, 2)
                : typeof data === 'string' ? data : data.toString();

            fs.writeFileSync(localPath, content);
        } catch (err) {
            console.error(chalk.yellow(`[ HFDB ] Local save failed: ${err.message}`));
        }
    }

    /**
     * @private Load data from local file
     */
    _loadLocal(remotePath) {
        if (!this._localSyncDir) return null;
        try {
            const localPath = path.join(this._localSyncDir, remotePath);
            if (!fs.existsSync(localPath)) return null;

            const content = fs.readFileSync(localPath, 'utf-8');
            try {
                return JSON.parse(content);
            } catch {
                return content;
            }
        } catch {
            return null;
        }
    }

    // ============================================================
    //  AUTO-SAVE
    // ============================================================

    /**
     * @private Start auto-save timer
     */
    _startAutoSave() {
        if (!this.autoSaveInterval || this._autoSaveTimer) return;

        this._autoSaveTimer = setInterval(async () => {
            try {
                console.log(chalk.gray('[ HFDB ] Auto-saving...'));
                await this.syncJadibot('push');
            } catch (err) {
                console.error(chalk.red(`[ HFDB ] Auto-save error: ${err.message}`));
            }
        }, this.autoSaveInterval);

        console.log(chalk.gray(`[ HFDB ] Auto-save every ${this.autoSaveInterval / 60000} minutes`));
    }

    /**
     * Stop auto-save timer
     */
    stopAutoSave() {
        if (this._autoSaveTimer) {
            clearInterval(this._autoSaveTimer);
            this._autoSaveTimer = null;
        }
    }

    // ============================================================
    //  UTILITY
    // ============================================================

    /**
     * Clear in-memory cache
     */
    clearCache() {
        this._cache.clear();
    }

    /**
     * Get cache entry
     */
    getCache(key) {
        return this._cache.get(key);
    }

    /**
     * Set cache entry
     */
    setCache(key, value) {
        this._cache.set(key, value);
    }

    /**
     * Get status info
     */
    getStatus() {
        return {
            enabled: this.enabled,
            initialized: this._initialized,
            repoId: this.repoId,
            autoSave: this.autoSaveInterval ? `${this.autoSaveInterval / 60000} min` : 'disabled',
            cachedFiles: this._cache.size,
            localSyncDir: this._localSyncDir,
        };
    }
}

// ============================================================
//  EXPORTS
// ============================================================

module.exports = new HFDatabase();
