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
        locateFile: (file: string) => `/assets/sql-wasm.wasm`,
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
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
      );
    `);

    this.persist();
  }

  private seedDemoData(): void {
    // Seed example companies
    this.db.run(`
      INSERT INTO companies (name, registration_number, address, email, phone, bank_name, bank_account, bank_swift, payment_terms)
      VALUES
        ('CWD Pte Ltd', '202012345A', '22 Sin Ming Lane #06-76, Midview City, Singapore 573969', 'sales@cwdigitalsg.com', '+65 9123 4567', 'DBS Bank Ltd', '0720012345', 'DBSSSGSG', 30),
        ('Webiers LLP', '202098765B', '1 Raffles Place, #20-61 One Raffles Place, Singapore 048616', 'sales@webiers.com', '+65 8765 4321', 'OCBC Bank', '5183456789', 'OCBCSGSG', 45);
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
      VALUES (1, 'Standard Manpower Invoice', 'Dex-Lab', '60 Macpherson Road #05-08\nSingapore 360060', 'accounts@dexlab.com.sg', '${lineItems.replace(/'/g, "''")}', '${monthlyVars.replace(/'/g, "''")}', 30, 0);
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
      INSERT INTO invoices (company_id, invoice_number, issue_date, due_date, bill_to_name, bill_to_address, bill_to_email, month, year, notes, line_items, monthly_variables, subtotal, tax_rate, tax_amount, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [inv.company_id, inv.invoice_number, inv.issue_date, inv.due_date,
        inv.bill_to_name, inv.bill_to_address, inv.bill_to_email ?? null,
        inv.month, inv.year, inv.notes ?? null,
        JSON.stringify(inv.line_items), JSON.stringify(inv.monthly_variables),
        inv.subtotal ?? 0, inv.tax_rate ?? 0, inv.tax_amount ?? 0, inv.total ?? 0]);
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
        subtotal = ?, tax_rate = ?, tax_amount = ?, total = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [inv.company_id, inv.invoice_number, inv.issue_date, inv.due_date,
        inv.bill_to_name, inv.bill_to_address, inv.bill_to_email ?? null,
        inv.month, inv.year, inv.notes ?? null,
        JSON.stringify(inv.line_items), JSON.stringify(inv.monthly_variables),
        inv.subtotal ?? 0, inv.tax_rate ?? 0, inv.tax_amount ?? 0, inv.total ?? 0, inv.id]);
    this.persist();
  }

  deleteInvoice(id: number): void {
    this.ensureReady();
    this.db.run(`DELETE FROM invoices WHERE id = ?`, [id]);
    this.persist();
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
}
