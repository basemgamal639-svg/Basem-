import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SessionProvider } from '@/staffto/lib/session';
import { ToastProvider, Loading } from '@/staffto/components/ui';
import { Guard, SiteLayout } from '@/staffto/components/Layout';
import Home from '@/staffto/pages/Home';
import Jobs, { SeoLanding } from '@/staffto/pages/Jobs';
import JobDetail from '@/staffto/pages/JobDetail';
import { Login, Onboarding, Signup } from '@/staffto/pages/auth/Auth';
import { Article, Community, Contact, Employers, HowItWorks, NotFound, Pricing, Resources, Unsubscribe } from '@/staffto/pages/Static';
import Legal from '@/staffto/pages/Legal';
import Classifieds, { ClassifiedDetail, ClassifiedEditor, MyClassifieds } from '@/staffto/pages/Classifieds';
import Messages, { Notifications } from '@/staffto/pages/Messages';
import { SEO_PAGES } from '@/staffto/pages/seoPages';

// Dashboards are code-split so public pages stay light.
const L = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const acc = () => import('@/staffto/pages/account/Account');
const emp = () => import('@/staffto/pages/employer/Employer');
const adm = () => import('@/staffto/pages/admin/Admin');
const AccountLayout = L(acc, 'AccountLayout'); const SeekerOverview = L(acc, 'SeekerOverview'); const CandidateProfileEditor = L(acc, 'CandidateProfileEditor');
const Resumes = L(acc, 'Resumes'); const Applications = L(acc, 'Applications'); const SavedJobs = L(acc, 'SavedJobs'); const Settings = L(acc, 'Settings'); const Testimonial = L(acc, 'Testimonial');
const EmployerLayout = L(emp, 'EmployerLayout'); const EmployerOverview = L(emp, 'EmployerOverview'); const BusinessProfile = L(emp, 'BusinessProfile');
const EmployerJobs = L(emp, 'EmployerJobs'); const JobEditor = L(emp, 'JobEditor'); const JobShare = L(emp, 'JobShare');
const Applicants = lazy(() => import('@/staffto/pages/employer/Applicants'));
const Billing = lazy(() => import('@/staffto/pages/employer/Billing')); const Invoice = L(() => import('@/staffto/pages/employer/Billing'), 'Invoice');
const AdminLayout = L(adm, 'AdminLayout'); const AdminOverview = L(adm, 'AdminOverview'); const AdminUsers = L(adm, 'AdminUsers'); const AdminEmployers = L(adm, 'AdminEmployers');
const AdminJobs = L(adm, 'AdminJobs'); const AdminClassifieds = L(adm, 'AdminClassifieds'); const AdminReports = L(adm, 'AdminReports'); const AdminTestimonials = L(adm, 'AdminTestimonials');
const AdminCampaigns = L(adm, 'AdminCampaigns'); const AdminContent = L(adm, 'AdminContent'); const AdminPromos = L(adm, 'AdminPromos'); const AdminPayments = L(adm, 'AdminPayments');
const AdminInbox = L(adm, 'AdminInbox'); const AdminSettings = L(adm, 'AdminSettings'); const AdminAudit = L(adm, 'AdminAudit');

const G = (need, el) => <Guard need={need}>{el}</Guard>;

export default function StaffToApp() {
  return (
    <div className="min-h-screen bg-paper font-sans text-ink antialiased">
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <Suspense fallback={<div className="mx-auto max-w-page px-6"><Loading /></div>}>
            <Routes>
              <Route element={<SiteLayout />}>
                <Route index element={<Home />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="jobs/:id/:slug?" element={<JobDetail />} />
                {Object.keys(SEO_PAGES).map((slug) => <Route key={slug} path={slug} element={<SeoLanding />} />)}
                <Route path="employers" element={<Employers />} />
                <Route path="pricing" element={<Pricing />} />
                <Route path="how-it-works" element={<HowItWorks />} />
                <Route path="community" element={<Community />} />
                <Route path="resources" element={<Resources />} />
                <Route path="resources/:slug" element={<Article />} />
                <Route path="contact" element={<Contact />} />
                <Route path="legal/:doc" element={<Legal />} />
                <Route path="unsubscribe" element={<Unsubscribe />} />
                <Route path="login" element={<Login />} />
                <Route path="signup" element={<Signup />} />
                <Route path="onboarding" element={G('user', <Onboarding />)} />
                <Route path="classifieds" element={<Classifieds />} />
                <Route path="classifieds/new" element={G('any', <ClassifiedEditor />)} />
                <Route path="classifieds/mine" element={G('any', <MyClassifieds />)} />
                <Route path="classifieds/:id" element={<ClassifiedDetail />} />
                <Route path="classifieds/:id/edit" element={G('any', <ClassifiedEditor />)} />
                <Route path="messages" element={G('any', <Messages />)} />
                <Route path="notifications" element={G('user', <Notifications />)} />
                <Route path="account" element={G('any', <AccountLayout />)}>
                  <Route index element={G('seeker', <SeekerOverview />)} />
                  <Route path="profile" element={G('seeker', <CandidateProfileEditor />)} />
                  <Route path="resumes" element={G('seeker', <Resumes />)} />
                  <Route path="applications" element={G('seeker', <Applications />)} />
                  <Route path="saved" element={G('seeker', <SavedJobs />)} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="testimonial" element={<Testimonial />} />
                </Route>
                <Route path="employer" element={G('employer', <EmployerLayout />)}>
                  <Route index element={<EmployerOverview />} />
                  <Route path="profile" element={<BusinessProfile />} />
                  <Route path="jobs" element={<EmployerJobs />} />
                  <Route path="jobs/new" element={<JobEditor />} />
                  <Route path="jobs/:id/edit" element={<JobEditor />} />
                  <Route path="jobs/:id/share" element={<JobShare />} />
                  <Route path="jobs/:id/applicants" element={<Applicants />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="billing" element={<Billing />} />
                  <Route path="billing/invoice/:id" element={<Invoice />} />
                </Route>
                <Route path="admin" element={G('admin', <AdminLayout />)}>
                  <Route index element={<AdminOverview />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="employers" element={<AdminEmployers />} />
                  <Route path="jobs" element={<AdminJobs />} />
                  <Route path="classifieds" element={<AdminClassifieds />} />
                  <Route path="reports" element={<AdminReports />} />
                  <Route path="testimonials" element={<AdminTestimonials />} />
                  <Route path="campaigns" element={<AdminCampaigns />} />
                  <Route path="content" element={<AdminContent />} />
                  <Route path="promos" element={<AdminPromos />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="inbox" element={<AdminInbox />} />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="audit" element={<AdminAudit />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
    </div>
  );
}
