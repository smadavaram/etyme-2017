class ResumeParser

  attr_accessor :resume_url
  API_URL = ENV['rchilli_resume_parser_url']
  USER_ID = ENV['rchilli_user_id']
  USER_KEY = ENV['rchilli_user_key']
  VERSION = "7.0.0"

  def initialize(url)
    @resume_url = url
  end

  def parse
    uri = URI.parse(API_URL)
    body = {
        url: @resume_url,
        userkey: USER_KEY,
        version: VERSION,
        subuserid: USER_ID
    }.to_json
    headers = {
        'Content-Type' => 'application/json',
        'Accept' => "application/json"
    }
    http = Net::HTTP.new(uri.host,uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path,input.to_json,headers)
  end

end