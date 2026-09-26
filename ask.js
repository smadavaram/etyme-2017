// Form submission handler for audit and contact forms
document.addEventListener('DOMContentLoaded', function() {
  const forms = document.querySelectorAll('.ask-form');

  forms.forEach(form => {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      const formData = new FormData(form);
      const data = Object.fromEntries(formData);
      const button = form.querySelector('button[type="submit"]');
      const statusDiv = form.querySelector('.ask-says');

      // Validate required fields
      if (!data.email || !data.name || !data.companyName) {
        if (statusDiv) {
          statusDiv.textContent = 'Please fill in all required fields.';
          statusDiv.hidden = false;
        }
        return;
      }

      // Show loading state
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = 'Sending...';

      try {
        // Log the submission locally
        const submission = {
          timestamp: new Date().toISOString(),
          source: form.dataset.source || 'UNKNOWN',
          data: data
        };

        console.log('Form submission:', submission);

        // Store in localStorage (for demo purposes)
        const submissions = JSON.parse(localStorage.getItem('etymeSubmissions') || '[]');
        submissions.push(submission);
        localStorage.setItem('etymeSubmissions', JSON.stringify(submissions));

        // Show success message
        if (statusDiv) {
          statusDiv.innerHTML = `
            <div style="padding:16px;background:#e8f5e9;border-radius:4px;color:#2e7d32;border-left:4px solid #4caf50">
              <strong>✓ Submission received!</strong>
              <p style="margin:8px 0 0;font-size:13px">We'll send your audit report to <strong>${data.email}</strong> within 24 hours.</p>
              <p style="margin:8px 0 0;font-size:13px">Check your spam folder if you don't see it.</p>
            </div>
          `;
          statusDiv.hidden = false;
        }

        // Reset form
        form.reset();

        // Re-enable button after 2 seconds
        setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 2000);

      } catch (error) {
        console.error('Form submission error:', error);
        if (statusDiv) {
          statusDiv.textContent = 'There was an error. Please try again.';
          statusDiv.hidden = false;
        }
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  });
});
