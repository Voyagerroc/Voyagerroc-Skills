---
name: voyagerroc-magic-ui
description: Use this skill when building highly interactive, cinematic, and animation-rich React/TypeScript web interfaces with Tailwind, Framer Motion, and GSAP.
---

# Voyagerroc Magic UI 

## Use this skill when
- The user requests a website design that is "premium", "interactive", "magic", or "cinematic".
- Building Hero sections, Galleries, or Video Banners that need high visual impact.
- The user wants smooth scroll animations, parallax effects, or magnetic buttons.

## Do not use this skill when
- Building simple data-entry forms or admin dashboards where performance and data density are prioritized over aesthetics.
- The project does not use React, Tailwind CSS, or animation libraries like Framer Motion/GSAP.

## Instructions
1. **Tech Stack Requirements:** Assume the stack uses React, TypeScript, Tailwind CSS, `framer-motion`, `gsap` (`@gsap/react`), and **Shadcn UI** (with Radix Primitives).
2. **Component Structure:**
   - Always use semantic HTML tags (`<section>`, `<article>`).
   - For full-screen cinematic sections, use `min-h-[100dvh]` or `h-[100dvh]`, `relative`, `w-full`, and `overflow-hidden`.
3. **Shadcn UI Integration:**
   - Build complex interactive elements (Dialogs, Dropdowns, Cards) by composing Shadcn primitives.
   - Combine Tailwind styling via the `cn()` utility function seamlessly with framer-motion components.
4. **Animations:**
   - Use `framer-motion` (`<motion.div>`) for entry animations (e.g., `initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}`).
   - Use `gsap` and `ScrollTrigger` for scroll-linked animations (e.g., parallax video backgrounds, pinned sections).
5. **Visual Polish:**
   - Use backdrop blurs (`backdrop-blur-md`, `bg-background/60`) for overlays over images or videos to make text readable.
   - Use gradients for highlighting important text (`bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-600`).
   - Include interactive elements like custom hover state transitions and glow effects.
6. **Responsiveness:** Ensure fonts and layout adjust smoothly for mobile and desktop screens (e.g., `text-6xl md:text-8xl`).
7. **Framer Motion Mastery:**
   - Use `<motion.div>` with `initial`, `animate`, and `exit` props alongside `<AnimatePresence>`.
   - For orchestrated animations (staggering children), always define and use `variants`.
   - Use the `layout` prop for magical, automatic transitions when elements change position.
   - Animate `transform` (scale, x, y) and `opacity` properties for hardware acceleration.
