import { Component, OnInit } from '@angular/core';
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
  dbReady = false;

  constructor(private db: DatabaseService) {}

  async ngOnInit() {
    await this.db.init();
    this.dbReady = true;
  }
}
