# frozen_string_literal: true

# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the rake db:seed (or created alongside the db with db:setup).
#
# Examples:
#
#   cities = City.create([{ name: 'Chicago' }, { name: 'Copenhagen' }])
#   Mayor.create(name: 'Emanuel', city: cities.first)

Permission.create(name: 'manage_jobs')
Permission.create(name: 'manage_consultants')
Permission.create(name: 'manage_contracts')
Permission.create(name: 'manage_company')
Permission.create(name: 'manage_vendors')
Permission.create(name: 'manage_company_docs')
Permission.create(name: 'send_job_invitations')
Permission.create(name: 'manage_job_invitations')
Permission.create(name: 'manage_job_applications')
Permission.create(name: 'create_new_contracts')
Permission.create(name: 'edit_contracts_terms')
Permission.create(name: 'show_contracts_details')
Permission.create(name: 'show_invoices')
Permission.create(name: 'manage_timesheets')
Permission.create(name: 'manage_leaves')
Permission.create(name: 'reversal_transaction')
Permission.create(name: 'manage_all')

Currency.create(name: 'USD')

# Default Users
user = User.find_by(email: 'hradmin@cloudepa.com')
unless user.present?
  user = User.create(
    first_name: 'Haritha', last_name: 'Lokineni',
    email: 'hradmin@cloudepa.com', type: 'Admin',
    password: 'Hr@dm!n#2021', password_confirmation: 'Hr@dm!n#2021',
    confirmed_at: DateTime.current
  )
end

company = Company.find_by(domain: 'cloudepa')
unless company.present?
  company = Company.create(
    name: 'CloudEPA', website: 'cloudepa.com', domain: 'cloudepa', slug: 'cloudepa',
    logo: 'https://etyme-cdn.sfo2.digitaloceanspaces.com/21-Aug-2019/image_2019_08_21T15_00_47_497Z.png',
    phone: '6097893890', email: 'info@cloudepa.com', company_type: 'vendor', owner: user
  )
end

# Package.create(id: 1, name: "Free",     price: 0.0,   duration: 10000)
# Package.create(id: 2, name: "Basic",    price: 15.0,  duration: 30)
# Package.create(id: 3, name: "Premium",  price: 30.0,  duration: 30)
# Package.create(id: 4, name: "Platinum", price: 60.0,  duration: 30)
# Package.create(id: 5, name: "Monthly",                duration: 30)

AdminUser.create!(email: 'sharath@demoetyme.com', password: 'Adm!n#2@21', password_confirmation: 'Adm!n#2@21') if Rails.env.development?
