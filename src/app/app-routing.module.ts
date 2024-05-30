import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { LabelPageComponent } from './core/label-page/label-page.component';

const routes: Routes = [
  {
    path: 'label',
    component: LabelPageComponent,
  },
  {
    path: '',
    component: AppComponent,
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
