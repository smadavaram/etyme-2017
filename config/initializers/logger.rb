if Rails.env.production?
  Rails.logger = ActiveSupport::Logger.new("log/#{Rails.env}.log")
end
