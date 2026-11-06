const { layout, hasGallery, hasReviews } = require('./layout');
const { esc, ph, b, business, services, photo, SHOW_PH } = require('./helpers');
const { icon } = require('../icons');
const faq = require('../../config/faq');
const vehicles = require('../../config/vehicles');
const { TOPICS } = require('../validation');
const { bookingWindow } = require('../schedule');

const label = (text, light = false) => `<p class="label${light ? ' label-light' : ''}">${text}</p>`;

/* ---------------- Hero ---------------- */
function hero() {
  const p = business.photos.hero;
  const trust = [...business.trustPoints, ...business.certifications];
  const trustIcons = ['users', 'receipt', 'gauge', 'shield', 'shield'];
  return `<section class="hero${p ? ' hero-photo' : ''}" aria-labelledby="hero-title">
  <div class="hero-media">
    ${photo(p, '<img class="hero-drawing" src="/images/drawing-car.svg" width="1600" height="640" alt="" fetchpriority="high">', { cls: 'hero-img', eager: true })}
  </div>
  <div class="wrap hero-inner">
    <p class="kicker" data-anim>Independent automotive workshop${b.city ? ` · ${esc(b.city)}` : SHOW_PH ? ` · ${ph('City')}` : ''}</p>
    <h1 id="hero-title" data-anim>Precision Repairs. <span>Performance You Can&nbsp;Trust.</span></h1>
    <p class="hero-lead" data-anim>Diagnostics, repairs and scheduled maintenance carried out by experienced technicians, with a clear written estimate before any work begins.</p>
    <div class="hero-actions" data-anim>
      <a class="btn btn-primary btn-lg" href="#book">Book an Appointment ${icon('arrow')}</a>
      <a class="btn btn-line-light btn-lg" href="#services">Explore Our Services</a>
    </div>
    ${
      business.phone || SHOW_PH
        ? `<p class="hero-phone" data-anim><span>Call the workshop</span>${b.phoneHtml('hero-phone-link')}</p>`
        : ''
    }
  </div>
  <div class="hero-trust">
    <ul class="wrap">${trust.map((t, i) => `<li>${icon(trustIcons[i] || 'shield')}<span>${esc(t)}</span></li>`).join('')}</ul>
  </div>
</section>`;
}

/* ---------------- Services index ---------------- */
function servicesSection() {
  const stage = services
    .map(
      (s, i) => `<figure class="stage-item${i === 0 ? ' is-active' : ''}" data-stage="${s.slug}">
        ${photo(s.image, `<div class="stage-plate">${icon(s.icon, 'stage-icon')}</div>`, { sizes: '40vw' })}
        <figcaption><span>${esc(s.name)}</span></figcaption>
      </figure>`
    )
    .join('');
  const rows = services
    .map(
      (s) => `<li class="svc-row" data-svc="${s.slug}">
        <span class="svc-icon">${icon(s.icon)}</span>
        ${s.image ? `<a class="svc-thumb" href="/services/${s.slug}" tabindex="-1" aria-hidden="true">${photo({ ...s.image, alt: '' }, '', { sizes: '120px' })}</a>` : ''}
        <div class="svc-body">
          <h3><a href="/services/${s.slug}">${esc(s.name)}</a></h3>
          <p>${esc(s.short)}</p>
        </div>
        <div class="svc-actions">
          <a class="link" href="/services/${s.slug}" aria-label="${esc(s.name)}: details">Details ${icon('arrow')}</a>
          <a class="btn btn-line btn-xs" href="/?service=${s.slug}#book" data-book-service="${esc(s.name)}" aria-label="Book ${esc(s.name)}">Book</a>
        </div>
      </li>`
    )
    .join('');
  return `<section class="section section-paper" id="services" aria-labelledby="services-title">
  <div class="wrap">
    <div class="section-head split">
      <div>${label('Services')}<h2 id="services-title">Everything your car needs, under one roof.</h2></div>
      <div>
        <p class="lead">From scheduled servicing to tracing a stubborn fault, every job starts with an inspection and an estimate you approve before we begin.</p>
        <a class="link" href="#contact" data-topic="Repair estimate">Get a repair estimate ${icon('arrow')}</a>
      </div>
    </div>
    <div class="svc-index">
      <div class="svc-stage" aria-hidden="true">${stage}</div>
      <ul class="svc-list">${rows}</ul>
    </div>
  </div>
</section>`;
}

/* ---------------- About ---------------- */
function aboutSection() {
  const pillars = [
    ['Experience and expertise', 'Technicians who diagnose properly before replacing parts, and who know modern vehicle systems.'],
    ['A professional approach', 'A clean, organised workshop, the right tools for the job and work carried out to manufacturer procedures.'],
    ['Transparent pricing', 'An itemised estimate before work starts. Anything extra is discussed with you first.'],
    ['Customer first', 'Straight answers, honest recommendations and updates while your car is with us.'],
  ];
  const story = SHOW_PH
    ? `<div class="ph-block"><p class="ph-tag">Placeholder: your story</p><p>[How the workshop started, who runs it and how long you have served ${b.city ? esc(b.city) : 'the area'}. Two or three sentences, in your own words.]</p></div>`
    : '';
  return `<section class="section section-light" id="about" aria-labelledby="about-title">
  <div class="wrap about">
    <div class="about-media">
      <figure class="about-main">${photo(business.photos.about, '<img src="/images/drawing-brake.svg" width="800" height="1000" alt="Technical drawing of a disc brake rotor and caliper" loading="lazy">', { sizes: '(max-width: 900px) 100vw, 50vw' })}</figure>
      <figure class="about-detail">${photo(business.photos.aboutDetail, '<img src="/images/drawing-gauge.svg" width="600" height="600" alt="" loading="lazy">', { sizes: '25vw' })}</figure>
    </div>
    <div class="about-copy">
      ${label('The workshop')}
      <h2 id="about-title">Built on Experience. Driven by Precision.</h2>
      <p class="lead">${b.name ? esc(b.name) : 'We are'}${b.name ? ' is' : ''} an independent workshop for drivers who want their car looked after properly: diagnosed accurately, repaired to standard and explained clearly.</p>
      ${story}
      ${
        business.foundedYear || business.certifications.length
          ? `<dl class="facts">${business.foundedYear ? `<div><dt>Established</dt><dd>${esc(business.foundedYear)}</dd></div>` : ''}${business.certifications.map((c) => `<div><dt>Certified</dt><dd>${esc(c)}</dd></div>`).join('')}</dl>`
          : SHOW_PH
            ? `<p class="facts-ph">${ph('Year established')} ${ph('Certifications, if any')}</p>`
            : ''
      }
      <ul class="pillars">${pillars.map(([t, d]) => `<li><h3>${t}</h3><p>${d}</p></li>`).join('')}</ul>
    </div>
  </div>
</section>`;
}

/* ---------------- Why choose us ---------------- */
function whySection() {
  const items = [
    ['users', 'Experienced Technicians', 'Skilled people who take the time to find the cause.'],
    ['receipt', 'Transparent Pricing', 'Itemised estimates, approved by you before work starts.'],
    ['parts', 'Quality Replacement Parts', 'Parts that meet or match the original specification.'],
    ['gauge', 'Modern Diagnostic Equipment', 'Scan tools and test equipment for current vehicles.'],
    ['wrench', 'Reliable Repairs', 'Work done carefully and checked before you collect.'],
    ['chat', 'Honest Recommendations', 'What is urgent, what can wait, and why.'],
  ];
  return `<section class="section section-dark" id="why" aria-labelledby="why-title">
  <div class="wrap why">
    <div class="why-head">
      ${label('Why choose us', true)}
      <h2 id="why-title">What you can expect, every visit.</h2>
    </div>
    <ul class="why-grid">${items.map(([ic, t, d]) => `<li>${icon(ic)}<h3>${t}</h3><p>${d}</p></li>`).join('')}</ul>
  </div>
</section>`;
}

/* ---------------- Booking ---------------- */
function field({ id, name, label: l, type = 'text', required = true, attrs = '', cls = '' }) {
  return `<div class="field ${cls}">
    <label for="${id}">${l}${required ? '' : ' <span class="opt">Optional</span>'}</label>
    <input id="${id}" name="${name}" type="${type}" ${required ? 'required' : ''} ${attrs} aria-describedby="${id}-err">
    <p class="error" id="${id}-err"></p>
  </div>`;
}

function bookingSection() {
  const { min, max } = bookingWindow();
  const year = new Date().getFullYear() + 1;
  const makes = Object.keys(vehicles);
  const scheduleNote = !business.booking.scheduleConfirmed && SHOW_PH
    ? `<p class="ph-tag">Placeholder: booking hours are the default Mon–Fri 08:00–17:00. Set your real schedule in config/business.js.</p>`
    : '';
  return `<section class="section section-graphite" id="book" aria-labelledby="book-title">
  <div class="wrap booking">
    <div class="booking-intro">
      ${label('Appointments', true)}
      <h2 id="book-title">Book an appointment</h2>
      <p class="lead">Choose your vehicle, the service and a time that suits you. We review every request and contact you to confirm.</p>
      <ol class="booking-steps">
        <li><span>Vehicle</span>Make, model and year</li>
        <li><span>Service and time</span>Pick an available slot</li>
        <li><span>Your details</span>So we can confirm with you</li>
      </ol>
      ${b.tel ? `<p class="booking-call">Prefer to talk? Call ${b.phoneHtml()}</p>` : SHOW_PH ? `<p class="booking-call">Prefer to talk? Call ${ph('Phone Number')}</p>` : ''}
      ${scheduleNote}
    </div>

    <div class="booking-panel">
      <form id="booking-form" class="form" action="/api/appointments" method="post" novalidate data-booking
        data-vehicles="${esc(JSON.stringify(vehicles))}">
        <ol class="stepper" aria-label="Booking progress">
          <li data-tab="1" aria-current="step"><span>1</span>Vehicle</li>
          <li data-tab="2"><span>2</span>Service &amp; time</li>
          <li data-tab="3"><span>3</span>Your details</li>
        </ol>

        <fieldset class="step" data-step="1">
          <legend class="sr-only">Step 1 of 3: Your vehicle</legend>
          <div class="grid-2">
            <div class="field">
              <label for="b-make">Make</label>
              <select id="b-make" name="vehicle_make" required aria-describedby="b-make-err">
                <option value="">Select make</option>
                ${makes.map((m) => `<option>${esc(m)}</option>`).join('')}
                <option value="__other">Other make</option>
              </select>
              <p class="error" id="b-make-err"></p>
            </div>
            <div class="field" data-other="make" hidden>
              <label for="b-make-other">Vehicle make</label>
              <input id="b-make-other" name="vehicle_make_other" maxlength="50" autocomplete="off" aria-describedby="b-make-other-err">
              <p class="error" id="b-make-other-err"></p>
            </div>
            <div class="field">
              <label for="b-model">Model</label>
              <select id="b-model" name="vehicle_model" required disabled aria-describedby="b-model-err">
                <option value="">Select make first</option>
              </select>
              <p class="error" id="b-model-err"></p>
            </div>
            <div class="field" data-other="model" hidden>
              <label for="b-model-other">Vehicle model</label>
              <input id="b-model-other" name="vehicle_model_other" maxlength="50" autocomplete="off" aria-describedby="b-model-other-err">
              <p class="error" id="b-model-other-err"></p>
            </div>
            ${field({ id: 'b-year', name: 'vehicle_year', label: 'Year', type: 'number', attrs: `inputmode="numeric" min="1950" max="${year}" placeholder="e.g. 2019"` })}
          </div>
          <div class="step-nav"><span></span><button class="btn btn-primary" type="button" data-next>Continue ${icon('arrow')}</button></div>
        </fieldset>

        <fieldset class="step" data-step="2">
          <legend class="sr-only">Step 2 of 3: Service and time</legend>
          <div class="grid-2">
            <div class="field field-full">
              <label for="b-service">Service</label>
              <select id="b-service" name="service" required aria-describedby="b-service-err">
                <option value="">Select a service</option>
                ${services.map((s) => `<option value="${esc(s.name)}" data-slug="${s.slug}">${esc(s.name)}</option>`).join('')}
                <option value="Other / Not sure" data-slug="other">Other / Not sure</option>
              </select>
              <p class="error" id="b-service-err"></p>
            </div>
            <div class="field field-full">
              <label for="b-date">Preferred date</label>
              <input id="b-date" name="preferred_date" type="date" required min="${min}" max="${max}" aria-describedby="b-date-err">
              <p class="error" id="b-date-err"></p>
            </div>
            <div class="field field-full">
              <span class="field-label" id="b-time-label">Available times</span>
              <div class="slots" role="radiogroup" aria-labelledby="b-time-label" aria-describedby="b-time-err" data-slots>
                <p class="slots-msg" data-slots-msg>Choose a date to see available times.</p>
              </div>
              <p class="error" id="b-time-err"></p>
            </div>
          </div>
          <div class="step-nav"><button class="btn btn-ghost" type="button" data-back>${icon('arrow-left')} Back</button><button class="btn btn-primary" type="button" data-next>Continue ${icon('arrow')}</button></div>
        </fieldset>

        <fieldset class="step" data-step="3">
          <legend class="sr-only">Step 3 of 3: Your details</legend>
          <div class="grid-2">
            ${field({ id: 'b-name', name: 'name', label: 'Full name', attrs: 'autocomplete="name" maxlength="100"', cls: 'field-full' })}
            ${field({ id: 'b-phone', name: 'phone', label: 'Phone number', type: 'tel', attrs: 'autocomplete="tel" inputmode="tel" maxlength="30"' })}
            ${field({ id: 'b-email', name: 'email', label: 'Email address', type: 'email', attrs: 'autocomplete="email" maxlength="150"' })}
            <div class="field field-full">
              <label for="b-message">Anything we should know? <span class="opt">Optional</span></label>
              <textarea id="b-message" name="message" rows="4" maxlength="2000" placeholder="Symptoms, warning lights, noises, recent work…"></textarea>
            </div>
          </div>
          <div class="summary" data-summary></div>
          <div class="hp" aria-hidden="true"><label for="b-website">Leave empty</label><input id="b-website" name="website" tabindex="-1" autocomplete="off"></div>
          <p class="form-error" role="alert" data-form-error hidden></p>
          <div class="step-nav"><button class="btn btn-ghost" type="button" data-back>${icon('arrow-left')} Back</button>
            <button class="btn btn-primary" type="submit" data-submit><span class="btn-label">Request Appointment</span><span class="spinner" aria-hidden="true"></span></button></div>
          <p class="fine">We use your details only to arrange this appointment. <a href="/privacy">Privacy Policy</a></p>
        </fieldset>
        <noscript><p class="form-error">Online booking needs JavaScript. Please ${b.tel ? `call us on ${esc(business.phone)}` : 'contact us'} to book.</p></noscript>
      </form>

      <div class="confirmation" data-confirmation hidden tabindex="-1" aria-live="polite">
        <p class="status-pill">${icon('clock')} Pending confirmation</p>
        <h3>Request received</h3>
        <p class="ref">Reference <strong data-ref></strong></p>
        <dl class="summary-list" data-confirm-summary></dl>
        <p>Your appointment is <strong>not confirmed yet</strong>. We will check the schedule and contact you by phone or email to confirm the time. Please keep your reference number.</p>
        <button class="btn btn-ghost" type="button" data-booking-reset>Make another request</button>
      </div>
    </div>
  </div>
</section>`;
}

/* ---------------- Gallery ---------------- */
function gallerySection() {
  if (!hasGallery()) return '';
  const items = business.gallery;
  const grid = items.length
    ? items
        .map(
          (g, i) => `<li class="g-item"><button type="button" class="g-btn" data-lightbox="${i}" aria-label="View larger: ${esc(g.alt)}">
            ${photo(g, '', { sizes: i % 6 === 0 ? '(max-width: 720px) 100vw, 66vw' : '(max-width: 720px) 50vw, 33vw' })}
            ${g.caption ? `<span class="g-cap">${esc(g.caption)}</span>` : ''}
          </button></li>`
        )
        .join('')
    : ['Workshop environment', 'Technician at work', 'Diagnostic equipment', 'Before and after', 'Scheduled maintenance', 'Engine bay detail']
        .map((t) => `<li class="g-item g-ph"><div>${icon('camera')}<span class="ph-tag">Photo placeholder</span><strong>${t}</strong></div></li>`)
        .join('');
  return `<section class="section section-paper" id="gallery" aria-labelledby="gallery-title">
  <div class="wrap">
    <div class="section-head split">
      <div>${label('Gallery')}<h2 id="gallery-title">Inside the workshop.</h2></div>
      <p class="lead">${items.length ? 'Diagnostics, repairs and maintenance, carried out with care and the right equipment.' : 'Real photography of your team and workshop goes here. Add images in config/business.js.'}</p>
    </div>
    <ul class="gallery${items.length ? '' : ' gallery-ph'}">${grid}</ul>
  </div>
  ${
    items.length
      ? `<dialog class="lightbox" data-lightbox-dialog aria-label="Image viewer">
    <figure><img alt="" data-lb-img><figcaption data-lb-cap></figcaption></figure>
    <button type="button" class="lb-btn lb-close" data-lb-close aria-label="Close">${icon('close')}</button>
    <button type="button" class="lb-btn lb-prev" data-lb-prev aria-label="Previous image">${icon('arrow-left')}</button>
    <button type="button" class="lb-btn lb-next" data-lb-next aria-label="Next image">${icon('arrow')}</button>
    <p class="lb-count" data-lb-count></p>
  </dialog>
  <script type="application/json" data-gallery>${JSON.stringify(items.map((g) => ({ src: g.src, alt: g.alt, caption: g.caption || '' }))).replace(/</g, '\\u003c')}</script>`
      : ''
  }
</section>`;
}

/* ---------------- Reviews ---------------- */
function reviewsSection() {
  if (!hasReviews()) return '';
  const t = business.testimonials;
  const r = business.googleRating;
  const rating =
    r && r.value && r.count
      ? `<div class="rating"><span class="rating-value">${esc(r.value)}</span><span class="stars" aria-hidden="true">${icon('star').repeat(5)}</span><span class="rating-meta">${esc(r.count)} reviews on Google</span></div>`
      : SHOW_PH
        ? `<p>${ph('Google rating — shown only when copied from your Google Business Profile')}</p>`
        : '';
  const cards = t.length
    ? t
        .map(
          (x) => `<figure class="review"><blockquote><p>${esc(x.quote)}</p></blockquote>
          <figcaption><strong>${esc(x.author)}</strong>${x.vehicle ? `<span>${esc(x.vehicle)}</span>` : ''}${x.source ? `<span>via ${esc(x.source)}</span>` : ''}</figcaption></figure>`
        )
        .join('')
    : SHOW_PH
      ? [1, 2, 3]
          .map(
            (n) => `<figure class="review review-ph"><p class="ph-tag">Sample placeholder ${n}</p><blockquote><p>[A genuine review from a real customer, used with their permission.]</p></blockquote>
          <figcaption><strong>[Customer first name]</strong><span>[Vehicle, optional]</span></figcaption></figure>`
          )
          .join('')
      : '';
  return `<section class="section section-light" id="reviews" aria-labelledby="reviews-title">
  <div class="wrap">
    <div class="section-head split">
      <div>${label('Reviews')}<h2 id="reviews-title">What customers say.</h2></div>
      <div>${rating}${business.googleBusinessUrl ? `<a class="link" href="${esc(business.googleBusinessUrl)}" target="_blank" rel="noopener">Read our reviews on Google ${icon('arrow')}</a>` : SHOW_PH ? `<p>${ph('Link to your Google Business Profile')}</p>` : ''}</div>
    </div>
    ${cards ? `<div class="reviews">${cards}</div>` : ''}
  </div>
</section>`;
}

/* ---------------- FAQ ---------------- */
function faqSection() {
  const items = faq.filter((f) => f.a || SHOW_PH);
  return `<section class="section section-paper" id="faq" aria-labelledby="faq-title">
  <div class="wrap faq">
    <div class="faq-head">
      ${label('FAQ')}
      <h2 id="faq-title">Questions, answered.</h2>
      <p class="lead">Something else on your mind? <a href="#contact">Send us a message</a>${b.tel ? ` or call ${b.phoneHtml()}` : ''}.</p>
    </div>
    <div class="faq-list">
      ${items
        .map(
          (f) => `<details class="faq-item">
        <summary><h3>${esc(f.q)}</h3><span class="faq-icon" aria-hidden="true">${icon('plus')}</span></summary>
        <div class="faq-a"><p>${f.a ? esc(f.a) : ph(f.placeholder || 'Answer')}</p></div>
      </details>`
        )
        .join('')}
    </div>
  </div>
</section>`;
}

/* ---------------- Contact ---------------- */
function contactSection() {
  const info = [
    ['pin', 'Address', b.addressHtml()],
    ['phone', 'Phone', business.phone || SHOW_PH ? b.phoneHtml('strong-link') : ''],
    ['mail', 'Email', business.email || SHOW_PH ? b.emailHtml('strong-link') : ''],
    ['clock', 'Opening hours', business.hours.length || SHOW_PH ? b.hoursHtml() : ''],
  ].filter(([, , v]) => v);
  return `<section class="section section-light" id="contact" aria-labelledby="contact-title">
  <div class="wrap contact">
    <div class="contact-info">
      ${label('Contact')}
      <h2 id="contact-title">${b.hasAddress ? 'Visit the workshop.' : 'Get in touch.'}</h2>
      ${info.length ? `<dl class="contact-list">${info.map(([ic, t, v]) => `<div>${icon(ic)}<dt>${t}</dt><dd>${v}</dd></div>`).join('')}</dl>` : '<p class="lead">Send us a message with your question or the work you need, and we will get back to you.</p>'}
      <div class="contact-actions">
        ${b.tel ? `<a class="btn btn-primary" href="${b.tel}">${icon('phone')} Call Now</a>` : ''}
        ${b.directionsUrl ? `<a class="btn btn-line" href="${esc(b.directionsUrl)}" target="_blank" rel="noopener">${icon('directions')} Get Directions</a>` : ''}
      </div>
      ${
        business.mapEmbedUrl
          ? `<div class="map"><iframe src="${esc(business.mapEmbedUrl)}" title="Map showing the workshop location" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>`
          : SHOW_PH
            ? `<div class="map map-ph"><p>${icon('pin')}<strong>Google Map</strong>Add your embed URL as <code>mapEmbedUrl</code> in config/business.js.</p></div>`
            : ''
      }
    </div>
    <div class="contact-form-wrap">
      <form id="contact-form" class="form form-card" action="/api/contact" method="post" novalidate data-form="contact">
        <h3>Send a message</h3>
        <p class="form-intro">Questions, repair estimates or anything else. We reply as soon as we can.</p>
        <div class="grid-2">
          <div class="field field-full">
            <label for="c-topic">Topic</label>
            <select id="c-topic" name="subject" required aria-describedby="c-topic-err">
              ${TOPICS.map((t) => `<option>${esc(t)}</option>`).join('')}
            </select>
            <p class="error" id="c-topic-err"></p>
          </div>
          ${field({ id: 'c-name', name: 'name', label: 'Name', attrs: 'autocomplete="name" maxlength="100"', cls: 'field-full' })}
          ${field({ id: 'c-email', name: 'email', label: 'Email address', type: 'email', attrs: 'autocomplete="email" maxlength="150"' })}
          ${field({ id: 'c-phone', name: 'phone', label: 'Phone number', type: 'tel', required: false, attrs: 'autocomplete="tel" inputmode="tel" maxlength="30"' })}
          <div class="field field-full">
            <label for="c-message">Message</label>
            <textarea id="c-message" name="message" rows="5" required maxlength="3000" aria-describedby="c-message-err" placeholder="For an estimate, include the make, model, year and what you have noticed."></textarea>
            <p class="error" id="c-message-err"></p>
          </div>
        </div>
        <div class="hp" aria-hidden="true"><label for="c-website">Leave empty</label><input id="c-website" name="website" tabindex="-1" autocomplete="off"></div>
        <p class="form-error" role="alert" data-form-error hidden></p>
        <button class="btn btn-dark btn-block" type="submit" data-submit><span class="btn-label">Send Message</span><span class="spinner" aria-hidden="true"></span></button>
      </form>
      <div class="confirmation confirmation-light" data-form-success hidden tabindex="-1">
        <p class="status-pill status-ok">${icon('check')} Message received</p>
        <h3>Thank you.</h3>
        <p>Your message <strong data-ref></strong> has been saved. We will reply as soon as possible.</p>
        <button class="btn btn-ghost-dark" type="button" data-form-reset>Send another message</button>
      </div>
    </div>
  </div>
</section>`;
}

function homePage() {
  const city = b.city;
  const name = business.name;
  return layout({
    title: `${name ? name + ' | ' : ''}Auto Repair, Diagnostics & Servicing${city ? ' in ' + city : ''}`,
    description: `Independent auto repair workshop${city ? ' in ' + city : ''}: engine diagnostics, brakes, servicing, transmission, tires and alignment, suspension, electrical, A/C and pre-purchase inspections. Book online.`,
    path: '/',
    body: hero() + servicesSection() + aboutSection() + whySection() + bookingSection() + gallerySection() + reviewsSection() + faqSection() + contactSection(),
  });
}

module.exports = { homePage, label };
