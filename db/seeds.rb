# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the rake db:seed (or created alongside the db with db:setup).
#
# Examples:
#
#   cities = City.create([{ name: 'Chicago' }, { name: 'Copenhagen' }])
#   Mayor.create(name: 'Emanuel', city: cities.first)

Permission.create(name: "manage_jobs")
Permission.create(name: "manage_consultants")
Permission.create(name: "manage_contracts")
Permission.create(name: "manage_company")
Permission.create(name: "manage_vendors")
Permission.create(name: "manage_company_docs")
Permission.create(name: "send_job_invitations")
Permission.create(name: "manage_job_invitations")
Permission.create(name: "manage_job_applications")
Permission.create(name: "create_new_contracts")
Permission.create(name: "edit_contracts_terms")
Permission.create(name: "show_contracts_details")
Permission.create(name: "show_invoices")
Permission.create(name: "manage_timesheets")
Permission.create(name: "manage_leaves")
Permission.create(name: "reversal_transaction")



Currency.create(name:"USD")

Company.find_or_create_by(domain: 'freelancer.com') do |company|
    company.name = 'freelancer'
    company.website = 'NO'
    company.phone = '+923206026002'
    company.email = 'info@freelancer.com'
    company.company_type = 'vendor'
end
#
# Package.create(id: 1, name: "Free",     price: 0.0,   duration: 10000)
# Package.create(id: 2, name: "Basic",    price: 15.0,  duration: 30)
# Package.create(id: 3, name: "Premium",  price: 30.0,  duration: 30)
# Package.create(id: 4, name: "Platinum", price: 60.0,  duration: 30)
# Package.create(id: 5, name: "Monthly",                duration: 30)
#
