document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const showRegisterBtn = document.getElementById('show-register');
  const showLoginBtn = document.getElementById('show-login');

  // Cambiar entre login y registro
  showRegisterBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.remove('active');
    registerForm.classList.add('active');
  });

  showLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
  });

  // Manejar login (sin backend por ahora)
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    console.log('Login:', { email, password });
    
    // Simulación de login exitoso
    alert('Login exitoso (simulado). Redirigiendo...');
    setTimeout(() => {
      window.location.href = '/';
    }, 1000);
  });

  // Manejar registro (sin backend por ahora)
  registerForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const name = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;
    
    if (password !== confirm) {
      alert('Las contraseñas no coinciden');
      return;
    }
    
    if (password.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    
    console.log('Registro:', { name, email, password });
    
    // Simulación de registro exitoso
    alert('Registro exitoso (simulado). Puedes iniciar sesión.');
    registerForm.classList.remove('active');
    loginForm.classList.add('active');
  });
});