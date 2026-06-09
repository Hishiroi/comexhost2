import { Component } from '@angular/core';

import { DocumentList } from '../../core/components/document-list/document-list';

@Component({
  selector: 'app-document',
  standalone: true,
  imports: [DocumentList],
  templateUrl: './document.html',
  styleUrl: './document.css',
})
export class Document {}
