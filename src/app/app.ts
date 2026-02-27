import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SidebarComponent } from './shared/components/sidebar/sidebar.component';
import { DatabaseService } from './core/services/database.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SidebarComponent, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  @ViewChild('drawerInput') drawerInput?: ElementRef<HTMLInputElement>;
  dbReady = false;
  dbError: string | null = null;

  constructor(private db: DatabaseService, private cdr: ChangeDetectorRef) {}

  closeDrawer(): void {
    const el = this.drawerInput?.nativeElement;
    if (el) el.checked = false;
  }

  async ngOnInit() {
    try {
      await this.db.init();
      this.dbReady = true;
      this.cdr.detectChanges();
    } catch (err: any) {
      this.dbError = err?.message ?? 'Unknown error during database initialization.';
      this.cdr.detectChanges();
      console.error('DB init failed:', err);
    }
  }
}
