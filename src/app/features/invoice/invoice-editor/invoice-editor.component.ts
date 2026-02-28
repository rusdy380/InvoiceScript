import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DatabaseService } from '../../../core/services/database.service';
import { Company } from '../../../core/models/company.model';
import { Invoice, InvoiceLineItem, InvoiceTemplate, MonthlyVariable } from '../../../core/models/invoice.model';

interface MonthOption { value: number; label: string; }
interface YearOption  { value: number; label: string; }

@Component({
  selector: 'app-invoice-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-editor.component.html',
})
export class InvoiceEditorComponent implements OnInit {
  @ViewChild('invoicePreviewRef') invoicePreviewRef!: ElementRef<HTMLDivElement>;

  // ── State ─────────────────────────────────────────────────────────
  companies: Company[] = [];
  templates: InvoiceTemplate[] = [];
  selectedCompany: Company | null = null;
  selectedTemplateId: number | null = null;

  invoice: Invoice = this.blankInvoice();
  isEdit = false;
  invoiceId: number | null = null;

  saved = false;
  pdfGenerating = false;
  error = '';
  activeTab: 'edit' | 'preview' = 'edit';
  pdfExportName = '';

  months: MonthOption[] = [
    {value:1,label:'January'},{value:2,label:'February'},{value:3,label:'March'},
    {value:4,label:'April'},{value:5,label:'May'},{value:6,label:'June'},
    {value:7,label:'July'},{value:8,label:'August'},{value:9,label:'September'},
    {value:10,label:'October'},{value:11,label:'November'},{value:12,label:'December'},
  ];
  years: YearOption[] = [];
  shortMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  constructor(
    private db: DatabaseService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const now = new Date();
    this.years = Array.from({length: 5}, (_, i) => {
      const y = now.getFullYear() - 1 + i;
      return {value: y, label: String(y)};
    });

    this.companies = this.db.getCompanies();

    // Check for ?companyId query param
    const qCo = this.route.snapshot.queryParamMap.get('companyId');
    if (qCo) {
      const co = this.db.getCompany(Number(qCo));
      if (co) this.selectCompany(co);
    }

    // Check for edit mode
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      const existing = this.db.getInvoice(Number(id));
      if (existing) {
        this.invoice = existing;
        this.isEdit = true;
        this.invoiceId = existing.id!;
        const co = this.db.getCompany(existing.company_id);
        if (co) this.selectCompany(co, false);
      }
    } else {
      // defaults for new
      this.invoice.month = now.getMonth() + 1;
      this.invoice.year = now.getFullYear();
      this.autoSetDates();
    }
  }

  // ── Company / Template selection ──────────────────────────────────

  selectCompany(co: Company, resetInvoice = true): void {
    this.selectedCompany = co;
    this.invoice.company_id = co.id!;
    this.templates = this.db.getTemplates(co.id);
    this.selectedTemplateId = null;
    if (resetInvoice) {
      this.invoice = { ...this.blankInvoice(), company_id: co.id!, month: this.invoice.month, year: this.invoice.year };
      this.autoSetDates();
    }
  }

  onCompanyChange(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    const co = this.companies.find(c => c.id === id);
    if (co) this.selectCompany(co);
  }

  loadTemplate(): void {
    if (!this.selectedTemplateId) return;
    const t = this.db.getTemplate(this.selectedTemplateId);
    if (!t) return;
    this.invoice.bill_to_name = t.bill_to_name;
    this.invoice.bill_to_address = t.bill_to_address;
    this.invoice.bill_to_email = t.bill_to_email ?? '';
    this.invoice.notes = t.notes ?? '';
    this.invoice.tax_rate = t.tax_rate;
    this.invoice.line_items = t.line_items.map(li => ({...li}));
    this.invoice.monthly_variables = t.monthly_variables.map(v => ({...v}));
    this.recalculate();
  }

  saveAsTemplate(): void {
    if (!this.selectedCompany) return;
    const name = prompt('Template name?', `${this.selectedCompany.name} Template`);
    if (!name) return;
    const t: InvoiceTemplate = {
      company_id: this.selectedCompany.id!,
      name,
      bill_to_name: this.invoice.bill_to_name,
      bill_to_address: this.invoice.bill_to_address,
      bill_to_email: this.invoice.bill_to_email,
      notes: this.invoice.notes,
      line_items: this.invoice.line_items.map(li => ({...li})),
      monthly_variables: this.invoice.monthly_variables.map(v => ({...v})),
      payment_terms: this.selectedCompany.payment_terms,
      tax_rate: this.invoice.tax_rate ?? 0,
    };
    this.db.insertTemplate(t);
    this.templates = this.db.getTemplates(this.selectedCompany.id);
    alert('Template saved!');
  }

  // ── Date helpers ──────────────────────────────────────────────────

  onMonthYearChange(): void {
    this.autoSetDates();
    this.autoInvoiceNumber();
  }

  autoSetDates(): void {
    const m = this.invoice.month;
    const y = this.invoice.year;
    // Issue date: 5th of the month
    this.invoice.issue_date = this.formatDate(new Date(y, m - 1, 5));
    // Due date based on payment terms
    const terms = this.selectedCompany?.payment_terms ?? 30;
    const due = new Date(y, m - 1, 5);
    due.setDate(due.getDate() + terms);
    this.invoice.due_date = this.formatDate(due);
  }

  autoInvoiceNumber(): void {
    if (!this.selectedCompany || this.isEdit) return;
    this.invoice.invoice_number = this.db.getNextInvoiceNumber(
      this.selectedCompany.id!, this.invoice.year, this.invoice.month);
  }

  formatDate(d: Date): string {
    const day   = String(d.getDate()).padStart(2,'0');
    const month = this.shortMonths[d.getMonth()];
    return `${day} ${month} ${d.getFullYear()}`;
  }

  formatDateISO(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  // ── Line Items ────────────────────────────────────────────────────

  addLineItem(): void {
    this.invoice.line_items.push({ description: '', duration: '1 Month', qty: 1, unit_price: 0, amount: 0 });
  }

  removeLineItem(idx: number): void {
    this.invoice.line_items.splice(idx, 1);
    this.recalculate();
  }

  onLineChange(item: InvoiceLineItem): void {
    item.amount = item.qty * item.unit_price;
    this.recalculate();
  }

  recalculate(): void {
    const sub = this.invoice.line_items.reduce((s, li) => {
      li.amount = li.qty * li.unit_price;
      return s + li.amount;
    }, 0);
    this.invoice.subtotal = sub;
    const taxRate = this.invoice.tax_rate ?? 0;
    this.invoice.tax_amount = sub * (taxRate / 100);
    this.invoice.total = sub + this.invoice.tax_amount;
  }

  // ── Monthly Variables ─────────────────────────────────────────────

  addVariable(): void {
    this.invoice.monthly_variables.push({ key: 'VAR_' + Date.now(), label: 'New Variable', value: '' });
  }

  removeVariable(idx: number): void {
    this.invoice.monthly_variables.splice(idx, 1);
  }

  /** Resolve {VAR} placeholders in a description string */
  resolveVars(text: string): string {
    let out = text;
    for (const v of this.invoice.monthly_variables) {
      out = out.replace(new RegExp(`\\{${v.key}\\}`, 'g'), v.value);
    }
    return out;
  }

  // ── Save / Export ─────────────────────────────────────────────────

  save(): void {
    this.error = '';
    if (!this.invoice.company_id) {
      this.error = 'Please select a company.';
      return;
    }
    if (!this.invoice.invoice_number.trim()) {
      this.error = 'Invoice number is required.';
      return;
    }
    this.recalculate();
    try {
      if (this.isEdit && this.invoiceId) {
        this.db.updateInvoice({ ...this.invoice, id: this.invoiceId });
      } else {
        this.invoiceId = this.db.insertInvoice(this.invoice);
        this.isEdit = true;
      }
      this.saved = true;
      setTimeout(() => { this.saved = false; }, 2500);
    } catch(e: any) {
      this.error = e.message;
    }
  }

  async exportPdf(): Promise<void> {
    this.pdfGenerating = true;
    this.activeTab = 'preview';
    await new Promise(r => setTimeout(r, 200));

    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const el = this.invoicePreviewRef?.nativeElement;
      if (!el) { this.pdfGenerating = false; return; }

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const canvasAspect = canvas.height / canvas.width;
      const imgH = pdfW * canvasAspect;

      if (imgH <= pdfH) {
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, imgH);
      } else {
        let yOffset = 0;
        while (yOffset < canvas.height) {
          const sliceH = Math.min(canvas.height - yOffset, Math.floor(canvas.width * (pdfH / pdfW)));
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = sliceH;
          const ctx = pageCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, yOffset, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
          const pageImg = pageCanvas.toDataURL('image/png');
          if (yOffset > 0) pdf.addPage();
          pdf.addImage(pageImg, 'PNG', 0, 0, pdfW, pdfH * (sliceH / (canvas.width * (pdfH / pdfW))));
          yOffset += sliceH;
        }
      }

      const defaultName = `${this.invoice.invoice_number}-${this.shortMonths[this.invoice.month - 1]}${this.invoice.year}.pdf`;
      const custom = this.pdfExportName.trim().replace(/[<>:"/\\|?*]/g, '');
      const filename = custom ? (custom.endsWith('.pdf') ? custom : `${custom}.pdf`) : defaultName;
      pdf.save(filename);
    } finally {
      this.pdfGenerating = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────

  blankInvoice(): Invoice {
    const now = new Date();
    return {
      company_id: 0,
      invoice_number: '',
      issue_date: '',
      due_date: '',
      bill_to_name: '',
      bill_to_address: '',
      bill_to_email: '',
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      notes: '',
      line_items: [],
      monthly_variables: [],
      subtotal: 0,
      tax_rate: 0,
      tax_amount: 0,
      total: 0,
    };
  }

  get monthLabel(): string {
    return this.months.find(m => m.value === this.invoice.month)?.label ?? '';
  }

  trackByIdx(_: number, idx: number) { return idx; }
}
