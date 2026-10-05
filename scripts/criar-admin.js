// Uso: node scripts/criar-admin.js "<usuario>" "<senha>" "<chave>"
// Cria (ou redefine) o administrador em data/usuarios.json (arquivo fora do git, senhas com hash).
const auth = require('../src/auth');
const [usuario, senha, chave] = process.argv.slice(2);
if (!usuario || !senha || !chave) {
  console.error('Uso: node scripts/criar-admin.js "<usuario>" "<senha>" "<chave>"');
  process.exit(1);
}
const lista = auth.carregar().filter((u) => !u.admin);
auth.criarUsuario(lista, { usuario, senha, admin: true, chave });
auth.salvar(lista);
console.log('Administrador gravado em data/usuarios.json');
