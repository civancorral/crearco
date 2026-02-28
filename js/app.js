/**
 * Crear-Co - Main Application JavaScript
 * Scroll reveal, animated counters, testimonials carousel,
 * FAQ accordion, mobile menu, sticky header
 */

document.addEventListener('DOMContentLoaded', () => {

  // ===== 1. SCROLL REVEAL (IntersectionObserver) =====
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -40px 0px'
  });

  document.querySelectorAll('.section-reveal').forEach(el => {
    revealObserver.observe(el);
  });

  // ===== 2. ANIMATED COUNTERS =====
  function animateCounter(element, target, duration) {
    duration = duration || 2000;
    const suffix = element.dataset.suffix || '';
    const startTime = performance.now();

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = Math.floor(target * easeOut);
      element.textContent = current.toLocaleString('es-MX') + suffix;
      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }
    requestAnimationFrame(update);
  }

  let countersAnimated = false;
  const counterSection = document.getElementById('social-proof');
  if (counterSection) {
    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !countersAnimated) {
          countersAnimated = true;
          const counters = counterSection.querySelectorAll('[data-counter]');
          counters.forEach(el => {
            const target = parseInt(el.dataset.counter, 10);
            animateCounter(el, target, 2200);
          });
          counterObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    counterObserver.observe(counterSection);
  }

  // ===== 3. STICKY HEADER =====
  const header = document.getElementById('header');
  if (header) {
    let lastScrollY = 0;
    const scrollThreshold = 50;

    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > scrollThreshold) {
        header.classList.add('header-scrolled');
      } else {
        header.classList.remove('header-scrolled');
      }
      lastScrollY = currentScrollY;
    }, { passive: true });
  }

  // ===== 4. MOBILE MENU =====
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenuClose = document.getElementById('mobile-menu-close');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileOverlay = document.getElementById('mobile-overlay');

  function openMobileMenu() {
    mobileMenu.classList.add('active');
    mobileOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    mobileMenu.classList.remove('active');
    mobileOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
  if (mobileMenuClose) mobileMenuClose.addEventListener('click', closeMobileMenu);
  if (mobileOverlay) mobileOverlay.addEventListener('click', closeMobileMenu);

  // Close mobile menu on nav link click
  document.querySelectorAll('.mobile-nav-link').forEach(link => {
    link.addEventListener('click', closeMobileMenu);
  });

  // ===== 5. SMOOTH SCROLL =====
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;
      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = target.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.scrollY - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // ===== 6. TESTIMONIALS CAROUSEL =====
  const carouselContainer = document.getElementById('testimonials-carousel');
  const track = document.getElementById('testimonials-track');
  const dotsContainer = document.getElementById('testimonial-dots');
  const prevBtn = document.getElementById('testimonial-prev');
  const nextBtn = document.getElementById('testimonial-next');

  if (track && dotsContainer) {
    const slides = track.children;
    let currentIndex = 0;
    let autoplayInterval = null;

    function getSlidesPerView() {
      if (window.innerWidth >= 1024) return 3;
      if (window.innerWidth >= 768) return 2;
      return 1;
    }

    let slidesPerView = getSlidesPerView();

    function getMaxIndex() {
      return Math.max(0, slides.length - slidesPerView);
    }

    function goTo(index) {
      currentIndex = Math.max(0, Math.min(index, getMaxIndex()));
      const offset = -(currentIndex * (100 / slidesPerView));
      track.style.transform = 'translateX(' + offset + '%)';
      updateDots();
    }

    function next() {
      if (currentIndex >= getMaxIndex()) {
        goTo(0);
      } else {
        goTo(currentIndex + 1);
      }
    }

    function prev() {
      if (currentIndex <= 0) {
        goTo(getMaxIndex());
      } else {
        goTo(currentIndex - 1);
      }
    }

    function createDots() {
      dotsContainer.innerHTML = '';
      const totalDots = getMaxIndex() + 1;
      for (let i = 0; i < totalDots; i++) {
        const dot = document.createElement('button');
        dot.className = 'w-2 h-2 rounded-full transition-all duration-300';
        dot.setAttribute('aria-label', 'Ir al testimonio ' + (i + 1));
        dot.addEventListener('click', () => goTo(i));
        dotsContainer.appendChild(dot);
      }
      updateDots();
    }

    function updateDots() {
      const dots = dotsContainer.children;
      for (let i = 0; i < dots.length; i++) {
        if (i === currentIndex) {
          dots[i].className = 'w-6 h-2 rounded-full bg-teal-400 transition-all duration-300';
        } else {
          dots[i].className = 'w-2 h-2 rounded-full bg-white/20 hover:bg-white/40 transition-all duration-300';
        }
      }
    }

    function startAutoplay() {
      stopAutoplay();
      autoplayInterval = setInterval(next, 4000);
    }

    function stopAutoplay() {
      if (autoplayInterval) {
        clearInterval(autoplayInterval);
        autoplayInterval = null;
      }
    }

    // Touch/swipe support
    let touchStartX = 0;
    let touchMoveX = 0;
    track.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      stopAutoplay();
    }, { passive: true });
    track.addEventListener('touchmove', (e) => {
      touchMoveX = e.touches[0].clientX;
    }, { passive: true });
    track.addEventListener('touchend', () => {
      const diff = touchStartX - touchMoveX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) next(); else prev();
      }
      startAutoplay();
    });

    // Pause on hover (desktop)
    if (carouselContainer) {
      carouselContainer.addEventListener('mouseenter', stopAutoplay);
      carouselContainer.addEventListener('mouseleave', startAutoplay);
    }

    // Navigation buttons
    if (prevBtn) prevBtn.addEventListener('click', () => { prev(); stopAutoplay(); startAutoplay(); });
    if (nextBtn) nextBtn.addEventListener('click', () => { next(); stopAutoplay(); startAutoplay(); });

    // Handle resize
    window.addEventListener('resize', () => {
      slidesPerView = getSlidesPerView();
      createDots();
      goTo(Math.min(currentIndex, getMaxIndex()));
    });

    // Initialize
    createDots();
    goTo(0);
    startAutoplay();
  }

  // ===== 7. FAQ ACCORDION =====
  document.querySelectorAll('.faq-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const item = button.parentElement;
      const isActive = item.classList.contains('active');
      const expanded = button.getAttribute('aria-expanded') === 'true';

      // Close all
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('active');
        const toggle = i.querySelector('.faq-toggle');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      });

      // Toggle current
      if (!isActive) {
        item.classList.add('active');
        button.setAttribute('aria-expanded', 'true');
      }
    });
  });

});
