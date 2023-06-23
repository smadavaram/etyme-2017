require "test_helper"

class ApplicationSystemTestCase < ActionDispatch::SystemTestCase
  # driven_by :selenium, using: :headless_chrome, screen_size: [1400, 1400]
  driven_by :selenium, using: :chrome, options: { args: ["headless", "disable-gpu", "no-sandbox", "disable-dev-shm-usage"] }

  Capybara.register_driver :selenium do |app|
    client = Selenium::WebDriver::Remote::Http::Default.new
    client.read_timeout = 120 # seconds
    Capybara::Selenium::Driver.new(app, browser: :chrome, http_client: client)
  end
  Capybara.server_boot_timeout = 120 # seconds
  Capybara.default_max_wait_time = 10 # seconds
  Capybara.server = :webrick
end
