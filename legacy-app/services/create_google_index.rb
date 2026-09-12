# frozen_string_literal: true

class CreateGoogleIndex
  attr_reader :job
  attr_reader :type
  delegate :url_helpers, to: 'Rails.application.routes'
  SCOPE = %w[https://www.googleapis.com/auth/indexing].freeze
  PRIVATE_KEY = ENV['GOOGLE_APPLICATION_CREDENTIALS']
  INDEX_URL = 'https://indexing.googleapis.com/v3/urlNotifications:publish'

  # constructor
  def initialize(job, type)
    @job = job
    @type = type
  end

  def index_job
    response = initiate_request(authorizer['access_token'])
    @job.update(is_indexed: true) if response.code.to_i == 200
    puts(response.body)
  end

  private

  def initiate_request(access_token)
    url = URI.parse(INDEX_URL)
    http = Net::HTTP.new(url.host, url.port)
    http.use_ssl = true
    req = Net::HTTP::Post.new(url.request_uri)
    req['Content-Type'] = 'application/json'
    req['Authorization'] = "Bearer #{access_token}"
    req.body = {
      "url": "https://etyme.com/static/jobs/#{@job.id}",
      "type": @type
    }.to_json
    http.request(req)
  end

  def authorizer
    authorizer = Google::Auth::ServiceAccountCredentials.make_creds(
      json_key_io: File.open(PRIVATE_KEY),
      scope: SCOPE
    )
    authorizer.fetch_access_token!
  end
end
