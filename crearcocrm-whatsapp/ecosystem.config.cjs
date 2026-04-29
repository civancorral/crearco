module.exports = {
  apps: [
    {
      name: 'crearcocrm-whatsapp',
      script: 'src/index.js',
      cwd: '/var/www/crearco/crearcocrm-whatsapp',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/www/crearco/crearcocrm-whatsapp/logs/error.log',
      out_file: '/var/www/crearco/crearcocrm-whatsapp/logs/out.log',
      merge_logs: true,
    },
  ],
};
