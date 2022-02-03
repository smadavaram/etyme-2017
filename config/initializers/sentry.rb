Sentry.init do |config|
  config.dsn = 'https://87650277c18a47b897ca3e64aca10ba8@o1134798.ingest.sentry.io/6183031'
  config.breadcrumbs_logger = [:active_support_logger, :http_logger]

  # Set tracesSampleRate to 1.0 to capture 100%
  # of transactions for performance monitoring.
  # We recommend adjusting this value in production
  config.traces_sample_rate = 1.0
  # or
  config.traces_sampler = lambda do |context|
    true
  end
end