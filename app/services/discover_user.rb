class DiscoverUser

  def discover_user(email)
    user = discover_company_and_user(Mail::Address.new(email).domain, email)
    unless user.persisted?
      user.save!
      user.send_password_reset_email if user.class.to_s == 'User'
      user.company.update(owner_id: user.id) unless user.company.owner.present?
    end
    user
  end

  def discover_company_and_user(website, email)
    domain = website.split('.').first
    company = Company.where(domain: domain).first_or_initialize(name: domain, website: website)
    user = nil
    if company.persisted?
      user = User.where(email: email).first_or_initialize(password_hash.merge(company: company))
    else
      user = Admin.where(email: email).first_or_initialize(password_hash.merge(company: company)) if company.save!
    end
    user
  end

  def password_hash
    password = SecureRandom.hex(10)
    { password: password, password_confirmation: password }
  end

  def discover_candidate(email)
    candidate = Candidate.where(email: email).first_or_initialize(password_hash.merge(first_name: 'New', last_name: 'Candidate'))
    candidate.persisted? ? candidate : candidate.save!
    candidate
  end

end