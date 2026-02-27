import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
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

  constructor(private db: DatabaseService) {}

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
}
