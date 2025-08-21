# frozen_string_literal: true

Rails.application.config.middleware.use OmniAuth::Builder do
  # config.omniauth :facebook, ENV['FACEBOOK_APP_ID'], ENV['FACEBOOK_APP_SECRET'], access_type: "online"
  provider :facebook, ENV['FACEBOOK_APP_ID'], ENV['FACEBOOK_APP_SECRET'], scope: 'email,public_profile'
  provider :google_oauth2, ENV['GOOGLE_CLIENT_ID'], ENV['GOOGLE_CLIENT_SECRET']
  provider :linkedin, ENV['LINKEDIN_KEY'], ENV['LINKEDIN_SECRET'], scope: 'r_liteprofile,r_emailaddress'
  # provider :docusign, Rails.application.config.client_id, Rails.application.config.client_secret,
  #          setup: lambda { |env|
  #            strategy = env['omniauth.strategy']
  #            strategy.options[:client_options].site = Rails.application.config.app_url
  #            strategy.options[:prompt] = 'login'
  #            strategy.options[:oauth_base_uri] = Rails.application.config.authorization_server
  #            strategy.options[:target_account_id] = Rails.application.config.target_account_id
  #            strategy.options[:allow_silent_authentication] = Rails.application.config.allow_silent_authentication
  #          }
  on_failure { |env| AuthenticationsController.action(:failure).call(env) }
end
