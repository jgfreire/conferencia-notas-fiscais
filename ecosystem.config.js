// PM2: pm2 start ecosystem.config.js
// Troque a porta em env.PORT se a 3200 estiver ocupada no servidor.
module.exports = {
  apps: [
    {
      name: 'conferencia-nf',
      script: 'server.js',
      cwd: __dirname,
      env: { HOST: '0.0.0.0', PORT: 3200 },
      autorestart: true,
      max_restarts: 10,
      watch: false
    }
  ]
};
