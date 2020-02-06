# frozen_string_literal: true

# This file is used by Rack-based servers to start the application.

require ::File.expand_path('../config/environment', __FILE__)
run Rails.application
PhusionPassenger.advertised_concurrency_level = 0 if defined?(PhusionPassenger)
