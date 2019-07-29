class DocusignEnvelope

  attr_accessor :plugin

  def initialize(plugin)
    @plugin = plugin
  end

  def refresh_docusign_token
    uri = URI.parse("#{ENV['docusign_authorization_server']}/oauth/token")
    request = Net::HTTP::Post.new(uri)
    request.basic_auth(ENV['docusign_client_id'], ENV['docusign_client_secret'])
    request.set_form_data(
        "grant_type" => "refresh_token",
        "refresh_token" => @plugin.refresh_token
    )
    req_options = {
        use_ssl: uri.scheme == "https"
    }
    response = Net::HTTP.start(uri.hostname, uri.port, req_options) {|http| http.request(request)}
    if response.code == "200"
      response = JSON.parse(response.body)
      @plugin.update(access_token: response.access_token, refresh_token: response.refresh_token, expires_at: response.expires_in)
    else
      response
    end
  end

end