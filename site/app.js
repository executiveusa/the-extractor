const links = document.querySelectorAll('a[href^="#"]');
for (const link of links) {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.getAttribute('href'));
    if (target) target.setAttribute('tabindex', '-1');
  });
}
