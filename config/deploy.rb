# frozen_string_literal: true

# config valid only for current version of Capistrano
lock '3.11.2'

set :application, 'etyme'
set :repo_url, 'git@github.com:smadavaram/etyme-2017.git'
set :rvm_ruby_version, '2.6.5'
set :passenger_restart_with_touch, true
# Default branch is :master
# ask :branch, proc { `git rev-parse --abbrev-ref HEAD`.chomp }.call

# Default deploy_to directory is /var/www/my_app_name
set :keep_releases, 5
# Default value for :scm is :git
# set :scm, :git

# Default value for :format is :pretty
# set :format, :pretty

# Default value for :log_level is :debug
# set :log_level, :debug

# Default value for :pty is false
# set :pty, true

set :linked_files, fetch(:linked_files, []).push('config/database.yml', 'config/application.yml')
set :linked_dirs, fetch(:linked_dirs, []).push('log', 'tmp/pids', 'tmp/cache', 'tmp/sockets', 'vendor/bundle', 'public/system', 'public/uploads')
# Default value for default_env is {}
# set :default_env, { path: "/opt/ruby/bin:$PATH" }

# Default value for keep_releases is 5
# set :keep_releases, 5

namespace :deploy do
  after 'deploy:published', 'restart' do
    invoke 'delayed_job:restart'
  end
end
