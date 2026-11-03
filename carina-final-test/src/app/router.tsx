import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const QuickEntry = lazy(() => import('@/pages/QuickEntry').then(m => ({ default: m.QuickEntry })));
const Transactions = lazy(() => import('@/pages/Transactions').then(m => ({ default: m.Transactions })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const EditTransaction = lazy(() => import('@/pages/EditTransaction').then(m => ({ default: m.EditTransaction })));
const Transfer = lazy(() => import('@/pages/Transfer').then(m => ({ default: m.Transfer })));
const TransferDetail = lazy(() => import('@/pages/TransferDetail').then(m => ({ default: m.TransferDetail })));
const Reflection = lazy(() => import('@/pages/Reflection').then(m => ({ default: m.Reflection })));
const Settlement = lazy(() => import('@/pages/Settlement').then(m => ({ default: m.Settlement })));
const NetWorthHistory = lazy(() => import('@/pages/NetWorthHistory').then(m => ({ default: m.NetWorthHistory })));
const Reconciliation = lazy(() => import('@/pages/Reconciliation').then(m => ({ default: m.Reconciliation })));

export const router = createBrowserRouter([
  { path: '/quick-entry', element: <QuickEntry /> },
  { path: '/transactions/:id/edit', element: <EditTransaction /> },
  { path: '/transfer', element: <Transfer /> },
  { path: '/transfer/:id', element: <TransferDetail /> },
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Dashboard /> },
      { path: '/transactions', element: <Transactions /> },
      { path: '/reflection', element: <Reflection /> },
      { path: '/net-worth', element: <NetWorthHistory /> },
      { path: '/reconciliation', element: <Reconciliation /> },
      { path: '/settlement', element: <Settlement /> },
      { path: '/settings', element: <Settings /> },
      { path: '/settings/accounts', element: <Settings /> },
      { path: '/settings/categories', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> }
    ]
  }
]);
