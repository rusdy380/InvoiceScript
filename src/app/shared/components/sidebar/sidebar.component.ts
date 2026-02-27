import { Component, Output, EventEmitter } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  @Output() navClick = new EventEmitter<void>();

  navItems = [
    { label: 'Dashboard', route: '/dashboard', icon: 'grid' },
    { label: 'Companies', route: '/companies', icon: 'building' },
    { label: 'New Invoice', route: '/invoices', icon: 'document' },
  ];
}
