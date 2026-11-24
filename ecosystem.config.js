// PM2: pm2 start ecosystem.config.js
// A porta NAO e fixada aqui: o servidor define pela variavel PORT (sem ela, usa 3100).
module.exports = {
  apps: [
    {
      name: 'conferencia-nf',
      script: 'server.js',
      cwd: __dirname,
      env: { HOST: '0.0.0.0' },
      autorestart: true,
      max_restarts: 10,
      watch: false
    }
  ]
};
