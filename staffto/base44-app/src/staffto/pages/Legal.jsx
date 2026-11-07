import { Link, useParams } from 'react-router-dom';
import { Notice, PageHead } from '@/staffto/components/ui';
import { useSeo } from '@/staffto/lib/seo';
import { useSession } from '@/staffto/lib/session';
import { NotFound } from '@/staffto/pages/Static';

const UPDATED = 'November 6, 2026';

function Doc({ sections }) {
  return (
    <div className="space-y-8">
      {sections.map(([h, ...paras]) => (
        <section key={h}>
          <h2 className="mb-2 font-display text-2xl">{h}</h2>
          <div className="space-y-3 text-[15.5px] leading-relaxed text-ink/85">{paras.map((p, i) => (Array.isArray(p) ? <ul key={i} className="list-disc space-y-1 pl-5">{p.map((x) => <li key={x}>{x}</li>)}</ul> : <p key={i}>{p}</p>))}</div>
        </section>
      ))}
    </div>
  );
}

function docs(b) {
  return {
    privacy: {
      title: 'Privacy Policy',
      description: 'How StaffTO collects, uses and protects personal information under PIPEDA.',
      sections: [
        ['Who we are', `${b.name} (“we”) operates a job board and community for hospitality work in Toronto and the Greater Toronto Area. We are accountable for personal information under our control under the Personal Information Protection and Electronic Documents Act (PIPEDA). Our privacy contact is ${b.privacy_email}.`],
        ['What we collect', ['Account data: email, name, password (handled by our authentication provider), account type.', 'Job seeker data you choose to add: profile, work history, skills, certifications, preferred roles, areas, shifts, pay expectations, resumes.', 'Employer data: business details, contact person, logo, job listings, billing records.', 'Activity: applications, messages, saved jobs, reports, notifications.', 'With your permission only: first-party analytics (pages and jobs viewed, campaign tags such as utm_source). No advertising trackers.']],
        ['Why we use it', ['To run the service: show jobs, send applications to the employer you choose, deliver messages and notifications.', 'To keep the platform safe: moderation, fraud and scam prevention, enforcing our Terms.', 'To bill employers and keep tax records.', 'To improve the service using aggregated statistics.', 'To send marketing email only if you gave express consent (CASL).']],
        ['Who sees what', 'When you apply to a job, the employer for that job can see your StaffTO profile, the application and — if you attached one — your resume through a link that expires after 5 minutes. Employers cannot browse job seeker profiles they have not received an application from. We do not sell personal information.'],
        ['AI-assisted processing', 'If you opt in, we extract text from your resume so that employers you apply to (and allow) can receive an AI-assisted summary. You decide per application. See our AI transparency notice. Withdrawing consent deletes extracted text.'],
        ['Service providers & storage', 'We use Base44 for hosting, database, authentication and file storage, an email delivery provider, and (once enabled) Stripe for payments. These providers may store data outside Canada, including in the United States, where it may be accessible to authorities under local law. We require providers to protect information consistent with this policy.'],
        ['Retention', 'We keep account data while your account is open. Job listings and applications are kept for 3 years after a job closes so employers can meet Ontario record-keeping obligations, unless you delete your account sooner (applications are then anonymised). Billing records are kept for 6 years as required by Canadian tax law.'],
        ['Your rights', 'You can access, correct, download or delete your information from Settings & privacy, or by emailing us. You can withdraw consent to optional processing at any time. If you are not satisfied with our response you can complain to the Office of the Privacy Commissioner of Canada.'],
        ['Security', 'Data is protected by row-level access rules enforced on the server, private file storage for resumes, encrypted connections, and audited administrator actions. No system is perfectly secure; we will notify affected people and the Privacy Commissioner of breaches that create a real risk of significant harm, as PIPEDA requires.'],
        ['Children', 'StaffTO is for people legally allowed to work in Ontario. Users under 16 should not create an account without a parent or guardian.'],
      ],
    },
    terms: {
      title: 'Terms of Service',
      description: 'The rules for using StaffTO as a job seeker or employer.',
      sections: [
        ['The service', `${b.name} is an online job board, community and classifieds marketplace. We are not an employer of job seekers, not a temporary help agency, and we do not place workers or charge workers fees. Employers make all hiring decisions and are responsible for their own employment obligations.`],
        ['Accounts', 'Provide accurate information, keep your password safe and use one account per person or business. We may suspend accounts that break these Terms.'],
        ['Job postings', ['Every job must be real, in Ontario, and include honest pay information.', 'Postings must comply with the Employment Standards Act, 2000, including the job-posting rules in force since January 1, 2026, and the Ontario Human Rights Code.', 'No fees, deposits, training charges or “pay to apply” requests to candidates — ever.', 'No “Canadian experience” requirements.', 'We may edit formatting, refuse or remove postings, and report suspected fraud.']],
        ['Fraudulent postings', 'Anyone can report a posting using the Report link on every listing. Moderators review reports, remove fraudulent or misleading postings, and may suspend the account. Repeated reports can automatically hide classified listings pending review.'],
        ['Job seekers', 'Only apply to jobs you are interested in, keep your profile truthful, and use messages professionally. You can withdraw an application at any time.'],
        ['Classifieds', 'Sellers are responsible for what they list and for complying with the law (including food safety rules for equipment). StaffTO is not a party to classified transactions.'],
        ['Payments', 'Employer fees are shown before HST and charged in CAD. Single job posts are non-refundable once published. Subscriptions renew monthly until cancelled; cancellation takes effect at the end of the paid period. We will tell you about price changes in advance.'],
        ['Content licence', 'You keep ownership of what you post. You give us a licence to display it on StaffTO and, for employers, to share job listings on our community channels.'],
        ['Liability', 'The service is provided “as is”. To the extent permitted by law, we are not liable for hiring outcomes, the conduct of users, or indirect losses. Nothing in these Terms limits rights you have under Ontario consumer protection law.'],
        ['Law', 'These Terms are governed by the laws of Ontario and the federal laws of Canada applicable there.'],
      ],
    },
    cookies: {
      title: 'Cookies & Analytics',
      description: 'What StaffTO stores in your browser and why.',
      sections: [
        ['Essential storage', 'We store a sign-in token in your browser so you stay logged in, plus your cookie choice. These are needed to provide the service.'],
        ['Optional analytics', 'If you choose “Allow analytics”, we record first-party events — page views, job views, apply clicks and campaign tags — tied to a random per-tab session id that is deleted when you close the tab. We use this to count job views for employers and to see which channels (for example a Facebook group post) bring visitors. We do not use advertising or cross-site tracking cookies.'],
        ['Changing your choice', 'Clear this site’s storage in your browser to see the banner again, or contact us.'],
      ],
    },
    ai: {
      title: 'AI Transparency',
      description: 'How StaffTO uses AI in recruitment — advisory only, with consent and human review.',
      sections: [
        ['What the AI does', 'Employers on the Premium plan can ask for an advisory “job-relevance” analysis of an application. It compares the job’s listed skills, experience, role, certifications, schedule and location against the candidate’s profile and resume, and produces a score out of 100 with an explanation for every point, plus a list of matching and missing qualifications and a short summary.'],
        ['What it never does', ['It never rejects, advances or contacts a candidate. Only people at the employer change an application’s status.', 'It never infers or considers age, race, ancestry, place of origin, colour, ethnic origin, citizenship, creed, sex, sexual orientation, gender identity or expression, marital or family status, disability or any other ground protected by the Ontario Human Rights Code.', 'It never sees your name, email, phone number or photo — those are removed before analysis.']],
        ['How the score is made', 'The score comes from a fixed, published rubric — Skills 35, Experience 25, Role fit 15, Certifications 10, Availability 10, Location 5 — not from a language model. A language model (provided through Base44) may write the summary and pull skills from resume text. Missing items often just mean something isn’t on the profile; employers are told to ask.'],
        ['Your choice', 'AI analysis only runs on applications where you ticked “Allow AI-assisted review”. You can apply without it. You can also turn off resume text extraction in Settings, which deletes extracted text.'],
        ['Ontario disclosure', 'Ontario requires employers with 25 or more employees to disclose in public job postings when AI is used to screen, assess or select applicants. StaffTO shows that disclosure on every listing where the employer tells us they use AI tools.'],
        ['Questions or corrections', `Ask the employer, or contact ${b.privacy_email}. You can request a copy of any analysis about you.`],
      ],
    },
    employers: {
      title: 'Posting Rules for Ontario Employers',
      description: 'What Ontario law requires in hospitality job postings, and how StaffTO helps.',
      sections: [
        ['Applies to everyone on StaffTO', ['Show pay on every posting (StaffTO requirement).', 'No fees or deposits from candidates.', 'No discriminatory requirements under the Ontario Human Rights Code — describe the job and the skills it needs.', 'Respect minimum wage, tips rules and other Employment Standards Act protections.']],
        ['Employers with 25+ employees (ESA, since January 1, 2026)', ['Include expected pay or a pay range; a range can’t span more than $50,000 a year (unless pay is above $200,000).', 'State whether the posting is for an existing vacancy.', 'Disclose if AI is used to screen, assess or select applicants.', 'Don’t require Canadian experience.', 'Tell interviewed applicants whether a decision has been made, within the prescribed timeframe.', 'Keep copies of postings and related application information for 3 years.']],
        ['How StaffTO helps', 'The job form captures pay, vacancy status and AI disclosure; listings show them to candidates; your listing and applicant history stays in your dashboard. These features help — they do not replace your own legal compliance.'],
        ['Recruiters and staffing agencies', 'Since July 1, 2024, recruiters and temporary help agencies operating in Ontario must be licensed under the Employment Standards Act, and employers must not knowingly use unlicensed ones. If you post on behalf of clients as a recruiter or agency, you must hold a valid licence and tell us your licence number.'],
        ['This is not legal advice', 'Rules change. Check the Ontario Ministry of Labour, Immigration, Training and Skills Development guidance or a lawyer for your situation.'],
      ],
    },
  };
}

export default function Legal() {
  const { doc } = useParams();
  const { settings, isAdmin } = useSession();
  const d = docs(settings.branding)[doc];
  useSeo({ title: d?.title || 'Legal', description: d?.description, path: `/legal/${doc}` });
  if (!d) return <NotFound />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <PageHead eyebrow={`Last updated ${UPDATED}`} title={d.title} />
      {isAdmin && <Notice tone="brass" className="mb-10">Admin note: plain-language launch draft. Have it reviewed by an Ontario lawyer before launch (visible to admins only).</Notice>}
      <Doc sections={d.sections} />
      <p className="mt-12 border-t border-line pt-6 text-sm text-muted">Other policies: {['privacy', 'terms', 'cookies', 'ai', 'employers'].filter((x) => x !== doc).map((x, i) => <span key={x}>{i > 0 && ' · '}<Link to={`/legal/${x}`} className="underline">{docs(settings.branding)[x].title}</Link></span>)}</p>
    </div>
  );
}
