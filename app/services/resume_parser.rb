# frozen_string_literal: true

class ResumeParser
  attr_accessor :resume_url
  API_URL = ENV['rchilli_resume_parser_url']
  USER_ID = ENV['rchilli_user_id']
  USER_KEY = ENV['rchilli_user_key']
  VERSION = '7.0.0'

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
      'Accept' => 'application/json'
    }
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path, body.to_json, headers)
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
      'Accept' => 'application/json'
    }
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.verify_mode = OpenSSL::SSL::VERIFY_NONE
    response = http.post(uri.path, body.to_json, headers)
  end

  def sovren_parse
    account_id = ENV['sovren_client_id']
    service_key = ENV['sovren_service_key']
    uri = URI.parse('https://rest.resumeparsing.com/v9/parser/resume')
    request = Net::HTTP::Post.new(uri)
    request.content_type = 'application/json'
    request['Accept'] = 'application/json'
    request['Sovren-Accountid'] = account_id
    request['Sovren-Servicekey'] = service_key
    request.body = {
      "DocumentAsBase64String": Base64.encode64(open(@resume_url).read)
    }.to_json
    req_options = {
      use_ssl: uri.scheme == 'https'
    }
    response = Net::HTTP.start(uri.hostname, uri.port, req_options) do |http|
      http.request(request)
    end
  end
end
