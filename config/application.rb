require_relative 'boot'

require 'rails/all'

# Require the gems listed in Gemfile, including any gems
# you've limited to :test, :development, or :production.
Bundler.require(*Rails.groups)

module Etyme
  class Application < Rails::Application
    # Initialize configuration defaults for originally generated Rails version.
    config.load_defaults 5.1

    # Settings in config/environments/* take precedence over those specified here.
    # Application configuration should go into files in config/initializers
    # -- all .rb files in that directory are automatically loaded.
    config.active_job.queue_adapter = :delayed_job
    config.filepicker_rails.api_key = ENV['filepicker_api_key'] # "AR0LrQ7ZBRbaL4HN6BMTDz"
    # config.filepicker_rails.api_key = ENV['filepicker_api_key'] || "AR0LrQ7ZBRbaL4HN6BMTDz"
  end
end
