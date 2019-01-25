# require 'mina/multistage'
# require 'mina/bundler'
# require 'mina/rails'
# require 'mina/git'
# require 'mina/rvm'

# # Manually new these paths in shared/ (eg: shared/config/database.yml) in your server.
# # They will be linked in the 'deploy:link_shared_paths' step.
# set :repository, 'git@github.com:smadavaram/etyme-2017.git'
# set :branch, 'update_rails_version'
# set :shared_paths, ['config/application.yml','config/database.yml', 'log','tmp']

# task :setup => :remote_environment do
#   queue! %[mkdir -p "#{deploy_to}/shared/log"]
#   queue! %[chmod g+rx,u+rwx "#{deploy_to}/shared/log"]

#   queue! %[mkdir -p "#{deploy_to}/shared/tmp"]
#   queue! %[chmod g+rx,u+rwx "#{deploy_to}/shared/tmp"]

#   queue! %[mkdir -p "#{deploy_to}/shared/config"]
#   queue! %[chmod g+rx,u+rwx "#{deploy_to}/shared/config"]

#   queue! %[touch "#{deploy_to}/shared/config/database.yml"]
#   queue  %[echo "-----> Be sure to edit 'shared/config/database.yml'."]

#   queue! %[mkdir -p "#{deploy_to}/shared/tmp/pids"]
#   queue! %[chmod g+rx,u+rwx "#{deploy_to}/shared/tmp"]
#   queue! %[chmod g+rx,u+rwx "#{deploy_to}/shared/tmp/pids"]

#   queue! %[mkdir -p "#{deploy_to}/shared/tmp/sockets"]
#   queue! %[chmod g+rx,u+rwx "#{deploy_to}/shared/tmp/sockets"]

#   queue! %[touch "#{deploy_to}/shared/config/application.yml"]
#   queue  %[echo "-----> Be sure to edit '#{deploy_to}/shared/config/application.yml'."]

# end

# desc "Deploys the current version to the server."
# task :remote_environment do
#   invoke :'rvm:use', 'ruby-2.3.1@etyme'
# end
# task :deploy => :remote_environment do
#   deploy do
#     # invoke :'cron:clear'
#     # invoke :'delayed_job:stop'
#     invoke :'git:clone'
#     invoke :'deploy:link_shared_paths'
#     invoke :'bundle:install'
#     invoke :'rails:db_migrate'
#     invoke :'rails:assets_precompile'

#     on :launch do
#       # invoke :'puma:restart'
#       # invoke :'cron:update'
#       # invoke :'delayed_job:start'
#     end
#   end
# end

# namespace :cron do
#   desc "create update cron"
#   task :update do
#     queue 'echo "-----> update cron"'
#     queue "cd #{deploy_to}/#{current_path} && bundle exec whenever -i"
#   end
#   task :clear do
#     queue 'echo "-----> clearing cron"'
#     queue "cd #{deploy_to}/#{current_path} && bundle exec whenever -c"
#   end
# end


# namespace :puma do
#   desc "Start the application"
#   task :start do
#     queue 'echo "-----> Start Puma"'
#     queue "cd #{deploy_to}/#{current_path} && RAILS_ENV=production bin/puma.sh start"
#   end

#   desc "Stop the application"
#   task :stop do
#     queue 'echo "-----> Stop Puma"'
#     queue "cd #{deploy_to}/#{current_path} && RAILS_ENV=production bin/puma.sh stop"
#   end

#   desc "Restart the application"
#   task :restart do
#     queue 'echo "-----> Restart Puma"'
#     queue "cd #{deploy_to}/#{current_path} && RAILS_ENV=production bin/puma.sh restart"

#   end
# end

# namespace :delayed_job do
#   desc 'Starts delayed job threads'
#   task :start => :remote_environment do
#     queue "cd #{deploy_to}/#{current_path} && RAILS_ENV=production bin/delayed_job -n 3 start"
#   end

#   desc 'Stops delayed job threads'
#   task :stop => :remote_environment do
#     queue "cd #{deploy_to}/#{current_path} &&  RAILS_ENV=production bin/delayed_job stop"
#   end
# end

# ### Connect Rails Console###########
# desc 'RUN Console Locally'
# task "rails:console" => :remote_environment do
#   invoke :'rvm:use[2.3.1@etyme]'
#   queue! "cd #{deploy_to}/#{current_path} ; RAILS_ENV=production bundle exec rails c"
# end

# ### Check Logs ################
# desc 'Tail Logs'
# task "rails:log" => :remote_environment do
#   invoke :'rvm:use[2.3.1@etyme]'
#   queue! "cd #{deploy_to}/#{current_path} ; less log/production.log"
# end