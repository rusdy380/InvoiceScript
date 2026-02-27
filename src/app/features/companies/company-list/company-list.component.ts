import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DatabaseService } from '../../../core/services/database.service';
import { Company } from '../../../core/models/company.model';

@Component({
  selector: 'app-company-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './company-list.component.html',
})
export class CompanyListComponent implements OnInit {
  companies: Company[] = [];
  deleteConfirmId: number | null = null;

  constructor(private db: DatabaseService) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.companies = this.db.getCompanies();
  }

  confirmDelete(id: number): void {
    this.deleteConfirmId = id;
  }

  cancelDelete(): void {
    this.deleteConfirmId = null;
  }

  deleteCompany(id: number): void {
    this.db.deleteCompany(id);
    this.deleteConfirmId = null;
    this.load();
  }
}
