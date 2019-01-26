module DomainExtractor

  extend ActiveSupport::Concern

  included do
    private def domain_from_email(email)
      if email
        Mail::Address.new(email).domain
      end
    end
  end

end
