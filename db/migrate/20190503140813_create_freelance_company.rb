class CreateFreelanceCompany < ActiveRecord::Migration[5.1]
  def change
    Company.find_or_create_by(domain: 'freelancer.com') do |company|
      company.name = 'freelancer'
      company.website = 'freelancer.com'
      company.phone = '090078601'
      company.email = 'example@freelancer.com'
      company.company_type = 'vendor'
    end
  end
end
