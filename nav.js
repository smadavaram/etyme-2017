// Navigation menu functionality
document.addEventListener('DOMContentLoaded', function() {
  // Product menu toggle
  const productBtn = document.querySelector('button[aria-controls="m-product"]');
  const productMenu = document.getElementById('m-product');
  const solutionsBtn = document.querySelector('button[aria-controls="m-solutions"]');
  const solutionsMenu = document.getElementById('m-solutions');
  const resourcesBtn = document.querySelector('button[aria-controls="m-resources"]');
  const resourcesMenu = document.getElementById('m-resources');
  const burger = document.querySelector('.burger');
  const drawer = document.getElementById('eh-drawer');

  function closeAllMenus() {
    productMenu.hidden = true;
    solutionsMenu.hidden = true;
    resourcesMenu.hidden = true;
    productBtn.setAttribute('aria-expanded', 'false');
    solutionsBtn.setAttribute('aria-expanded', 'false');
    resourcesBtn.setAttribute('aria-expanded', 'false');
  }

  productBtn.addEventListener('click', function() {
    const isExpanded = productBtn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();
    if (!isExpanded) {
      productMenu.hidden = false;
      productBtn.setAttribute('aria-expanded', 'true');
    }
  });

  solutionsBtn.addEventListener('click', function() {
    const isExpanded = solutionsBtn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();
    if (!isExpanded) {
      solutionsMenu.hidden = false;
      solutionsBtn.setAttribute('aria-expanded', 'true');
    }
  });

  resourcesBtn.addEventListener('click', function() {
    const isExpanded = resourcesBtn.getAttribute('aria-expanded') === 'true';
    closeAllMenus();
    if (!isExpanded) {
      resourcesMenu.hidden = false;
      resourcesBtn.setAttribute('aria-expanded', 'true');
    }
  });

  // Burger menu toggle
  burger.addEventListener('click', function() {
    const isExpanded = burger.getAttribute('aria-expanded') === 'true';
    drawer.hidden = isExpanded;
    burger.setAttribute('aria-expanded', !isExpanded);
  });

  // Close menus when clicking outside
  document.addEventListener('click', function(e) {
    if (!e.target.closest('.eh')) {
      closeAllMenus();
    }
  });

  // Role tabs functionality
  const tabs = document.querySelectorAll('[role="tab"]');
  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      const role = tab.dataset.role;

      // Update tab states
      tabs.forEach(t => t.setAttribute('aria-selected', 'false'));
      tab.setAttribute('aria-selected', 'true');

      // Show/hide panes
      document.querySelectorAll('.pane').forEach(pane => {
        pane.hidden = pane.id !== `pane-${role}`;
      });
    });
  });
});
