import { ComponentFixture, TestBed } from '@angular/core/testing';

import { File } from './file';

describe('File', () => {
  let component: File;
  let fixture: ComponentFixture<File>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [File]
    })
    .compileComponents();

    fixture = TestBed.createComponent(File);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
