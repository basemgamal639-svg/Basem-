// Only the parts of Motion (https://motion.dev, the successor to Framer Motion) this site uses:
// the hardware-accelerated `animate` from motion/mini (Web Animations API), plus inView, stagger and spring.
// Built into public/js/vendor/motion.js by `npm run build:motion`.
export { animate } from 'motion/mini';
export { inView, stagger, spring } from 'motion';
