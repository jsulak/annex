// Local dev reference only — the real production config is generated
// by Ansible from ansible/templates/ecosystem.config.cjs.j2
module.exports = {
  apps: [
    {
      name: 'zettelweb',
      script: 'dist/server/index.js',
      cwd: '/opt/zettelweb',
      node_args: '--enable-source-maps',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
        NOTES_DIR: '/home/zettelweb/notes',
        SESSION_SECRET: 'CHANGE_ME_TO_A_RANDOM_32_CHAR_STRING',
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
