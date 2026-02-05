import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import App from './App.tsx'
import LandingPage from './pages/LandingPage.tsx'
import OrgLogin from './pages/OrgLogin.tsx'
import ParentLogin from './pages/ParentLogin.tsx'
import UsersPage from './pages/UsersPage.tsx'
import LearnersPage from './pages/LearnersPage.tsx'
import AuditLogsPage from './pages/AuditLogsPage.tsx'
import BillingPage from './pages/BillingPage.tsx'
import LegalPage from './pages/LegalPage.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/demo" element={<App />} />
          <Route path="/login" element={<OrgLogin />} />
          <Route path="/login/org" element={<OrgLogin />} />
          <Route path="/login/parent" element={<ParentLogin />} />
          <Route path="/app" element={<App />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/learners" element={<LearnersPage />} />
          <Route path="/admin/audit" element={<AuditLogsPage />} />
          <Route path="/admin/billing" element={<BillingPage />} />
          <Route path="/legal" element={<LegalPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)

