# frozen_string_literal: true

# Simple Role Syntax
# ==================
# Supports bulk-adding hosts to roles, the primary server in each group
# is considered to be the first unless any hosts have the primary
# property set.  Don't declare `role :all`, it's a meta role.

# role :app, %w{deploy@165.227.60.86}
# role :web, %w{deploy@165.227.60.86}
# role :db,  %w{deploy@165.227.60.86}
# set :deploy_to, '/var/www/deploy'
# set :branch, 'deploy-dev'
# set :rvm1_map_bins, %w{rake gem bundle ruby}
#
# # Extended Server Syntax
# # ======================
# # This can be used to drop a more detailed server definition into the
# # server list. The second argument is a, or duck-types, Hash and is
# # used to set extended properties on the server.
#
# server '165.227.60.86', user: 'deploy',  password: 'deploy', roles: %w{web app}

# Simple Role Syntax
# ==================
# Supports bulk-adding hosts to roles, the primary server in each group
# is considered to be the first unless any hosts have the primary
# property set.  Don't declare `role :all`, it's a meta role.

role :app, %w[deploy@143.198.24.253]
role :web, %w[deploy@143.198.24.253]
role :db,  %w[deploy@143.198.24.253]
set :deploy_to, "/home/deploy/apps/#{fetch(:application)}"
set :branch, 'release'

set :stage, :production

# Extended Server Syntax
# ======================
# This can be used to drop a more detailed server definition into the
# server list. The second argument is a, or duck-types, Hash and is
# used to set extended properties on the server.
#set :ssh_options, {
#    keys: %w(etyme-2020-key.pem),
#    forward_agent: false,
#    auth_methods: %w(publickey)
#}

set :ssh_options,     { forward_agent: true, user: fetch(:user), keys: %w(~/.ssh/id_rsa.pub) }

# server '3.134.81.77', user: 'deploy_user', password: 'Etyme123@', roles: %w[web app]
