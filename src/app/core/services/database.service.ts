import { Injectable } from '@angular/core';
import { Company } from '../models/company.model';
import { Invoice, InvoiceLineItem, InvoiceTemplate, MonthlyVariable } from '../models/invoice.model';

declare const require: any;

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private db: any = null;
  private SQL: any = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const initSqlJs = (window as any).initSqlJs;
      this.SQL = await initSqlJs({
        locateFile: (file: string) => `/sql-wasm.wasm`,
      });

      const saved = localStorage.getItem('invoiceapp_db');
      if (saved) {
        const buf = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
        this.db = new this.SQL.Database(buf);
      } else {
        this.db = new this.SQL.Database();
        this.createSchema();
        this.seedDemoData();
      }
      this.migrateSchema();

      this.ready = true;
    })();

    return this.initPromise;
  }

  private createSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        registration_number TEXT,
        address TEXT,
        email TEXT,
        phone TEXT,
        bank_name TEXT,
        bank_account TEXT,
        bank_swift TEXT,
        payment_terms INTEGER DEFAULT 30,
        logo_base64 TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS invoice_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        bill_to_name TEXT,
        bill_to_address TEXT,
        bill_to_email TEXT,
        notes TEXT,
        line_items TEXT DEFAULT '[]',
        monthly_variables TEXT DEFAULT '[]',
        payment_terms INTEGER DEFAULT 30,
        tax_rate REAL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL,
        issue_date TEXT NOT NULL,
        due_date TEXT NOT NULL,
        bill_to_name TEXT,
        bill_to_address TEXT,
        bill_to_email TEXT,
        month INTEGER,
        year INTEGER,
        notes TEXT,
        line_items TEXT DEFAULT '[]',
        monthly_variables TEXT DEFAULT '[]',
        subtotal REAL DEFAULT 0,
        tax_rate REAL DEFAULT 0,
        tax_amount REAL DEFAULT 0,
        total REAL DEFAULT 0,
        pdf_filename TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );
    `);

    this.persist();
  }

  private migrateSchema(): void {
    try {
      const res = this.db.exec('PRAGMA table_info(invoices)');
      const columns = (res[0]?.values ?? []).map((r: any[]) => r[1]);
      if (!columns.includes('pdf_filename')) {
        this.db.run('ALTER TABLE invoices ADD COLUMN pdf_filename TEXT');
        this.persist();
      }
    } catch (_) { /* ignore */ }

    // Migration: add default logos for CWD and Webiers if missing
    try {
      this.db.run(`UPDATE companies SET logo_base64 = '/company-logo/webiers_logo.png' WHERE name = 'Webiers LLP' AND (logo_base64 IS NULL OR logo_base64 = '')`);
      this.db.run(`UPDATE companies SET logo_base64 = '/company-logo/CWD.png' WHERE name = 'CWD Pte Ltd' AND (logo_base64 IS NULL OR logo_base64 = '')`);
      this.persist();
    } catch (_) { /* ignore */ }
  }

  private seedDemoData(): void {
    // Seed example companies (Webiers default, then CWD)
    this.db.run(`
      INSERT INTO companies (name, registration_number, address, email, phone, bank_name, bank_account, bank_swift, payment_terms, logo_base64)
      VALUES
        ('Webiers LLP', '202098765B', '1 Raffles Place, #20-61 One Raffles Place, Singapore 048616', 'sales@webiers.com', '+65 8765 4321', 'OCBC Bank', '5183456789', 'OCBCSGSG', 45, '/company-logo/webiers_logo.png'),
        ('CWD Pte Ltd', '202012345A', '22 Sin Ming Lane #06-76, Midview City, Singapore 573969', 'sales@cwdigitalsg.com', '+65 9123 4567', 'DBS Bank Ltd', '0720012345', 'DBSSSGSG', 30, '/company-logo/CWD.png');
    `);

    // Seed example template for company 1
    const lineItems = JSON.stringify([
      { description: 'Manpower Services ({MONTH_RANGE})\n\nLocal AI Development & Integration Services', duration: '1 Month', qty: 1, unit_price: 3000 },
    ]);

    const monthlyVars = JSON.stringify([
      { key: 'MONTH_RANGE', label: 'Service Period', value: '15th Dec 25 to 15th Jan 26' },
    ]);

    this.db.run(`
      INSERT INTO invoice_templates (company_id, name, bill_to_name, bill_to_address, bill_to_email, line_items, monthly_variables, payment_terms, tax_rate)
      VALUES (2, 'Standard Manpower Invoice', 'Dex-Lab', '60 Macpherson Road #05-08\nSingapore 360060', 'accounts@dexlab.com.sg', '${lineItems.replace(/'/g, "''")}', '${monthlyVars.replace(/'/g, "''")}', 30, 0);
    `);

    this.persist();
  }

  persist(): void {
    if (!this.db) return;
    const data = this.db.export();
    const b64 = btoa(String.fromCharCode(...data));
    localStorage.setItem('invoiceapp_db', b64);
  }

  private ensureReady(): void {
    if (!this.ready) throw new Error('Database not initialized. Call init() first.');
  }

  // ─── Companies ───────────────────────────────────────────────────────────────

  getCompanies(): Company[] {
    this.ensureReady();
    const res = this.db.exec('SELECT * FROM companies ORDER BY name');
    if (!res.length) return [];
    return this.rowsToObjects<Company>(res[0]);
  }

  getCompany(id: number): Company | null {
    this.ensureReady();
    const res = this.db.exec(`SELECT * FROM companies WHERE id = ${id}`);
    if (!res.length || !res[0].values.length) return null;
    return this.rowsToObjects<Company>(res[0])[0];
  }

  insertCompany(c: Company): number {
    this.ensureReady();
    this.db.run(`
      INSERT INTO companies (name, registration_number, address, email, phone, bank_name, bank_account, bank_swift, payment_terms, logo_base64)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [c.name, c.registration_number, c.address, c.email, c.phone, c.bank_name, c.bank_account, c.bank_swift, c.payment_terms, c.logo_base64 ?? null]);
    this.persist();
    const res = this.db.exec('SELECT last_insert_rowid() as id');
    return res[0].values[0][0] as number;
  }

  updateCompany(c: Company): void {
    this.ensureReady();
    this.db.run(`
      UPDATE companies SET
        name = ?, registration_number = ?, address = ?, email = ?, phone = ?,
        bank_name = ?, bank_account = ?, bank_swift = ?, payment_terms = ?,
        logo_base64 = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [c.name, c.registration_number, c.address, c.email, c.phone, c.bank_name, c.bank_account, c.bank_swift, c.payment_terms, c.logo_base64 ?? null, c.id]);
    this.persist();
  }

  deleteCompany(id: number): void {
    this.ensureReady();
    this.db.run(`DELETE FROM companies WHERE id = ?`, [id]);
    this.persist();
  }

  // ─── Invoice Templates ───────────────────────────────────────────────────────

  getTemplates(companyId?: number): InvoiceTemplate[] {
    this.ensureReady();
    const where = companyId ? `WHERE company_id = ${companyId}` : '';
    const res = this.db.exec(`SELECT * FROM invoice_templates ${where} ORDER BY name`);
    if (!res.length) return [];
    return this.rowsToObjects<any>(res[0]).map(r => ({
      ...r,
      line_items: JSON.parse(r.line_items || '[]'),
      monthly_variables: JSON.parse(r.monthly_variables || '[]'),
    }));
  }

  getTemplate(id: number): InvoiceTemplate | null {
    this.ensureReady();
    const res = this.db.exec(`SELECT * FROM invoice_templates WHERE id = ${id}`);
    if (!res.length || !res[0].values.length) return null;
    const r = this.rowsToObjects<any>(res[0])[0];
    return {
      ...r,
      line_items: JSON.parse(r.line_items || '[]'),
      monthly_variables: JSON.parse(r.monthly_variables || '[]'),
    };
  }

  insertTemplate(t: InvoiceTemplate): number {
    this.ensureReady();
    this.db.run(`
      INSERT INTO invoice_templates (company_id, name, bill_to_name, bill_to_address, bill_to_email, notes, line_items, monthly_variables, payment_terms, tax_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [t.company_id, t.name, t.bill_to_name, t.bill_to_address, t.bill_to_email ?? null, t.notes ?? null,
        JSON.stringify(t.line_items), JSON.stringify(t.monthly_variables), t.payment_terms, t.tax_rate]);
    this.persist();
    const res = this.db.exec('SELECT last_insert_rowid() as id');
    return res[0].values[0][0] as number;
  }

  updateTemplate(t: InvoiceTemplate): void {
    this.ensureReady();
    this.db.run(`
      UPDATE invoice_templates SET
        company_id = ?, name = ?, bill_to_name = ?, bill_to_address = ?,
        bill_to_email = ?, notes = ?, line_items = ?, monthly_variables = ?,
        payment_terms = ?, tax_rate = ?
      WHERE id = ?
    `, [t.company_id, t.name, t.bill_to_name, t.bill_to_address, t.bill_to_email ?? null, t.notes ?? null,
        JSON.stringify(t.line_items), JSON.stringify(t.monthly_variables), t.payment_terms, t.tax_rate, t.id]);
    this.persist();
  }

  deleteTemplate(id: number): void {
    this.ensureReady();
    this.db.run(`DELETE FROM invoice_templates WHERE id = ?`, [id]);
    this.persist();
  }

  // ─── Invoices ────────────────────────────────────────────────────────────────

  getInvoices(companyId?: number): Invoice[] {
    this.ensureReady();
    const where = companyId ? `WHERE company_id = ${companyId}` : '';
    const res = this.db.exec(`SELECT * FROM invoices ${where} ORDER BY year DESC, month DESC`);
    if (!res.length) return [];
    return this.rowsToObjects<any>(res[0]).map(r => this.parseInvoice(r));
  }

  getInvoice(id: number): Invoice | null {
    this.ensureReady();
    const res = this.db.exec(`SELECT * FROM invoices WHERE id = ${id}`);
    if (!res.length || !res[0].values.length) return null;
    return this.parseInvoice(this.rowsToObjects<any>(res[0])[0]);
  }

  insertInvoice(inv: Invoice): number {
    this.ensureReady();
    this.db.run(`
      INSERT INTO invoices (company_id, invoice_number, issue_date, due_date, bill_to_name, bill_to_address, bill_to_email, month, year, notes, line_items, monthly_variables, subtotal, tax_rate, tax_amount, total, pdf_filename)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [inv.company_id, inv.invoice_number, inv.issue_date, inv.due_date,
        inv.bill_to_name, inv.bill_to_address, inv.bill_to_email ?? null,
        inv.month, inv.year, inv.notes ?? null,
        JSON.stringify(inv.line_items), JSON.stringify(inv.monthly_variables),
        inv.subtotal ?? 0, inv.tax_rate ?? 0, inv.tax_amount ?? 0, inv.total ?? 0,
        inv.pdf_filename ?? null]);
    this.persist();
    const res = this.db.exec('SELECT last_insert_rowid() as id');
    return res[0].values[0][0] as number;
  }

  updateInvoice(inv: Invoice): void {
    this.ensureReady();
    this.db.run(`
      UPDATE invoices SET
        company_id = ?, invoice_number = ?, issue_date = ?, due_date = ?,
        bill_to_name = ?, bill_to_address = ?, bill_to_email = ?,
        month = ?, year = ?, notes = ?, line_items = ?, monthly_variables = ?,
        subtotal = ?, tax_rate = ?, tax_amount = ?, total = ?, pdf_filename = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [inv.company_id, inv.invoice_number, inv.issue_date, inv.due_date,
        inv.bill_to_name, inv.bill_to_address, inv.bill_to_email ?? null,
        inv.month, inv.year, inv.notes ?? null,
        JSON.stringify(inv.line_items), JSON.stringify(inv.monthly_variables),
        inv.subtotal ?? 0, inv.tax_rate ?? 0, inv.tax_amount ?? 0, inv.total ?? 0,
        inv.pdf_filename ?? null, inv.id]);
    this.persist();
  }

  deleteInvoice(id: number): void {
    this.ensureReady();
    this.db.run(`DELETE FROM invoices WHERE id = ?`, [id]);
    this.persist();
  }

  cloneInvoice(id: number): number {
    const inv = this.getInvoice(id);
    if (!inv) throw new Error('Invoice not found');

    // Advance period by one month
    let newMonth = inv.month + 1;
    let newYear  = inv.year;
    if (newMonth > 12) { newMonth = 1; newYear++; }

    // Advance monthly variable values that look like date ranges / dates
    const newMonthlyVars = inv.monthly_variables.map(v => ({
      ...v,
      value: this.advanceDateRangeByOneMonth(v.value),
    }));

    // New invoice number derived from the cloned invoice's own format
    const newInvoiceNumber = this.deriveNextInvoiceNumber(inv.invoice_number, newYear, newMonth, inv.company_id);

    // Build PDF filename: "INV-YYYYMM-NNN - <month range>"
    const rangeVar = newMonthlyVars.find(v => this.looksLikeDateRange(v.value));
    const pdfFilename = rangeVar
      ? `${newInvoiceNumber} - ${rangeVar.value}`
      : newInvoiceNumber;

    const clone: Invoice = {
      ...inv,
      id: undefined,
      created_at: undefined,
      updated_at: undefined,
      month: newMonth,
      year: newYear,
      invoice_number: newInvoiceNumber,
      issue_date: this.advanceDateStringByOneMonth(inv.issue_date),
      due_date:   this.advanceDateStringByOneMonth(inv.due_date),
      monthly_variables: newMonthlyVars,
      pdf_filename: pdfFilename,
    };
    return this.insertInvoice(clone);
  }

  /**
   * Parse an invoice number for cloning. Supports two formats:
   * 1. Date-based: PREFIX-YYYYMM-SEQ (e.g. INV-202601-003)
   * 2. Simple sequential: PREFIX + digits (e.g. CWD-00564)
   */
  private parseInvoiceNumber(num: string): { kind: 'date'; prefix: string; separator: string; seqLen: number } | { kind: 'sequential'; prefix: string; seq: number; seqLen: number } | null {
    // Date-based: has 6-digit YYYYMM block
    const dateMatch = num.match(/^(.*?)(20\d{2}(?:0[1-9]|1[0-2]))(\D*)(\d+)$/);
    if (dateMatch) {
      return { kind: 'date', prefix: dateMatch[1], separator: dateMatch[3], seqLen: dateMatch[4].length };
    }
    // Simple sequential: prefix + trailing digits (e.g. CWD-00564)
    const seqMatch = num.match(/^(.*?)(\d+)$/);
    if (seqMatch && seqMatch[2].length >= 1) {
      return { kind: 'sequential', prefix: seqMatch[1], seq: parseInt(seqMatch[2], 10), seqLen: seqMatch[2].length };
    }
    return null;
  }

  /**
   * Build the next invoice number for a cloned invoice.
   * Preserves the original format: date-based (INV-YYYYMM-NNN) or simple sequential (CWD-00564).
   */
  private deriveNextInvoiceNumber(original: string, newYear: number, newMonth: number, companyId: number): string {
    const parsed = this.parseInvoiceNumber(original);
    if (!parsed) return this.getNextInvoiceNumber(companyId, newYear, newMonth);

    if (parsed.kind === 'date') {
      const newYearMonth = `${newYear}${String(newMonth).padStart(2, '0')}`;
      const res = this.db.exec(`SELECT COUNT(*) as cnt FROM invoices WHERE company_id = ${companyId} AND year = ${newYear} AND month = ${newMonth}`);
      const count = (res[0]?.values[0][0] as number) ?? 0;
      const newSeq = String(count + 1).padStart(parsed.seqLen, '0');
      return `${parsed.prefix}${newYearMonth}${parsed.separator}${newSeq}`;
    }

    // Sequential: find max existing number with same prefix for this company, then use max+1
    const all = this.getInvoices(companyId);
    let maxSeq = parsed.seq;
    for (const inv of all) {
      const p = this.parseInvoiceNumber(inv.invoice_number);
      if (p?.kind === 'sequential' && p.prefix === parsed.prefix && p.seq > maxSeq) {
        maxSeq = p.seq;
      }
    }
    const newSeq = String(maxSeq + 1).padStart(parsed.seqLen, '0');
    return `${parsed.prefix}${newSeq}`;
  }

  /**
   * Advance every date token of the form "DDth MMM YY[YY]" inside a string by
   * one calendar month.  Handles cross-year rollovers (Dec → Jan).
   * Examples:
   *   "15th Jan 26 to 15th Feb 26"  →  "15th Feb 26 to 15th Mar 26"
   *   "15th Dec 25 to 15th Jan 26"  →  "15th Jan 26 to 15th Feb 26"
   */
  private advanceDateRangeByOneMonth(value: string): string {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateRe = /(\d{1,2})(st|nd|rd|th)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})/gi;
    return value.replace(dateRe, (_match, day, _sfx, mon, yr) => {
      let mIdx = MONTHS.findIndex(m => m.toLowerCase() === mon.toLowerCase());
      let year = parseInt(yr, 10);
      if (year < 100) year += 2000;
      mIdx++;
      if (mIdx > 11) { mIdx = 0; year++; }
      const yearStr = yr.length <= 2 ? String(year).slice(-2) : String(year);
      return `${day}${this.ordinalSuffix(parseInt(day, 10))} ${MONTHS[mIdx]} ${yearStr}`;
    });
  }

  /**
   * Advance a date string of the form "DD MMM YYYY" or "DD MMM YY" by one month.
   * Used for issue_date / due_date which the app formats without ordinal suffix.
   */
  private advanceDateStringByOneMonth(dateStr: string): string {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const m = dateStr.match(/^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2,4})$/i);
    if (!m) return dateStr;
    let mIdx = MONTHS.findIndex(mo => mo.toLowerCase() === m[2].toLowerCase());
    let year = parseInt(m[3], 10);
    if (year < 100) year += 2000;
    mIdx++;
    if (mIdx > 11) { mIdx = 0; year++; }
    const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
    const day = String(Math.min(parseInt(m[1], 10), daysInMonth)).padStart(2, '0');
    const yearStr = m[3].length <= 2 ? String(year).slice(-2) : String(year);
    return `${day} ${MONTHS[mIdx]} ${yearStr}`;
  }

  private ordinalSuffix(n: number): string {
    const v = n % 100;
    if (v >= 11 && v <= 13) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  private looksLikeDateRange(value: string): boolean {
    return /\d{1,2}(st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2,4}/i.test(value);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private parseInvoice(r: any): Invoice {
    return {
      ...r,
      line_items: JSON.parse(r.line_items || '[]'),
      monthly_variables: JSON.parse(r.monthly_variables || '[]'),
    };
  }

  private rowsToObjects<T>(result: { columns: string[]; values: any[][] }): T[] {
    return result.values.map(row =>
      Object.fromEntries(result.columns.map((col, i) => [col, row[i]])) as unknown as T
    );
  }

  getNextInvoiceNumber(companyId: number, year: number, month: number): string {
    this.ensureReady();
    const res = this.db.exec(`
      SELECT COUNT(*) as cnt FROM invoices WHERE company_id = ${companyId} AND year = ${year}
    `);
    const count = (res[0]?.values[0][0] as number) ?? 0;
    const seq = String(count + 1).padStart(3, '0');
    return `INV-${year}${String(month).padStart(2, '0')}-${seq}`;
  }

  // ─── Export / Import / Delete (JSON) ─────────────────────────────────────────

  /** Export entire database as JSON. Efficient, human-readable format. */
  exportDbJson(): string {
    this.ensureReady();
    const companies = this.getCompanies();
    const templates = this.getTemplates();
    const invoices = this.getInvoices();
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      companies,
      invoice_templates: templates,
      invoices,
    };
    return JSON.stringify(payload, null, 2);
  }

  /** Import database from JSON. Replaces existing data. */
  importDbJson(json: string): void {
    this.ensureReady();
    const data = JSON.parse(json);
    if (!data.companies || !Array.isArray(data.companies)) {
      throw new Error('Invalid export: missing companies array');
    }
    const templates = Array.isArray(data.invoice_templates) ? data.invoice_templates : [];
    const invoices = Array.isArray(data.invoices) ? data.invoices : [];

    const companyIdMap = new Map<number, number>();

    this.db.run('DELETE FROM invoices');
    this.db.run('DELETE FROM invoice_templates');
    this.db.run('DELETE FROM companies');

    for (const c of data.companies) {
      const oldId = c.id;
      this.db.run(`
        INSERT INTO companies (name, registration_number, address, email, phone, bank_name, bank_account, bank_swift, payment_terms, logo_base64)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [c.name, c.registration_number ?? '', c.address ?? '', c.email ?? '', c.phone ?? '',
        c.bank_name ?? '', c.bank_account ?? '', c.bank_swift ?? '', c.payment_terms ?? 30, c.logo_base64 ?? null]);
      const res = this.db.exec('SELECT last_insert_rowid() as id');
      const newId = res[0].values[0][0] as number;
      if (oldId != null) companyIdMap.set(oldId, newId);
    }

    for (const t of templates) {
      const newCompanyId = companyIdMap.get(t.company_id) ?? t.company_id;
      this.db.run(`
        INSERT INTO invoice_templates (company_id, name, bill_to_name, bill_to_address, bill_to_email, notes, line_items, monthly_variables, payment_terms, tax_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [newCompanyId, t.name, t.bill_to_name ?? '', t.bill_to_address ?? '', t.bill_to_email ?? null, t.notes ?? null,
        JSON.stringify(t.line_items ?? []), JSON.stringify(t.monthly_variables ?? []), t.payment_terms ?? 30, t.tax_rate ?? 0]);
    }

    for (const inv of invoices) {
      const newCompanyId = companyIdMap.get(inv.company_id) ?? inv.company_id;
      this.db.run(`
        INSERT INTO invoices (company_id, invoice_number, issue_date, due_date, bill_to_name, bill_to_address, bill_to_email, month, year, notes, line_items, monthly_variables, subtotal, tax_rate, tax_amount, total, pdf_filename)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [newCompanyId, inv.invoice_number, inv.issue_date, inv.due_date,
        inv.bill_to_name ?? '', inv.bill_to_address ?? '', inv.bill_to_email ?? null,
        inv.month, inv.year, inv.notes ?? null,
        JSON.stringify(inv.line_items ?? []), JSON.stringify(inv.monthly_variables ?? []),
        inv.subtotal ?? 0, inv.tax_rate ?? 0, inv.tax_amount ?? 0, inv.total ?? 0,
        inv.pdf_filename ?? null]);
    }

    this.persist();
  }

  /** Delete database and start fresh. Page reload required to reflect changes. */
  deleteDb(): void {
    localStorage.removeItem('invoiceapp_db');
    this.db = null;
    this.ready = false;
    this.initPromise = null;
  }
}
