import { Component } from '@angular/core';

import { DocumentList } from '../../core/components/document-list/document-list';

/**
 * "Approved / past" tab for the Coordinator. Backend filters this
 * with ?history=1 to return only files that have already moved past
 * the Coordinator stage (or are finalized), so it acts as an audit
 * log of everything the Coordinator has worked on.
 */
@Component({
  selector: 'app-coard-history',
  standalone: true,
  imports: [DocumentList],
  templateUrl: './history.html',
  styleUrl: './history.css',
})
export class History {}
