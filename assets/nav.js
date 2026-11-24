// The language picker is a plain <details>; this closes it like a menu.
const picker = document.querySelector('.lang-picker');

if (picker) {
  document.addEventListener('click', event => {
    if (picker.open && !picker.contains(event.target)) picker.open = false;
  });
  picker.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker.open) return;
    picker.open = false;
    picker.querySelector('summary').focus();
  });
}
