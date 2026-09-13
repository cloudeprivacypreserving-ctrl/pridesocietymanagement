import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import SetPassword from './pages/SetPassword';

import SecurityResidentsList from './pages/security/ResidentsList';
import SecurityResidentDetail from './pages/security/ResidentDetail';
import SecurityAddResident from './pages/security/AddResident';
import MySubmissions from './pages/security/MySubmissions';

import AdminDashboard from './pages/admin/Dashboard';
import AdminResidentsList from './pages/admin/ResidentsList';
import AdminResidentDetail from './pages/admin/ResidentDetail';
import AdminAddResident from './pages/admin/AddResident';
import PendingApprovals from './pages/admin/PendingApprovals';
import Issues from './pages/admin/Issues';
import Users from './pages/admin/Users';
import AuditLog from './pages/admin/AuditLog';

function Home() {
  const { profile, loading } = useAuth();
  if (loading) return null;
  if (!profile) return <Navigate to="/login" replace />;
  if (profile.must_change_password) return <Navigate to="/set-password" replace />;
  return <Navigate to={profile.role === 'admin' ? '/admin/dashboard' : '/security/residents'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/" element={<Home />} />

      <Route path="/security/residents" element={
        <ProtectedRoute allowedRoles={['security', 'admin']}><SecurityResidentsList /></ProtectedRoute>
      } />
      <Route path="/security/residents/:id" element={
        <ProtectedRoute allowedRoles={['security', 'admin']}><SecurityResidentDetail /></ProtectedRoute>
      } />
      <Route path="/security/new" element={
        <ProtectedRoute allowedRoles={['security', 'admin']}><SecurityAddResident /></ProtectedRoute>
      } />
      <Route path="/security/submissions" element={
        <ProtectedRoute allowedRoles={['security', 'admin']}><MySubmissions /></ProtectedRoute>
      } />

      <Route path="/admin/dashboard" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/residents" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminResidentsList /></ProtectedRoute>
      } />
      <Route path="/admin/residents/new" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminAddResident /></ProtectedRoute>
      } />
      <Route path="/admin/residents/:id" element={
        <ProtectedRoute allowedRoles={['admin']}><AdminResidentDetail /></ProtectedRoute>
      } />
      <Route path="/admin/pending" element={
        <ProtectedRoute allowedRoles={['admin']}><PendingApprovals /></ProtectedRoute>
      } />
      <Route path="/admin/issues" element={
        <ProtectedRoute allowedRoles={['admin']}><Issues /></ProtectedRoute>
      } />
      <Route path="/admin/users" element={
        <ProtectedRoute allowedRoles={['admin']}><Users /></ProtectedRoute>
      } />
      <Route path="/admin/audit-log" element={
        <ProtectedRoute allowedRoles={['admin']}><AuditLog /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
