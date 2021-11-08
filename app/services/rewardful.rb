module Rewardful
  require 'net/http'
  require "uri"
    def create_affliate(params)
      url = URI('https://api.getrewardful.com/v1/affiliates')
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      http.verify_mode = OpenSSL::SSL::VERIFY_NONE
      request = Net::HTTP::Post.new(url)
      request['content-type'] = 'application/json'
      request['Authorization'] = "Bearer #{ENV["REWARDFUL_SECRET_KEY"]}"
      data = {
        first_name:  params["first_name"],
        last_name:  params["last_name"],
        email:  params["email"],
      }.to_json
      request.body = data
      response = http.request(request)
      get_token = JSON.parse(response.read_body)["links"].first["token"]
      get_id = JSON.parse(response.read_body)["id"]
      raise JSON.parse(response.read_body) if response.code == '422'
      return {affiliate_id: get_id, affiliate_token: get_token}
    end

    def update_affliate(affiliate_id,status)
      url = URI("https://api.getrewardful.com/v1/affiliates/#{affiliate_id}")
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      # http.verify_mode = OpenSSL::SSL::VERIFY_NONE
      request = Net::HTTP::Put.new(url)
      request['content-type'] = 'application/json'
      request['Authorization'] = "Bearer #{ENV["REWARDFUL_SECRET_KEY"]}"
      data = {
        state: status
      }.to_json
      request.body = data
      response = http.request(request)
      raise JSON.parse(response.read_body) if response.code == '422'
    end


end