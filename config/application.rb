# frozen_string_literal: true

require_relative 'boot'

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Etyme
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 5.1

    config.app_url = ENV['docusign_app_url']

    config.client_id = ENV['docusign_client_id']
    config.client_secret = ENV['docusign_client_secret']

    config.zoom_client_id = ENV['zoom_client_id']
    config.zoom_client_secret = ENV['zoom_client_secret']

    config.authorization_server = ENV['docusign_authorization_server']
    config.zoom_authorization_server = ENV['zoom_authorization_server']

    config.allow_silent_authentication = true # a user can be silently authenticated if they have an
    # active login session on another tab of the same browser
    # Set if you want a specific DocuSign AccountId, If false, the user's default account will be used.
    config.target_account_id = true

    # Settings in config/environments/* take precedence over those specified here.
    # Application configuration should go into files in config/initializers
    # -- all .rb files in that directory are automatically loaded.
    config.active_job.queue_adapter = :delayed_job
    config.filepicker_rails.api_key = ENV['filepicker_api_key'] # "AR0LrQ7ZBRbaL4HN6BMTDz"
    # config.filepicker_rails.api_key = ENV['filepicker_api_key'] || "AR0LrQ7ZBRbaL4HN6BMTDz"

    # cors configuration
    config.middleware.insert_before 0, Rack::Cors do
      allow do
        origins '*'
        resource '*', headers: :any, methods: %i[get post put options]
      end
    end
  end
end
