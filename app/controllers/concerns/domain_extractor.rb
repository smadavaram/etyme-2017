module DomainExtractor

  extend ActiveSupport::Concern

  included do
    private def domain_from_email(email)
      if email
        Mail::Address.new(email).domain
      end
    end

    private def get_domain_from_email(email)
      if email
        Mail::Address.new(email).domain.split('.')[0]
      end
    end

    private def domain_name(email)
      if email
        domain_from_email(email).split(".").first
      end
    end

    private def valid_email(email)
      if valid_email?(email)
        domain_from_email(email)
      end
    end

    private def valid_email?(email)
      domain_from_email(email).present?
    end
  end

end
