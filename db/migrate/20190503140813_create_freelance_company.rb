class CreateFreelanceCompany < ActiveRecord::Migration[5.1]
  def change
    Company.find_or_create_by(domain: 'freelancer.com') do |company|
      company.name = 'freelancer'
      company.website = 'NO'
      company.phone = '+923206026002'
      company.email = 'info@freelancer.com'
      company.company_type = 'vendor'
    end
  end
end
