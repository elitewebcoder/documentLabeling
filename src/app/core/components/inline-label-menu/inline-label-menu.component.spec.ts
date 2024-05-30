import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InlineLabelMenuComponent } from './inline-label-menu.component';

describe('InlineLabelMenuComponent', () => {
  let component: InlineLabelMenuComponent;
  let fixture: ComponentFixture<InlineLabelMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ InlineLabelMenuComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(InlineLabelMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
