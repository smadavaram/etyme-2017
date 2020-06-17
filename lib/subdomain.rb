# frozen_string_literal: true

class Subdomain
  def self.matches?(request)
    request.subdomain.present? && request.subdomain != 'www' && request.subdomain != 'app'
  end
end
