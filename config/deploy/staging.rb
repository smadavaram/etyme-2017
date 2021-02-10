# frozen_string_literal: true
# role :app, %w{deploy@157.230.90.106}
# role :web, %w{deploy@157.230.90.106}
# role :db,  %w{deploy@157.230.90.106}
# set :deploy_to, '/var/www/demoetyme'
# set :branch, 'master'
# set :stage, :production
# set :rails_env, :production# Extended Server Syntax
# # ======================
# # This can be used to drop a more detailed server definition into the
# # server list. The second argument is a, or duck-types, Hash and is
# # used to set extended properties on the server.
#
# server '157.230.90.106', user: 'deploy',  password: 'Etyme123@', roles: %w{web app}
#

# role :app, %w[deploy_user@3.128.51.36]
# role :web, %w[deploy_user@3.128.51.36]
# role :db,  %w[deploy_user@3.128.51.36]
set :deploy_to, '/var/www/etyme2020'
set :repo_url, "git@github.com:smadavaram/etyme-2017.git"
set :stage, :production

server "3.128.51.36", user: "deploy_user", roles: %w{app db web}

set :branch, 'deploy-staging'

set :ssh_options, {
    keys: %w(etyme-2020-key.pem),
    forward_agent: false,
    auth_methods: %w(publickey)
}

# ask :git_http_username, fetch(:local_user)
# ask :git_http_password, '', echo: false
