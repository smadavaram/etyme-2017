# Simple Role Syntax
# ==================
# Supports bulk-adding hosts to roles, the primary server in each group
# is considered to be the first unless any hosts have the primary
# property set.  Don't declare `role :all`, it's a meta role.
 
role :app, %w{deploy@165.227.60.86}
role :web, %w{deploy@165.227.60.86}
role :db,  %w{deploy@165.227.60.86}
set :deploy_to, '/var/www/deploy'
set :branch, 'update-to-ruby-2.4.1'

# Extended Server Syntax
# ======================
# This can be used to drop a more detailed server definition into the
# server list. The second argument is a, or duck-types, Hash and is
# used to set extended properties on the server.

server '165.227.60.86', user: 'deploy',  password: 'deploy', roles: %w{web app}
