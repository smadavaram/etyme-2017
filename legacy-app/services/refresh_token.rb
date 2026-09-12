# frozen_string_literal: true

class RefreshToken
  attr_accessor :plugin

  def initialize(plugin)
    @plugin = plugin

  end

  def refresh_docusign_token
    current_time = Time.now.utc

    header = { 
      typ: 'JWT', 
      alg: 'RS256'
    }

    body = {
      "iss"=> "#{ENV['docusign_client_id']}",
      "sub"=> "#{ENV['docusign_user_id']}",
      "iat"=> current_time.to_i,
      "exp"=> (current_time + 1.hour).to_i,
      "aud"=> "account-d.docusign.com",
      "scope"=> "signature impersonation"
    }

    file        = docusign_rsa_private_key_file
    file_key    = File.read(file)
    private_key = OpenSSL::PKey::RSA.new(file_key)

    token = JWT.encode(body, private_key, 'RS256')

    uri = 'https://account-d.docusign.com/oauth/token'
    data = {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token 
    }
    
    auth_headers = {content_type: 'application/x-www-form-urlencoded'}


    begin
      response = RestClient.post(uri, data, auth_headers)
      response = JSON.parse(response.body)
      @plugin.update(access_token: response['access_token'], refresh_token: token, expires_at: response['expires_in'])
    rescue 
      false
    end
  end
  def docusign_rsa_private_key_file
    File.join(Rails.root, 'config', 'jwt_docusign.text')
  end
end
