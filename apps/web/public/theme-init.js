// Aplica o tema escuro antes da primeira pintura, evitando a piscada branca.
// Mesma regra do ThemeProvider: valor inválido ou ausente = seguir o sistema.
;(function () {
  try {
    var saved = localStorage.getItem('ui-theme')
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    var isDark = saved === 'dark' || (saved !== 'light' && prefersDark)
    if (isDark) document.documentElement.classList.add('dark')
  } catch (e) {
    // Sem acesso ao armazenamento: o ThemeProvider assume depois
  }
})()