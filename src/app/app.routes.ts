import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full',
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'companies',
    loadComponent: () =>
      import('./features/companies/company-list/company-list.component').then(m => m.CompanyListComponent),
  },
  {
    path: 'companies/new',
    loadComponent: () =>
      import('./features/companies/company-form/company-form.component').then(m => m.CompanyFormComponent),
  },
  {
    path: 'companies/:id/edit',
    loadComponent: () =>
      import('./features/companies/company-form/company-form.component').then(m => m.CompanyFormComponent),
  },
  {
    path: 'invoices',
    loadComponent: () =>
      import('./features/invoice/invoice-editor/invoice-editor.component').then(m => m.InvoiceEditorComponent),
  },
  {
    path: 'invoices/:id',
    loadComponent: () =>
      import('./features/invoice/invoice-editor/invoice-editor.component').then(m => m.InvoiceEditorComponent),
  },
];
