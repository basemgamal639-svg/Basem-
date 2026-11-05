const { layout } = require('./layout');
const { esc, ph, b, business, services } = require('./helpers');
const { icon } = require('../icons');

const pad = (n) => String(n).padStart(2, '0');

function sectionHead({ num, label, title, intro, light = false, center = false }) {
  return `<div class="section-head${center ? ' center' : ''}" data-reveal>
    <p class="eyebrow${light ? ' eyebrow-light' : ''}"><span class="mono">${num}</span>${esc(label)}</p>
    <h2>${title}</h2>
    ${intro ? `<p class="lead">${intro}</p>` : ''}
  </div>`;
}

function hero() {
  const city = b.city();
  return `<section class="hero" aria-labelledby="hero-title">
  <div class="hero-grid-bg" aria-hidden="true"></div>
  <div class="container hero-inner">
    <div class="hero-copy">
      <p class="eyebrow eyebrow-light" data-reveal><span class="dot" aria-hidden="true"></span>Auto Repair &amp; Maintenance${city ? ' in ' + esc(city) : ` · ${ph('Your City')}`}</p>
      <h1 id="hero-title" data-reveal>Expert Auto Repair. <span class="accent">Honest Service.</span> Reliable Results.</h1>
      <p class="hero-lead" data-reveal>From routine maintenance to complex repairs, our team helps keep your vehicle safe, reliable, and road-ready.</p>
      <div class="hero-ctas" data-reveal>
        <a class="btn btn-accent btn-lg" href="#book">Book an Appointment ${icon('arrow')}</a>
        <a class="btn btn-outline-light btn-lg" href="#services">Explore Our Services</a>
      </div>
      <ul class="hero-points" data-reveal>
        <li>${icon('receipt')}Transparent estimates</li>
        <li>${icon('parts')}Quality parts</li>
        <li>${icon('chat')}Clear communication</li>
      </ul>
    </div>
    <div class="hero-visual" data-reveal>
      <div class="frame">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <img src="/images/hero-workshop.svg" width="720" height="600" alt="Illustration of a car raised on a service lift inside an auto repair workshop" fetchpriority="high">
      </div>
      <div class="hero-tag">
        <span class="mono">Service bay</span>
        <strong>Diagnostics · Repairs · Maintenance</strong>
      </div>
    </div>
  </div>
  <div class="ticker" aria-hidden="true">
    <div class="ticker-track">${[...services, ...services].map((s) => `<span>${esc(s.name)}</span>`).join('')}</div>
  </div>
</section>`;
}

function servicesSection() {
  const cards = services
    .map(
      (s, i) => `<article class="service-card" data-reveal>
      <div class="service-top"><span class="mono">${pad(i + 1)}</span><span class="service-icon">${icon(s.icon)}</span></div>
      <h3><a href="/services/${s.slug}">${esc(s.name)}</a></h3>
      <p>${esc(s.short)}</p>
      <div class="service-actions">
        <a class="link-arrow" href="/services/${s.slug}" aria-label="Learn more about ${esc(s.name)}">Learn more ${icon('arrow')}</a>
        <a class="btn btn-ghost btn-xs" href="/?service=${s.slug}#book" data-book-service="${esc(s.name)}" aria-label="Book ${esc(s.name)}">Book service</a>
      </div>
    </article>`
    )
    .join('');
  return `<section class="section section-paper" id="services" aria-labelledby="services-title">
  <div class="container">
    <div class="split-head">
      ${sectionHead({ num: '01', label: 'Our Services', title: '<span id="services-title">Complete car care under one roof</span>' })}
      <p class="lead" data-reveal>Whatever your vehicle needs — from a routine oil change to tracking down a stubborn fault — we inspect it carefully, explain what we find and only recommend the work that matters${b.areaText() ? ` to drivers in ${esc(b.areaText())}` : ''}.</p>
    </div>
    <div class="services-grid">
      ${cards}
      <aside class="service-cta" data-reveal>
        <p class="mono">Not sure what’s wrong?</p>
        <h3>Describe the problem and we’ll take it from there.</h3>
        <p>Strange noise, warning light or something just doesn’t feel right? Request a diagnostic appointment and tell us what you’ve noticed.</p>
        <a class="btn btn-accent" href="/?service=other#book" data-book-service="Other / Not sure">Request a Diagnosis ${icon('arrow')}</a>
      </aside>
    </div>
  </div>
</section>`;
}

function whySection() {
  const items = [
    ['user', 'Experienced technicians', 'Your car is handled by skilled automotive technicians who take the time to diagnose properly before repairing.'],
    ['receipt', 'Transparent estimates', 'You get a clear estimate before work begins. No surprise charges — we ask before doing anything extra.'],
    ['parts', 'Quality replacement parts', 'We fit reliable, quality parts suited to your vehicle so repairs are built to last.'],
    ['chat', 'Clear communication', 'We explain what we found in plain language and keep you updated while your car is with us.'],
    ['calendar', 'Convenient booking', 'Request an appointment online in a couple of minutes, at a time that suits your schedule.'],
    ['shield', 'Reliable repairs & maintenance', 'From quick services to complex repairs, we focus on doing the job right the first time.'],
  ];
  return `<section class="section section-dark" id="why" aria-labelledby="why-title">
  <div class="container why-grid">
    <div class="why-intro">
      ${sectionHead({ num: '02', label: 'Why Choose Us', title: '<span id="why-title">Car care you can actually trust</span>', light: true, intro: 'Choosing a garage comes down to trust. Here is what you can expect every time you bring your vehicle to us.' })}
      <a class="btn btn-accent" href="#book" data-reveal>Book an Appointment ${icon('arrow')}</a>
    </div>
    <ul class="why-list">
      ${items
        .map(
          ([ic, t, d], i) => `<li data-reveal>
        <span class="why-icon">${icon(ic)}</span>
        <div><p class="mono">${pad(i + 1)}</p><h3>${t}</h3><p>${d}</p></div>
      </li>`
        )
        .join('')}
    </ul>
  </div>
</section>`;
}

function aboutSection() {
  return `<section class="section section-paper" id="about" aria-labelledby="about-title">
  <div class="container about-grid">
    <div class="about-visual" data-reveal>
      <div class="frame frame-light">
        <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
        <img src="/images/about-garage.svg" width="640" height="560" loading="lazy" alt="Illustration of a mechanic’s workbench with tools and an engine on a stand">
      </div>
      <div class="about-badge">
        <span class="mono">Est.</span>
        <strong>${business.foundedYear ? esc(business.foundedYear) : ph('Year')}</strong>
      </div>
    </div>
    <div class="about-copy">
      ${sectionHead({ num: '03', label: 'About the Garage', title: `<span id="about-title">Welcome to ${b.nameHtml()}</span>` })}
      <div class="placeholder-copy" data-reveal>
        <p class="ph-note">${icon('clipboard')} Placeholder text — replace with your shop’s story</p>
        <p>[Tell customers how your shop started, who founded it and how long you have been serving ${b.city() ? esc(b.city()) : 'your community'}. Mention what makes your team and workshop different.]</p>
        <p>[Describe your mission — for example, providing honest, dependable car care and treating every customer’s vehicle as if it were your own.]</p>
      </div>
      <ul class="values" data-reveal>
        <li>${icon('check')}<span><strong>Honesty</strong> — we explain the problem and the options before any work starts.</span></li>
        <li>${icon('check')}<span><strong>Quality</strong> — careful workmanship and dependable parts.</span></li>
        <li>${icon('check')}<span><strong>Respect</strong> — for your time, your budget and your vehicle.</span></li>
      </ul>
      <div class="about-ctas" data-reveal>
        <a class="btn btn-dark" href="#book">Book an Appointment</a>
        <a class="link-arrow" href="#contact">Get in touch ${icon('arrow')}</a>
      </div>
    </div>
  </div>
</section>`;
}

function processSection() {
  const steps = [
    ['calendar', 'Book Your Appointment', 'Send an appointment request online with your vehicle details and preferred time. We’ll contact you to confirm.'],
    ['car', 'Bring In Your Vehicle', 'Drop your car off at the agreed time. We inspect it and explain what we find and what it will cost before starting.'],
    ['wrench', 'Get Your Vehicle Serviced', 'We complete the approved work, walk you through what was done and get you back on the road.'],
  ];
  return `<section class="section section-light" id="how-it-works" aria-labelledby="how-title">
  <div class="container">
    ${sectionHead({ num: '04', label: 'How It Works', title: '<span id="how-title">Three simple steps</span>', center: true })}
    <ol class="steps">
      ${steps
        .map(
          ([ic, t, d], i) => `<li class="step" data-reveal>
        <div class="step-num"><span>${pad(i + 1)}</span></div>
        <span class="step-icon">${icon(ic)}</span>
        <h3>${t}</h3>
        <p>${d}</p>
      </li>`
        )
        .join('')}
    </ol>
  </div>
</section>`;
}

function field({ id, label, type = 'text', required = true, attrs = '', full = false, hint = '' }) {
  return `<div class="field${full ? ' field-full' : ''}">
    <label for="${id}">${label}${required ? ' <span class="req" aria-hidden="true">*</span>' : ' <span class="opt">(optional)</span>'}</label>
    <input id="${id}" name="${id.replace(/^(a|c)-/, '')}" type="${type}" ${required ? 'required aria-required="true"' : ''} ${attrs} aria-describedby="${id}-err${hint ? ` ${id}-hint` : ''}">
    ${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ''}
    <p class="error" id="${id}-err" aria-live="polite"></p>
  </div>`;
}

function bookingSection() {
  const year = new Date().getFullYear() + 1;
  return `<section class="section section-dark booking" id="book" aria-labelledby="book-title">
  <div class="container booking-grid">
    <div class="booking-info">
      ${sectionHead({ num: '05', label: 'Book an Appointment', title: '<span id="book-title">Request your service appointment</span>', light: true, intro: 'Fill in the form and we’ll get back to you to confirm a time. It only takes a couple of minutes.' })}
      <div class="notice" data-reveal>
        ${icon('clock')}
        <p><strong>This is an appointment request.</strong> Your booking is not confirmed until our team contacts you to confirm the date and time.</p>
      </div>
      <ul class="booking-contact" data-reveal>
        <li>${icon('phone')}<div><span class="mono">Prefer to call?</span>${b.phoneHtml()}</div></li>
        <li>${icon('clock')}<div><span class="mono">Opening hours</span>${business.hours.length ? business.hours.map((h) => `${esc(h.days)}: ${esc(h.hours)}`).join('<br>') : ph('Opening Hours')}</div></li>
      </ul>
    </div>
    <div class="form-card" data-reveal>
      <form class="form" id="appointment-form" data-form="appointment" action="/api/appointments" method="post" novalidate>
        <fieldset>
          <legend class="form-legend"><span class="mono">A</span> Your details</legend>
          <div class="form-grid">
            ${field({ id: 'a-name', label: 'Full name', attrs: 'autocomplete="name" maxlength="100"', full: true })}
            ${field({ id: 'a-phone', label: 'Phone number', type: 'tel', attrs: 'autocomplete="tel" inputmode="tel" maxlength="30"' })}
            ${field({ id: 'a-email', label: 'Email address', type: 'email', attrs: 'autocomplete="email" maxlength="150"' })}
          </div>
        </fieldset>
        <fieldset>
          <legend class="form-legend"><span class="mono">B</span> Your vehicle</legend>
          <div class="form-grid form-grid-3">
            ${field({ id: 'a-vehicle_make', label: 'Make', attrs: 'placeholder="e.g. Toyota" maxlength="50"' })}
            ${field({ id: 'a-vehicle_model', label: 'Model', attrs: 'placeholder="e.g. Corolla" maxlength="50"' })}
            ${field({ id: 'a-vehicle_year', label: 'Year', type: 'number', attrs: `inputmode="numeric" min="1950" max="${year}" placeholder="e.g. 2018"` })}
          </div>
        </fieldset>
        <fieldset>
          <legend class="form-legend"><span class="mono">C</span> Service &amp; timing</legend>
          <div class="form-grid">
            <div class="field field-full">
              <label for="a-service">Requested service <span class="req" aria-hidden="true">*</span></label>
              <select id="a-service" name="service" required aria-required="true" aria-describedby="a-service-err">
                <option value="">Choose a service…</option>
                ${services.map((s) => `<option value="${esc(s.name)}" data-slug="${s.slug}">${esc(s.name)}</option>`).join('')}
                <option value="Other / Not sure" data-slug="other">Other / Not sure</option>
              </select>
              <p class="error" id="a-service-err" aria-live="polite"></p>
            </div>
            ${field({ id: 'a-preferred_date', label: 'Preferred date', type: 'date', attrs: 'data-min-today' })}
            <div class="field">
              <label for="a-preferred_time">Preferred time <span class="req" aria-hidden="true">*</span></label>
              <select id="a-preferred_time" name="preferred_time" required aria-required="true" aria-describedby="a-preferred_time-err">
                <option value="">Choose a time…</option>
                ${business.appointmentTimes.map((t) => `<option>${esc(t)}</option>`).join('')}
              </select>
              <p class="error" id="a-preferred_time-err" aria-live="polite"></p>
            </div>
            <div class="field field-full">
              <label for="a-message">Additional information <span class="opt">(optional)</span></label>
              <textarea id="a-message" name="message" rows="4" maxlength="2000" placeholder="Describe the problem, any warning lights, noises or recent work…"></textarea>
            </div>
          </div>
        </fieldset>
        <div class="hp" aria-hidden="true"><label for="a-website">Leave this field empty</label><input id="a-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <p class="form-error" role="alert" data-form-error hidden></p>
        <button class="btn btn-accent btn-lg btn-block" type="submit" data-submit>
          <span class="btn-label">Send Appointment Request</span>
          <span class="spinner" aria-hidden="true"></span>
        </button>
        <p class="form-fine">By submitting, you agree that we may contact you about this request. See our <a href="/privacy">Privacy Policy</a>.</p>
      </form>
      <div class="form-success" data-form-success hidden tabindex="-1">
        <span class="success-icon">${icon('check')}</span>
        <h3>Request received</h3>
        <p>Thanks — your appointment request <strong data-ref></strong> has been received. <strong>It is not confirmed yet.</strong> Our team will review it and contact you to confirm a date and time.</p>
        <button class="btn btn-outline-dark" type="button" data-form-reset>Submit another request</button>
      </div>
    </div>
  </div>
</section>`;
}

function reviewsSection() {
  const real = business.testimonials;
  const cards = real.length
    ? real
        .map(
          (t) => `<figure class="review" data-reveal>
        ${icon('quote', 'icon quote-icon')}
        <blockquote><p>${esc(t.quote)}</p></blockquote>
        <figcaption><strong>${esc(t.author)}</strong>${t.vehicle ? `<span>${esc(t.vehicle)}</span>` : ''}${t.source ? `<span class="mono">via ${esc(t.source)}</span>` : ''}</figcaption>
      </figure>`
        )
        .join('')
    : [1, 2, 3]
        .map(
          (n) => `<figure class="review review-ph" data-reveal>
        ${icon('quote', 'icon quote-icon')}
        <p class="ph-note">Review placeholder ${n}</p>
        <blockquote><p>[Add a genuine customer review here. Only publish real reviews you have permission to use.]</p></blockquote>
        <figcaption><strong>[Customer name]</strong><span>[Vehicle — optional]</span></figcaption>
      </figure>`
        )
        .join('');
  return `<section class="section section-paper" id="reviews" aria-labelledby="reviews-title">
  <div class="container">
    ${sectionHead({ num: '06', label: 'Customer Reviews', title: '<span id="reviews-title">What our customers say</span>', center: true, intro: real.length ? '' : 'Real customer reviews will appear here. Add them in <code>config/business.js</code>.' })}
    <div class="reviews-grid">${cards}</div>
    ${business.social.google ? `<p class="center" data-reveal><a class="link-arrow" href="${esc(business.social.google)}" target="_blank" rel="noopener">Read more reviews on Google ${icon('arrow')}</a></p>` : ''}
  </div>
</section>`;
}

function contactSection() {
  return `<section class="section section-light" id="contact" aria-labelledby="contact-title">
  <div class="container">
    ${sectionHead({ num: '07', label: 'Contact', title: '<span id="contact-title">Get in touch</span>', intro: 'Have a question about your vehicle or a repair? Send us a message and we’ll get back to you.' })}
    <div class="contact-grid">
      <div class="contact-info">
        <ul class="contact-cards">
          <li data-reveal>${icon('pin')}<div><h3>Address</h3><p>${b.addressHtml()}</p></div></li>
          <li data-reveal>${icon('phone')}<div><h3>Phone</h3><p>${b.phoneHtml('strong-link')}</p></div></li>
          <li data-reveal>${icon('mail')}<div><h3>Email</h3><p>${b.emailHtml('strong-link')}</p></div></li>
          <li data-reveal>${icon('clock')}<div><h3>Opening hours</h3>${b.hoursHtml()}</div></li>
        </ul>
        ${b.telHref() ? `<a class="btn btn-accent btn-block call-mobile" href="${b.telHref()}">${icon('phone')} Tap to call ${esc(business.phone)}</a>` : ''}
        <div class="map" data-reveal>
          ${
            business.mapEmbedUrl
              ? `<iframe src="${esc(business.mapEmbedUrl)}" title="Map showing the location of ${esc(b.displayName())}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>`
              : `<div class="map-ph">${icon('pin')}<p><strong>Google Map placeholder</strong><br>Add your Google Maps embed URL as <code>mapEmbedUrl</code> in config/business.js.</p></div>`
          }
        </div>
        ${business.mapLink ? `<a class="link-arrow" href="${esc(business.mapLink)}" target="_blank" rel="noopener">Get directions ${icon('arrow')}</a>` : ''}
      </div>
      <div class="form-card form-card-bordered" data-reveal>
        <form class="form" id="contact-form" data-form="contact" action="/api/contact" method="post" novalidate>
          <h3 class="form-title">Send us a message</h3>
          <div class="form-grid">
            ${field({ id: 'c-name', label: 'Name', attrs: 'autocomplete="name" maxlength="100"', full: true })}
            ${field({ id: 'c-email', label: 'Email address', type: 'email', attrs: 'autocomplete="email" maxlength="150"' })}
            ${field({ id: 'c-phone', label: 'Phone number', type: 'tel', required: false, attrs: 'autocomplete="tel" inputmode="tel" maxlength="30"' })}
            ${field({ id: 'c-subject', label: 'Subject', required: false, attrs: 'maxlength="150"', full: true })}
            <div class="field field-full">
              <label for="c-message">Message <span class="req" aria-hidden="true">*</span></label>
              <textarea id="c-message" name="message" rows="5" required aria-required="true" minlength="10" maxlength="3000" aria-describedby="c-message-err"></textarea>
              <p class="error" id="c-message-err" aria-live="polite"></p>
            </div>
          </div>
          <div class="hp" aria-hidden="true"><label for="c-website">Leave this field empty</label><input id="c-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
          <p class="form-error" role="alert" data-form-error hidden></p>
          <button class="btn btn-dark btn-lg btn-block" type="submit" data-submit>
            <span class="btn-label">Send Message</span><span class="spinner" aria-hidden="true"></span>
          </button>
        </form>
        <div class="form-success" data-form-success hidden tabindex="-1">
          <span class="success-icon">${icon('check')}</span>
          <h3>Message received</h3>
          <p>Thanks for getting in touch. Your message <strong data-ref></strong> has been saved and our team will reply as soon as possible.</p>
          <button class="btn btn-outline-dark" type="button" data-form-reset>Send another message</button>
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function homePage() {
  const city = b.city();
  const title = `${business.name ? business.name + ' | ' : ''}Auto Repair & Car Maintenance${city ? ' in ' + city : ''}`;
  const description = `Professional auto repair${city ? ' in ' + city : ''}: engine diagnostics, brakes, oil changes, tires, batteries, A/C, suspension and inspections. Request an appointment online.`;
  return layout({
    title,
    description,
    path: '/',
    body: hero() + servicesSection() + whySection() + aboutSection() + processSection() + bookingSection() + reviewsSection() + contactSection(),
  });
}

module.exports = { homePage, sectionHead };
