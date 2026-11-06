import { useEffect } from 'react';
import { BRAND_DEFAULTS } from '@/lib/brand';

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

// Sets title, description, canonical, Open Graph tags and optional JSON-LD for the current route.
export function useSeo({ title, description, path, jsonLd, noindex = false, image }) {
  useEffect(() => {
    const site = BRAND_DEFAULTS.site_url.replace(/\/$/, '');
    const fullTitle = title ? `${title} | ${BRAND_DEFAULTS.name}` : `${BRAND_DEFAULTS.name} — Toronto Hospitality Jobs`;
    document.title = fullTitle;
    if (description) { setMeta('name', 'description', description); setMeta('property', 'og:description', description); }
    setMeta('property', 'og:title', fullTitle);
    setMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');
    if (image) setMeta('property', 'og:image', image);
    const canonicalHref = `${site}${path ?? window.location.pathname}`;
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = canonicalHref;
    setMeta('property', 'og:url', canonicalHref);
    let script = document.getElementById('ld-json');
    if (jsonLd) {
      if (!script) { script = document.createElement('script'); script.type = 'application/ld+json'; script.id = 'ld-json'; document.head.appendChild(script); }
      script.textContent = JSON.stringify(jsonLd);
    } else if (script) script.remove();
  }, [title, description, path, noindex, image, jsonLd && JSON.stringify(jsonLd)]);
}

// schema.org JobPosting — only emitted for active jobs with pay and location (Google's eligibility requirements).
export function jobPostingLd(job, employer) {
  if (!job || job.status !== 'active' || !job.salary_min) return null;
  const typeMap = { full_time: 'FULL_TIME', part_time: 'PART_TIME', contract: 'CONTRACTOR', seasonal: 'TEMPORARY', temporary: 'TEMPORARY' };
  const cityMap = { mississauga: 'Mississauga', brampton: 'Brampton', markham: 'Markham', vaughan: 'Vaughan', richmond_hill: 'Richmond Hill', oakville: 'Oakville', pickering: 'Pickering', ajax: 'Ajax' };
  return {
    '@context': 'https://schema.org/',
    '@type': 'JobPosting',
    title: job.title,
    description: [job.description, job.responsibilities, job.requirements].filter(Boolean).join('\n\n').replace(/\n/g, '<br>') || job.title,
    datePosted: (job.published_at || job.created_date || '').slice(0, 10),
    validThrough: job.expires_at || undefined,
    employmentType: typeMap[job.employment_type] || 'OTHER',
    hiringOrganization: { '@type': 'Organization', name: job.employer_name, ...(employer?.website ? { sameAs: employer.website } : {}), ...(job.employer_logo ? { logo: job.employer_logo } : {}) },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', streetAddress: job.address || undefined, addressLocality: cityMap[job.location] || 'Toronto', addressRegion: 'ON', addressCountry: 'CA' } },
    baseSalary: { '@type': 'MonetaryAmount', currency: 'CAD', value: { '@type': 'QuantitativeValue', minValue: job.salary_min, maxValue: job.salary_max || job.salary_min, unitText: job.salary_period === 'year' ? 'YEAR' : 'HOUR' } },
    directApply: true,
  };
}
