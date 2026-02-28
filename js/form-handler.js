/**
 * Crear-Co - Form Handler
 * Validation, WhatsApp redirect, UTM tracking
 */

document.addEventListener('DOMContentLoaded', () => {

  const WHATSAPP_NUMBER = '5216674177707';

  // Get UTM params from URL
  function getUTMParams() {
    const params = new URLSearchParams(window.location.search);
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(key => {
      const val = params.get(key);
      if (val) utm[key] = val;
    });
    return utm;
  }

  // Validate phone (Mexican 10 digits)
  function isValidPhone(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length === 10;
  }

  // Show input error
  function showError(input, message) {
    input.classList.add('input-error');
    input.setAttribute('placeholder', message);
    setTimeout(() => {
      input.classList.remove('input-error');
      // Restore placeholder
      if (input.type === 'text') input.placeholder = 'Tu nombre completo';
      if (input.type === 'tel') input.placeholder = 'Tu teléfono (10 dígitos)';
    }, 3000);
  }

  // Clear error on focus
  function clearErrorOnFocus(input) {
    input.addEventListener('focus', () => {
      input.classList.remove('input-error');
    });
  }

  // Build WhatsApp URL
  function buildWhatsAppURL(name, phone, afore) {
    let message = 'Hola, me interesa precalificar para retiro por desempleo.\n';
    if (name) message += 'Nombre: ' + name + '\n';
    if (phone) message += 'Teléfono: ' + phone + '\n';
    if (afore) message += 'AFORE: ' + afore + '\n';

    const utm = getUTMParams();
    const utmParts = [];
    if (utm.utm_source) utmParts.push('Fuente: ' + utm.utm_source);
    if (utm.utm_campaign) utmParts.push('Campaña: ' + utm.utm_campaign);
    if (utmParts.length > 0) {
      message += '\n[' + utmParts.join(' | ') + ']';
    }

    return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(message);
  }

  // Track conversion event
  function trackConversion(eventLabel) {
    if (typeof gtag === 'function') {
      gtag('event', 'conversion', {
        event_category: 'precalificacion',
        event_label: eventLabel || 'organic'
      });
    }
  }

  // Handle form submissions
  function handleFormSubmit(form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const nameInput = form.querySelector('input[type="text"], input[name="nombre"]');
      const phoneInput = form.querySelector('input[type="tel"], input[name="telefono"]');
      const aforeSelect = form.querySelector('select[name="afore"]');

      const name = nameInput ? nameInput.value.trim() : '';
      const phone = phoneInput ? phoneInput.value.trim() : '';
      const afore = aforeSelect ? aforeSelect.value : '';

      // Validation
      if (!name || name.length < 2) {
        if (nameInput) showError(nameInput, 'Ingresa tu nombre');
        return;
      }

      if (!phone || !isValidPhone(phone)) {
        if (phoneInput) showError(phoneInput, 'Teléfono válido (10 dígitos)');
        return;
      }

      // Build URL and redirect
      const waUrl = buildWhatsAppURL(name, phone, afore);
      window.open(waUrl, '_blank');

      // Track
      const utm = getUTMParams();
      trackConversion(utm.utm_source || 'organic');

      // Reset form
      form.reset();
    });
  }

  // Initialize all forms
  document.querySelectorAll('#hero-form, #final-form').forEach(form => {
    handleFormSubmit(form);

    // Add focus error clearing
    form.querySelectorAll('input').forEach(input => {
      clearErrorOnFocus(input);
    });
  });

});
