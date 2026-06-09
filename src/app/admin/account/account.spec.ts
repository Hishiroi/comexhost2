import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of } from 'rxjs';

import { Account } from './account';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';

describe('Account', () => {
  let component: Account;
  let fixture: ComponentFixture<Account>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Account],
      providers: [
        provideNoopAnimations(),
        {
          provide: UserService,
          useValue: {
            list: () => of({ users: [] }),
            getById: () =>
              of({ user: { id: 1, name: 'A', email: 'a@gmail.com', role: 'teacher', role_level: 1 } }),
            create: () => of({ user: {} }),
            update: () => of({ user: {} }),
            delete: () => of({ ok: true }),
          },
        },
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: 99 }),
            roleLevel: () => 4,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Account);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
