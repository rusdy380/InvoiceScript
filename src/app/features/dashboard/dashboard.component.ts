import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { DatabaseService } from '../../core/services/database.service';
import { Company } from '../../core/models/company.model';
import { Invoice } from '../../core/models/invoice.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  companies: Company[] = [];
  recentInvoices: Invoice[] = [];
  totalInvoices = 0;
  totalRevenue = 0;

  months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  constructor(private db: DatabaseService, private router: Router) {}

  ngOnInit(): void {
    this.companies = this.db.getCompanies();
    const all = this.db.getInvoices();
    this.totalInvoices = all.length;
    this.totalRevenue = all.reduce((s, i) => s + (i.total ?? 0), 0);
    this.recentInvoices = all.slice(0, 5);
  }

  formatMonth(inv: Invoice): string {
    return `${this.months[inv.month - 1]} ${inv.year}`;
  }

  exportDb(): void {
    const json = this.db.exportDbJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-db-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importDb(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        this.db.importDbJson(text);
        this.refreshData();
        alert('Database imported successfully!');
      } catch (e: any) {
        alert('Import failed: ' + (e.message || 'Invalid JSON'));
      }
      input.value = '';
    };
    reader.readAsText(file);
  }

  deleteDb(): void {
    if (!confirm('Delete all data? This cannot be undone. The page will reload.')) return;
    this.db.deleteDb();
    window.location.reload();
  }

  cloneInvoice(id: number): void {
    try {
      const newId = this.db.cloneInvoice(id);
      this.router.navigate(['/invoices', newId]);
    } catch (e: any) {
      alert('Clone failed: ' + e.message);
    }
  }

  deleteInvoice(inv: Invoice): void {
    if (!confirm(`Delete invoice ${inv.invoice_number}? This cannot be undone.`)) return;
    this.db.deleteInvoice(inv.id!);
    this.refreshData();
  }

  private refreshData(): void {
    this.companies = this.db.getCompanies();
    const all = this.db.getInvoices();
    this.totalInvoices = all.length;
    this.totalRevenue = all.reduce((s, i) => s + (i.total ?? 0), 0);
    this.recentInvoices = all.slice(0, 5);
  }
}
