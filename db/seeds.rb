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

