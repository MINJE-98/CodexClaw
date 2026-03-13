module.exports = {
  apps: [
    {
      name: "codex-telegram-claws",
      cwd: __dirname,
      script: "src/index.js",
      interpreter: "node",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: "512M",
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
