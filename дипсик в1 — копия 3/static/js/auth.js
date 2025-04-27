// static/js/auth.js
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authButton')?.addEventListener('click', () => {
    window.location.href = '/auth';
  });

  document.getElementById('registerForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const login = document.getElementById('newLogin').value;
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('role').value;
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({login, password, role})
    });
    const data = await res.json();
    if (data.success) {
      alert('Регистрация успешна');
      window.location = '/auth';
    } else {
      alert(data.error);
    }
  });

  document.getElementById('authForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const login = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({login, password})
    });
    const data = await res.json();
    if (data.role) {
      localStorage.setItem('currentUser', JSON.stringify(data));
      window.location = data.role === 'boss' ? '/boss' : '/foreman';
    } else {
      alert(data.error || 'Ошибка авторизации');
    }
  });

  document.getElementById('logoutButton')?.addEventListener('click', () => {
    localStorage.removeItem('currentUser');
    window.location = '/';
  });
});
