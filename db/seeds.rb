# This file should contain all the record creation needed to seed the database with its default values.
# The data can then be loaded with the rake db:seed (or created alongside the db with db:setup).
#
# Examples:
#
#   cities = City.create([{ name: 'Chicago' }, { name: 'Copenhagen' }])
#   Mayor.create(name: 'Emanuel', city: cities.first)

Permission.create(name: "manage_jobs")
Permission.create(name: "manage_consultants")
Permission.create(name: "manage_all_consultants")
Permission.create(name: "manage_company")
Permission.create(name: "manage_vendors")
Permission.create(name: "manage_company_docs")

Package.create(id: 1, name: "Free",     price: 0.0,   duration: 10000)
Package.create(id: 2, name: "Basic",    price: 15.0,  duration: 30)
Package.create(id: 3, name: "Premium",  price: 30.0,  duration: 30)
Package.create(id: 4, name: "Platinum", price: 60.0,  duration: 30)
Package.create(id: 5, name: "Monthly",                duration: 30)

