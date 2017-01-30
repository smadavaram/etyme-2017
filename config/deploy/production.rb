set :domain, '138.197.90.83'
set :user, 'deployer'
set :port, '22'
set :forward_agent, true
set :deploy_to, '/var/www/etyme'
set :repository, 'git@bitbucket.org:engintechnologies/etyme.git'
set :branch, 'master'
set :keep_releases, 5