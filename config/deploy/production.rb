# Simple Role Syntax
# ==================
# Supports bulk-adding hosts to roles, the primary server in each group
# is considered to be the first unless any hosts have the primary
# property set.  Don't declare `role :all`, it's a meta role.

role :app, %w{deploy@157.230.90.106}
role :web, %w{deploy@157.230.90.106}
role :db,  %w{deploy@157.230.90.106}
set :deploy_to, '/var/www/etyme'
set :branch, 'dev'

# Extended Server Syntax
# ======================
# This can be used to drop a more detailed server definition into the
# server list. The second argument is a, or duck-types, Hash and is
# used to set extended properties on the server.

server '157.230.90.106', user: 'deploy',  password: '', roles: %w{web app}
