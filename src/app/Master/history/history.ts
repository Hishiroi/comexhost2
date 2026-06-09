import { Component } from '@angular/core';

import { DocumentList } from '../../core/components/document-list/document-list';

/**
 * "Approved / past" tab for the Master. Backend filters this with
 * ?history=1 to return only files that have moved past the Master
 * stage (or are finalized).
 */
@Component({
  selector: 'app-master-history',
  standalone: true,
  imports: [DocumentList],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class History {}
