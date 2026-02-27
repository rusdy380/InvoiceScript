import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../../core/services/database.service';
import { Company } from '../../../core/models/company.model';

@Component({
  selector: 'app-company-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './company-form.component.html',
})
export class CompanyFormComponent implements OnInit {
  isEdit = false;
  companyId: number | null = null;

  company: Company = {
    name: '',
    registration_number: '',
    address: '',
    email: '',
    phone: '',
    bank_name: '',
    bank_account: '',
    bank_swift: '',
    payment_terms: 30,
    logo_base64: '',
  };

  saved = false;
  error = '';

  constructor(
    private db: DatabaseService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit = true;
      this.companyId = Number(id);
      const existing = this.db.getCompany(this.companyId);
      if (existing) {
        this.company = { ...existing };
      }
    }
  }

  onLogoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.company.logo_base64 = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.company.logo_base64 = '';
  }

  save(): void {
    this.error = '';
    if (!this.company.name.trim()) {
      this.error = 'Company name is required.';
      return;
    }
    try {
      if (this.isEdit && this.companyId) {
        this.db.updateCompany({ ...this.company, id: this.companyId });
      } else {
        this.db.insertCompany(this.company);
      }
      this.saved = true;
      setTimeout(() => this.router.navigate(['/companies']), 800);
    } catch (e: any) {
      this.error = e.message ?? 'Failed to save company.';
    }
  }
}
