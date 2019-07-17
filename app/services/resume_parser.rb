class ResumeParser

  attr_accessor :resume_url
  API_URL = ENV['rchilli_resume_parser_url']
  USER_ID = ENV['rchilli_user_id']
  USER_KEY = ENV['rchilli_user_key']
  VERSION = "7.0.0"

  def initialize(url)
    @resume_url = url
  end

  def binary_parse
    base64Data = Base64.encode64(open(@resume_url).read)
    uri = URI.parse(API_URL)
    String body = {
        filedata: base64Data,
        filename: @resume_url.split('/').last,
        userkey: USER_KEY,
        version: VERSION,
        subuserid: USER_ID
    }
    headers = {
        'Content-Type' => 'application/json',
        'Accept' => "application/json"
    }
    http = Net::HTTP.new(uri.host,uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path,body.to_json,headers)
  end

  def parse
    uri = URI.parse(API_URL)
    String body = {
        url: @resume_url,
        userkey: USER_KEY,
        version: VERSION,
        subuserid: USER_ID
    }
    headers = {
        'Content-Type' => 'application/json',
        'Accept' => "application/json"
    }
    http = Net::HTTP.new(uri.host,uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path,body.to_json,headers)
  end

end