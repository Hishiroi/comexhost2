import { Component } from '@angular/core';

import { Sidenav } from './components/sidenav/sidenav';

@Component({
  selector: 'app-root',
  imports: [Sidenav],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
}
