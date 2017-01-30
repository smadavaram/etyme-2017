environment ENV['RAILS_ENV'] || 'production'
daemonize true
pidfile "/var/www/etyme/shared/tmp/pids/puma.pid"
stdout_redirect "/var/www/etyme/shared/tmp/log/stdout", "/var/www/etyme/shared/tmp/log/stderr"
threads 1, 16
bind "unix:///var/www/etyme/shared/tmp/sockets/puma.sock"
workers 2