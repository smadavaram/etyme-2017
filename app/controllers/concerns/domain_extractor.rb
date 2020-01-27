module DomainExtractor

  extend ActiveSupport::Concern

  included do

    private

    def domain_from_email(email = nil)
      Mail::Address.new(email).domain
    end

    def get_domain_from_email(email = nil)
      Mail::Address.new(email).domain.to_s.split('.')[0]
    end

    def domain_name(email)
      if email
        domain_from_email(email).split(".").first
      end
    end

    def valid_email(email)
      if valid_email?(email)
        domain_from_email(email)
      end
    end

    def valid_email?(email)
      domain_from_email(email).present?
    end

    def email_public_domain?(email)
      email.present? && Company::EXCLUDED_DOMAINS.include?(domain_from_email email)
    end
  end

end
