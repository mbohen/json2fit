import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing.component').then((module) => module.LandingComponent)
  },
  {
    path: 'convert',
    loadComponent: () =>
      import('./features/converter/converter.component').then((module) => module.ConverterComponent)
  },
  {
    path: 'details',
    loadComponent: () => import('./features/details/details.component').then((module) => module.DetailsComponent)
  },
  {
    path: 'help',
    loadComponent: () => import('./features/help/help.component').then((module) => module.HelpComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
